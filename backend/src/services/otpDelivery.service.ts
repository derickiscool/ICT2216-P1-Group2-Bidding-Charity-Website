const devOtpOutbox = new Map<string, string>();
const devResetTokenOutbox = new Map<string, string>();

export const sendRegistrationOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
    devOtpOutbox.set(email, otp);
    console.info(`[BidForGood DEV OTP] otp=${otp}`);
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
