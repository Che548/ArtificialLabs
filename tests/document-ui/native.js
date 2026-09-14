// Run the real native document controls in the browser, with no native or live IO.
export * from 'react-native-web';
export const Platform = {
  OS: 'ios',
  select: (options) => options.ios ?? options.default,
};
