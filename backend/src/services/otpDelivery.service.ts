const devOtpOutbox = new Map<string, string>();

/**
 * Development/test OTP delivery adapter.
 * Production must replace this with a real email delivery integration.
 * The OTP is never returned by API responses.
 */
export const sendRegistrationOtp = async (email: string, otp: string): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') {
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
