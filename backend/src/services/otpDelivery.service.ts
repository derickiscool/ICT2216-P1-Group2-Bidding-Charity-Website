import { sendMail } from '../utils/mailer';

const devOtpOutbox = new Map<string, string>();

/**
 * Production sends the OTP via the SMTP relay in mailer.ts.
 * Dev/test stores it in an in-memory outbox instead.
 * The OTP is never returned by API responses.
 */
export const sendRegistrationOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    await sendMail({
      to: email,
      subject: 'BidForGood — Your verification code',
      body: `Hello,\n\nYour BidForGood email verification code is:\n\n    ${otp}\n\nThis code expires in 3 minutes.\n\nIf you did not request this, you can safely ignore this message.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  } else {
    devOtpOutbox.set(email, otp);
    console.info(`[BidForGood DEV OTP] otp=${otp}`);
  }
};

export const readDevOtpForTest = (email: string): string | undefined => {
  if (process.env.NODE_ENV === 'production') return undefined;
  return devOtpOutbox.get(email);
};

export const clearDevOtpForTest = (email?: string): void => {
  if (email) devOtpOutbox.delete(email);
  else devOtpOutbox.clear();
};
