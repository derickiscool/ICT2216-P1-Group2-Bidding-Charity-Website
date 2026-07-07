import { sendMail } from '../utils/mailer';

const devOtpOutbox = new Map<string, string>();
const devResetTokenOutbox = new Map<string, string>();
const devEmailChangeOtpOutbox = new Map<string, string>();

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
    await sendMail({
      to: email,
      subject: 'BidForGood — Your verification code',
      body: `Hello,\n\nYour BidForGood email verification code is:\n\n    ${otp}\n\nThis code expires in 3 minutes.\n\nIf you did not request this, you can safely ignore this message.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  }
};

export const sendLoginOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    await sendMail({
      to: email,
      subject: 'BidForGood — Your login code',
      body: `Hello,\n\nYour BidForGood login code is:\n\n    ${otp}\n\nThis code expires in 3 minutes.\n\nIf you did not request this, you can safely ignore this message.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  } else {
    devOtpOutbox.set(email, otp);
    console.info(`[BidForGood DEV LOGIN OTP] email=${email} otp=${otp}`);
    await sendMail({
      to: email,
      subject: 'BidForGood — Your login code',
      body: `Hello,\n\nYour BidForGood login code is:\n\n    ${otp}\n\nThis code expires in 3 minutes.\n\nIf you did not request this, you can safely ignore this message.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  }
};

export const sendPasswordResetOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    await sendMail({
      to: email,
      subject: 'BidForGood — Your password reset code',
      body: `Hello,\n\nYour BidForGood password reset code is:\n\n    ${otp}\n\nThis code expires in 3 minutes.\n\nIf you did not request this, you can safely ignore this message.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  } else {
    devResetTokenOutbox.set(email, otp);
    console.log('========================================');
    console.log('  PASSWORD RESET OTP');
    console.log(`  email : ${email}`);
    console.log(`  otp   : ${otp}`);
    console.log('========================================');
    await sendMail({
      to: email,
      subject: 'BidForGood — Your password reset code',
      body: `Hello,\n\nYour BidForGood password reset code is:\n\n    ${otp}\n\nThis code expires in 3 minutes.\n\nIf you did not request this, you can safely ignore this message.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  }
};

// SFR03 — OTP sent to the NEW address to prove the user controls it.
export const sendEmailChangeOtp = async (newEmail: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    devEmailChangeOtpOutbox.set(newEmail, otp);
    console.log('========================================');
    console.log('  EMAIL CHANGE OTP (new address)');
    console.log(`  email : ${newEmail}`);
    console.log(`  otp   : ${otp}`);
    console.log('========================================');
  }
};

// SFR03 — OTP sent to the CURRENT address; doubles as the change notification so the
// legitimate owner can catch an unexpected change before it takes effect.
export const sendEmailChangeConfirmOtp = async (oldEmail: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    devEmailChangeOtpOutbox.set(oldEmail, otp);
    console.log('========================================');
    console.log('  EMAIL CHANGE OTP (current address)');
    console.log(`  email : ${oldEmail}`);
    console.log(`  otp   : ${otp}`);
    console.log('========================================');
  }
};

export const readDevEmailChangeOtpForTest = (email: string): string | undefined => {
  if (process.env.NODE_ENV === 'production') return undefined;
  return devEmailChangeOtpOutbox.get(email);
};

export const clearDevEmailChangeOtpForTest = (email?: string): void => {
  if (email) devEmailChangeOtpOutbox.delete(email);
  else devEmailChangeOtpOutbox.clear();
};

export const readDevResetTokenForTest = (email: string): string | undefined => {
  if (process.env.NODE_ENV === 'production') return undefined;
  return devResetTokenOutbox.get(email);
};

export const clearDevResetTokenForTest = (email?: string): void => {
  if (email) devResetTokenOutbox.delete(email);
  else devResetTokenOutbox.clear();
};

export const readDevOtpForTest = (email: string): string | undefined => {
  if (process.env.NODE_ENV === 'production') return undefined;
  return devOtpOutbox.get(email);
};

export const clearDevOtpForTest = (email?: string): void => {
  if (email) devOtpOutbox.delete(email);
  else devOtpOutbox.clear();
};
