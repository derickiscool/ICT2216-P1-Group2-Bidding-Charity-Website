import { sendMail } from '../utils/mailer';

const devOtpOutbox = new Map<string, string>();
const devResetTokenOutbox = new Map<string, string>();

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
  if (process.env.NODE_ENV !== 'production') {
    devOtpOutbox.set(email, otp);
    console.info(`[BidForGood DEV LOGIN OTP] email=${email} otp=${otp}`);
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
