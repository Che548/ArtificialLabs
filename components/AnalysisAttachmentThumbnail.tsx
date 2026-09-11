import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export function AnalysisAttachmentThumbnail({
  uri,
  name,
  mimeType,
  photo = false,
}: {
  uri?: string;
  name?: string;
  mimeType?: string;
  photo?: boolean;
}) {
  const [failedUri, setFailedUri] = useState<string>();
  const isImage = mimeType
    ? mimeType.startsWith('image/')
    : photo ||
      /\.(jpe?g|png|heic|heif|webp|gif|bmp)(?:[?#].*)?$/i.test(name ?? '') ||
      /\.(jpe?g|png|heic|heif|webp|gif|bmp)(?:[?#].*)?$/i.test(uri ?? '');
  return (
    <View style={styles.frame}>
      {uri && isImage && failedUri !== uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={styles.image}
          accessibilityLabel="Миниатюра прикреплённого изображения"
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <Svg width={24} height={28} viewBox="0 0 24 28" accessible={false}>
          <Path
            d="M5 2h9l6 6v17H5V2Zm9 0v7h6M9 15h7M9 19h7"
            fill="none"
            stroke="#EA4087"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#F5F3F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
});
