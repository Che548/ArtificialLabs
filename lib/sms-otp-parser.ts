export function extractSixDigitOtp(message: string) {
  return message.match(/(?:^|\D)(\d{6})(?!\d)/)?.[1];
}
