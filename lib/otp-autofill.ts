import type { TextInputProps } from 'react-native';

type NativePlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos';

export function otpAutofillProps(
  platform: NativePlatform,
): Pick<TextInputProps, 'autoComplete' | 'importantForAutofill' | 'textContentType'> {
  if (platform === 'android') {
    return {
      autoComplete: 'sms-otp',
      importantForAutofill: 'yes',
    };
  }

  if (platform === 'ios') {
    return {
      textContentType: 'oneTimeCode',
    };
  }

  return {
    autoComplete: 'one-time-code',
  };
}
