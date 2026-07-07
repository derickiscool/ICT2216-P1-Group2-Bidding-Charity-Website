const devOtpOutbox = new Map<string, string>();
const devResetTokenOutbox = new Map<string, string>();
const devEmailChangeOtpOutbox = new Map<string, string>();

export const sendRegistrationOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    devOtpOutbox.set(email, otp);
    console.info(`[BidForGood DEV OTP] otp=${otp}`);
  }
};

export const sendLoginOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    devOtpOutbox.set(email, otp);
    console.info(`[BidForGood DEV LOGIN OTP] email=${email} otp=${otp}`);
  }
};

export const sendPasswordResetOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    devResetTokenOutbox.set(email, otp);
    console.log('========================================');
    console.log('  PASSWORD RESET OTP');
    console.log(`  email : ${email}`);
    console.log(`  otp   : ${otp}`);
    console.log('========================================');
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
