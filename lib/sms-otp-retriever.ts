import { addSmsListener, startSmsRetriever } from '../modules/sms-retriever';
import { extractSixDigitOtp } from './sms-otp-parser';

export function listenForSmsOtp(onCode: (code: string) => void) {
  return addSmsListener((message) => {
    const code = extractSixDigitOtp(message);
    if (code) onCode(code);
  });
}

export { startSmsRetriever };
