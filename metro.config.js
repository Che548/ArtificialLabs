const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath =
  require.resolve('react-native-svg-transformer/expo');
config.resolver.assetExts = config.resolver.assetExts.filter(
  (extension) => extension !== 'svg',
);
config.resolver.sourceExts.push('svg');
// expo-sqlite/kv-store is imported by the shared appearance provider.
config.resolver.assetExts.push('wasm');

module.exports = withNativeWind(config, { input: './global.css' });
