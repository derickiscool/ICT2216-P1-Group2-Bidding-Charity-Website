const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const BUFFER_MAGIC = Buffer.from('BFGENC1');
const TEXT_PREFIX = 'bfgenc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const ENCRYPTED_NUMERIC_SENTINEL = '0.01';

const getEncryptionKey = () => {
  const configured = process.env.DATA_ENCRYPTION_KEY;
  if (!configured) throw new Error('DATA_ENCRYPTION_KEY must be configured before securing stored data.');

  const trimmed = configured.trim();
  const candidates = [];
  if (/^[0-9a-f]{64}$/i.test(trimmed)) candidates.push(Buffer.from(trimmed, 'hex'));
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) candidates.push(Buffer.from(trimmed, 'base64'));
  candidates.push(Buffer.from(trimmed, 'utf8'));

  const key = candidates.find(candidate => candidate.length === KEY_BYTES);
  if (!key) throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM.');
  return key;
};

const isEncryptedBuffer = value =>
  Buffer.isBuffer(value) && value.length > BUFFER_MAGIC.length && value.subarray(0, BUFFER_MAGIC.length).equals(BUFFER_MAGIC);

const encryptBuffer = plain => {
  if (isEncryptedBuffer(plain)) return plain;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BUFFER_MAGIC, iv, tag, ciphertext]);
};

const decryptBuffer = stored => {
  if (!isEncryptedBuffer(stored)) return stored;
  const ivStart = BUFFER_MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  const iv = stored.subarray(ivStart, tagStart);
  const tag = stored.subarray(tagStart, ciphertextStart);
  const ciphertext = stored.subarray(ciphertextStart);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

const isEncryptedText = value => typeof value === 'string' && value.startsWith(TEXT_PREFIX);
const encryptText = plain => {
  const text = String(plain ?? '');
  if (isEncryptedText(text)) return text;
  return `${TEXT_PREFIX}${encryptBuffer(Buffer.from(text, 'utf8')).toString('base64')}`;
};
const decryptText = stored => {
  if (!isEncryptedText(stored)) return String(stored ?? '');
  return decryptBuffer(Buffer.from(stored.slice(TEXT_PREFIX.length), 'base64')).toString('utf8');
};
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const hashedPaymentRef = value => `bfgref:${sha256(String(value))}`;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'bidforgood',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

const securePayments = async client => {
  const { rows } = await client.query('SELECT id, amount::text AS amount, amount_encrypted, payment_ref, payment_ref_encrypted FROM payments');
  for (const row of rows) {
    const clearAmount = isEncryptedText(row.amount_encrypted) ? decryptText(row.amount_encrypted) : row.amount;
    const clearPaymentRef = isEncryptedText(row.payment_ref_encrypted)
      ? decryptText(row.payment_ref_encrypted)
      : String(row.payment_ref).startsWith('bfgref:')
        ? row.payment_ref
        : row.payment_ref;
    const encryptedAmount = isEncryptedText(row.amount_encrypted) ? row.amount_encrypted : encryptText(clearAmount);
    const encryptedPaymentRef = isEncryptedText(row.payment_ref_encrypted) ? row.payment_ref_encrypted : encryptText(clearPaymentRef);
    const storedPaymentRef = String(row.payment_ref).startsWith('bfgref:') ? row.payment_ref : hashedPaymentRef(clearPaymentRef);

    await client.query(
      `UPDATE payments
       SET amount = $2, amount_encrypted = $3, payment_ref = $4, payment_ref_encrypted = $5
       WHERE id = $1`,
      [row.id, ENCRYPTED_NUMERIC_SENTINEL, encryptedAmount, storedPaymentRef, encryptedPaymentRef],
    );
  }
  return rows.length;
};

const secureReceipts = async client => {
  const { rows } = await client.query(
    `SELECT id, item_title, amount::text AS amount, amount_encrypted, charity_name, bidder_username, payment_ref
     FROM receipts`,
  );
  for (const row of rows) {
    const clearAmount = isEncryptedText(row.amount_encrypted) ? decryptText(row.amount_encrypted) : row.amount;
    await client.query(
      `UPDATE receipts
       SET item_title = $2, amount = $3, amount_encrypted = $4, charity_name = $5, bidder_username = $6, payment_ref = $7
       WHERE id = $1`,
      [
        row.id,
        encryptText(row.item_title),
        ENCRYPTED_NUMERIC_SENTINEL,
        isEncryptedText(row.amount_encrypted) ? row.amount_encrypted : encryptText(clearAmount),
        encryptText(row.charity_name),
        encryptText(row.bidder_username),
        encryptText(row.payment_ref),
      ],
    );
  }
  return rows.length;
};

const secureDeliveries = async client => {
  const { rows } = await client.query('SELECT id, tracking_number, courier FROM deliveries');
  for (const row of rows) {
    await client.query(
      `UPDATE deliveries
       SET tracking_number = $2, courier = $3
       WHERE id = $1`,
      [
        row.id,
        row.tracking_number ? encryptText(row.tracking_number) : null,
        row.courier ? encryptText(row.courier) : null,
      ],
    );
  }
  return rows.length;
};

const secureShippingVerifications = async client => {
  const exists = await client.query("SELECT to_regclass('public.shipping_verifications') AS table_name");
  if (!exists.rows[0]?.table_name) return 0;

  const { rows } = await client.query('SELECT id, tracking_number, carrier, notes FROM shipping_verifications');
  for (const row of rows) {
    await client.query(
      `UPDATE shipping_verifications
       SET tracking_number = $2, carrier = $3, notes = $4
       WHERE id = $1`,
      [
        row.id,
        encryptText(row.tracking_number),
        encryptText(row.carrier),
        row.notes ? encryptText(row.notes) : '',
      ],
    );
  }
  return rows.length;
};

const secureFileAndImageData = async client => {
  let touched = 0;

  for (const { rows, table, column } of [
    { table: 'charities', column: 'document_data', rows: (await client.query('SELECT id, document_data FROM charities WHERE document_data IS NOT NULL')).rows },
    { table: 'campaigns', column: 'image_data', rows: (await client.query('SELECT id, image_data FROM campaigns WHERE image_data IS NOT NULL')).rows },
  ]) {
    for (const row of rows) {
      const data = row[column];
      if (!isEncryptedBuffer(data)) {
        await client.query(`UPDATE ${table} SET ${column} = $2 WHERE id = $1`, [row.id, encryptBuffer(data)]);
        touched += 1;
      }
    }
  }

  const { rows: listings } = await client.query('SELECT id, images FROM listings WHERE array_length(images, 1) IS NOT NULL');
  for (const row of listings) {
    const images = Array.isArray(row.images) ? row.images : [];
    const encryptedImages = images.map(image => encryptText(image));
    if (JSON.stringify(images) !== JSON.stringify(encryptedImages)) {
      await client.query('UPDATE listings SET images = $2 WHERE id = $1', [row.id, encryptedImages]);
      touched += 1;
    }
  }

  return touched;
};

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payments = await securePayments(client);
    const receipts = await secureReceipts(client);
    const deliveries = await secureDeliveries(client);
    const shippingVerifications = await secureShippingVerifications(client);
    const files = await secureFileAndImageData(client);
    await client.query('COMMIT');
    console.log(`Secured stored data: payments=${payments}, receipts=${receipts}, deliveries=${deliveries}, shipping_verifications=${shippingVerifications}, file/image rows=${files}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

if (require.main === module) {
  run().catch(error => {
    console.error('Securing stored data failed:', error);
    process.exit(1);
  });
}

module.exports = { run };
