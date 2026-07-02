/**
 * SMTP2GO relay delivery — DKIM-signs and submits a single message per
 * call. Derived from the proven one-shot relay_send.ts (see archive/),
 * parameterized so the HTTP layer can call it once per request instead
 * of once at process startup.
 */

import * as net from "net";
import * as tls from "tls";
import * as crypto from "crypto";
import * as fs from "fs";
import path from "path";

interface MessageHeaders {
  from: string;
  to: string;
  subject: string;
  date: string;
  "content-type": string;
}

interface SmtpSession {
  read: () => Promise<string>;
  send: (command: string, display?: string) => Promise<string>;
}

interface RelayConfig {
  host: string;
  port: number;
  localPort: number;
  user: string;
  pass: string;
  ehloName: string;
  from: string;
}

interface DkimConfig {
  enabled: boolean;
  privateKeyPath: string;
  domain: string;
  selector: string;
}

export interface SendParams {
  to: string;
  subject: string;
  body: string;
}

export interface SendResult {
  messageId: string;
}

/** SMTP-level rejection (4xx/5xx, auth failure, bad greeting) — retrying won't help. */
export class RelayError extends Error {}

function signDkim(
  { privateKeyPath, domain, selector }: DkimConfig,
  headers: MessageHeaders,
  body: string
): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");

  const canonicalBody =
    body
      .replace(/\r\n[\t ]+/g, " ")
      .replace(/[\t ]+$/gm, "")
      .replace(/(\r\n)+$/, "") + "\r\n";

  const bodyHash = crypto
    .createHash("sha256")
    .update(canonicalBody)
    .digest("base64");

  const signedHeaderNames: (keyof MessageHeaders)[] = [
    "from", "to", "subject", "date", "content-type",
  ];

  const canonicalHeaders = signedHeaderNames
    .map(name => `${name}:${headers[name].replace(/\s+/g, " ").trim()}`)
    .join("\r\n");

  const dkimStub =
    `dkim-signature:v=1; a=rsa-sha256; c=relaxed/relaxed;` +
    ` d=${domain}; s=${selector};` +
    ` h=${signedHeaderNames.join(":")};` +
    ` bh=${bodyHash}; b=`;

  const signingInput = canonicalHeaders + "\r\n" + dkimStub;

  const signature = crypto
    .createSign("SHA256")
    .update(signingInput)
    .sign(privateKey, "base64");

  return (
    `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;` +
    ` d=${domain}; s=${selector};` +
    ` h=${signedHeaderNames.join(":")};` +
    ` bh=${bodyHash}; b=${signature}`
  );
}

function createSmtpSession(socket: net.Socket | tls.TLSSocket): SmtpSession {
  let buffer = "";
  let resolver: ((value: string) => void) | null = null;
  let rejecter: ((reason: Error) => void) | null = null;

  socket.setEncoding("utf8");

  function isComplete(data: string): boolean {
    const lines = data.split("\r\n").filter(Boolean);
    const last = lines[lines.length - 1];
    return /^\d{3} /.test(last);
  }

  function settle(response: string): void {
    const res = resolver;
    resolver = null;
    rejecter = null;
    res!(response);
  }

  socket.on("data", (chunk: string) => {
    buffer += chunk;
    if (resolver && isComplete(buffer)) {
      settle(buffer);
      buffer = "";
    }
  });

  socket.on("close", () => {
    if (rejecter) rejecter(new Error("Socket closed unexpectedly"));
  });
  socket.on("error", (err: Error) => {
    if (rejecter) rejecter(err);
  });

  function read(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (buffer && isComplete(buffer)) {
        const response = buffer;
        buffer = "";
        resolve(response);
        return;
      }
      resolver = resolve;
      rejecter = reject;
    });
  }

  async function send(command: string, display: string = command): Promise<string> {
    console.log(`>>> ${display}`);
    socket.write(command + "\r\n");
    const response = await read();
    console.log(`<<< ${response.trim()}`);
    return response;
  }

  return { read, send };
}

// Implicit TLS (SMTPS-style) — the socket is encrypted from the first byte,
// so there's no cleartext window before the greeting and nothing for a
// STARTTLS-stripping attacker to intercept or downgrade.
function connectTls(host: string, port: number, localPort?: number, timeoutMs = 15000): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    // rejectUnauthorized: false — SMTP2GO relay presents a shared-hostname certificate;
    // true would require explicit CA pinning for mail.smtp2go.com.
    // @types/node's ConnectionOptions omits localPort, though tls.connect forwards it to net.connect() at runtime.
    const options: tls.ConnectionOptions & { localPort?: number } = { localPort, servername: host, rejectUnauthorized: false };
    const socket = tls.connect(port, host, options);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connect to ${host}:${port} timed out`));
    }, timeoutMs);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Dot-stuffing per RFC 5321 4.5.2 — a body line that is just "." would
// otherwise be read as the end-of-DATA marker
function dotStuff(body: string): string {
  return body
    .split("\r\n")
    .map(line => (line.startsWith(".") ? "." + line : line))
    .join("\r\n");
}

async function attemptDelivery(relay: RelayConfig, dkim: DkimConfig, params: SendParams): Promise<SendResult> {
  const { host, port, localPort, user, pass, ehloName, from } = relay;
  const { to, subject, body } = params;

  const messageId = `<${crypto.randomUUID()}@${dkim.domain}>`;

  const headers: MessageHeaders = {
    from,
    to,
    subject,
    date: new Date().toUTCString(),
    "content-type": "text/plain; charset=utf-8",
  };

  const extraHeaders: string[] = [`Message-ID: ${messageId}`];
  if (dkim.enabled) {
    extraHeaders.push(signDkim(dkim, headers, body));
  }

  const message = [
    `From: ${headers.from}`,
    `To: ${headers.to}`,
    `Subject: ${headers.subject}`,
    `Date: ${headers.date}`,
    `Content-Type: ${headers["content-type"]}`,
    ...extraHeaders,
    ``,
    dotStuff(body),
    `.`,
  ].join("\r\n");

  console.log(`[mailer] connecting to ${host}:${port} (implicit TLS) from local port ${localPort}`);
  const activeSocket = await connectTls(host, port, localPort);
  console.log(`[mailer] TLS connected, waiting for greeting`);

  try {
    const smtp = createSmtpSession(activeSocket);

    const greeting = await smtp.read();
    console.log(`[mailer] <<< ${greeting.trim()}`);
    if (!greeting.startsWith("220")) {
      throw new RelayError(`Unexpected greeting: ${greeting.trim()}`);
    }

    await smtp.send(`EHLO ${ehloName}`);

    const authPayload = Buffer.from(`\0${user}\0${pass}`).toString("base64");
    const authResponse = await smtp.send(`AUTH PLAIN ${authPayload}`, "AUTH PLAIN ****");
    if (!authResponse.startsWith("235")) {
      throw new RelayError(`Authentication failed: ${authResponse.trim()}`);
    }

    await smtp.send(`MAIL FROM:<${from}>`);
    const rcptResponse = await smtp.send(`RCPT TO:<${to}>`);
    if (!rcptResponse.startsWith("250")) {
      throw new RelayError(`RCPT TO rejected: ${rcptResponse.trim()}`);
    }

    const dataResponse = await smtp.send("DATA");
    if (!dataResponse.startsWith("354")) {
      throw new RelayError(`DATA rejected: ${dataResponse.trim()}`);
    }

    console.log(">>> <message body>");
    activeSocket.write(message + "\r\n");
    const finalResponse = await smtp.read();
    console.log(`<<< ${finalResponse.trim()}`);
    if (!finalResponse.startsWith("250")) {
      throw new RelayError(`DATA failed: ${finalResponse.trim()}`);
    }

    await smtp.send("QUIT");
    return { messageId };
  } finally {
    activeSocket.destroy();
  }
}

/**
 * One bounded retry for connection-level failures only (timeout, ECONNRESET,
 * etc.) — an SMTP-level rejection (RelayError) is thrown straight through,
 * since retrying a 5xx/auth failure won't change the outcome.
 */
async function deliverViaRelay(relay: RelayConfig, dkim: DkimConfig, params: SendParams): Promise<SendResult> {
  try {
    return await attemptDelivery(relay, dkim, params);
  } catch (err) {
    if (err instanceof RelayError) throw err;
    return await attemptDelivery(relay, dkim, params);
  }
}

/**
 * Reads relay/DKIM config from the environment. Called lazily per send (not
 * at module load) so importing this module never fails in dev/test where
 * SMTP credentials aren't set — only production calls into this.
 */
function buildMailConfig(): { relay: RelayConfig; dkim: DkimConfig } {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SMTP2GO_USER || !process.env.SMTP2GO_PASS) {
      throw new Error('SMTP2GO_USER and SMTP2GO_PASS are required in production');
    }
    if (!process.env.DKIM_PRIVATE_KEY_PATH) {
      throw new Error('DKIM_PRIVATE_KEY_PATH is required in production');
    }
  }

  const relay: RelayConfig = {
    host: process.env.SMTP2GO_HOST || 'mail.smtp2go.com',
    port: parseInt(process.env.SMTP2GO_PORT || '465', 10),
    localPort: parseInt(process.env.SMTP2GO_LOCAL_PORT || '8888', 10),
    user: process.env.SMTP2GO_USER || '',
    pass: process.env.SMTP2GO_PASS || '',
    ehloName: process.env.MAIL_EHLO_NAME || 'bidforgood.xyz',
    from: process.env.MAIL_FROM_ADDRESS || 'noreply@bidforgood.xyz',
  };

  const dkim: DkimConfig = {
    enabled: true,
    privateKeyPath: process.env.DKIM_PRIVATE_KEY_PATH
      ? path.resolve(process.env.DKIM_PRIVATE_KEY_PATH)
      : '',
    domain: process.env.DKIM_DOMAIN || 'bidforgood.xyz',
    selector: process.env.DKIM_SELECTOR || 'mail',
  };

  return { relay, dkim };
}

export async function sendMail(params: SendParams): Promise<void> {
  const { relay, dkim } = buildMailConfig();
  await deliverViaRelay(relay, dkim, params);
}
