import { sendMail } from '../utils/mailer';

const devOtpOutbox = new Map<string, string>();
const devResetTokenOutbox = new Map<string, string>();
const devEmailChangeOtpOutbox = new Map<string, string>();
const devPasswordChangeOtpOutbox = new Map<string, string>();

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


export const sendPasswordChangeVerificationOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    await sendMail({
      to: email,
      subject: 'BidForGood — Confirm your password change',
      body: `Hello,

A request was made to change the password on your BidForGood account.

Your password change verification code is:

    ${otp}

This code expires in 15 minutes.

If you did not request this, please ignore this message and consider reviewing your account security.

— The BidForGood Team
noreply@bidforgood.xyz`,
    });
  } else {
    devPasswordChangeOtpOutbox.set(email, otp);
    await sendMail({
      to: email,
      subject: 'BidForGood — Confirm your password change',
      body: `Hello,

A request was made to change the password on your BidForGood account.

Your password change verification code is:

    ${otp}

This code expires in 15 minutes.

If you did not request this, please ignore this message and consider reviewing your account security.

— The BidForGood Team
noreply@bidforgood.xyz`,
    });
  }
};

// SFR03 — OTP sent to the NEW address to prove the user controls it.
export const sendEmailChangeOtp = async (newEmail: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    await sendMail({
      to: newEmail,
      subject: 'BidForGood — Verify your new email address',
      body: `Hello,\n\nYou requested to change the email address on your BidForGood account.\n\nYour verification code for your new email address is:\n\n    ${otp}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, you can safely ignore this message.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  } else {
    devEmailChangeOtpOutbox.set(newEmail, otp);
    console.log('========================================');
    console.log('  EMAIL CHANGE OTP (new address)');
    console.log(`  email : ${newEmail}`);
    console.log(`  otp   : ${otp}`);
    console.log('========================================');
    await sendMail({
      to: newEmail,
      subject: 'BidForGood — Verify your new email address',
      body: `Hello,\n\nYou requested to change the email address on your BidForGood account.\n\nYour verification code for your new email address is:\n\n    ${otp}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, you can safely ignore this message.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  }
};

// SFR03 — OTP sent to the CURRENT address; doubles as the change notification so the
// legitimate owner can catch an unexpected change before it takes effect.
export const sendEmailChangeConfirmOtp = async (oldEmail: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    await sendMail({
      to: oldEmail,
      subject: 'BidForGood — Confirm your email change',
      body: `Hello,\n\nA request was made to change the email address on your BidForGood account.\n\nTo confirm this change, enter the verification code below:\n\n    ${otp}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this message and consider changing your password, as someone may be trying to access your account.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
  } else {
    devEmailChangeOtpOutbox.set(oldEmail, otp);
    console.log('========================================');
    console.log('  EMAIL CHANGE OTP (current address)');
    console.log(`  email : ${oldEmail}`);
    console.log(`  otp   : ${otp}`);
    console.log('========================================');
    await sendMail({
      to: oldEmail,
      subject: 'BidForGood — Confirm your email change',
      body: `Hello,\n\nA request was made to change the email address on your BidForGood account.\n\nTo confirm this change, enter the verification code below:\n\n    ${otp}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, please ignore this message and consider changing your password, as someone may be trying to access your account.\n\n— The BidForGood Team\nnoreply@bidforgood.xyz`,
    });
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


export const readDevPasswordChangeOtpForTest = (email: string): string | undefined => {
  if (process.env.NODE_ENV === 'production') return undefined;
  return devPasswordChangeOtpOutbox.get(email);
};

export const clearDevPasswordChangeOtpForTest = (email?: string): void => {
  if (email) devPasswordChangeOtpOutbox.delete(email);
  else devPasswordChangeOtpOutbox.clear();
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
