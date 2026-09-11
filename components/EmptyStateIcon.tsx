import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type EmptyStateIconKind = 'documents' | 'history' | 'medication' | 'allergy' | 'chat' | 'photo' | 'analysis' | 'plan' | 'profile';

export const emptyStateColor = '#B4A4AC';

const paths: Record<EmptyStateIconKind, string[]> = {
  profile: ['M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2'],
  documents: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z', 'M14 3v6h6M8 13h8M8 17h5'],
  history: ['M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2', 'M8 3h8v4H8ZM12 11v6M9 14h6'],
  medication: ['M8.5 4.5a4.95 4.95 0 0 1 7 7l-4 4a4.95 4.95 0 0 1-7-7Z', 'm6.5 6.5 7 7M18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15 18h6'],
  allergy: ['M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z', 'M12 8v5M12 16h.01'],
  chat: ['M20 11a8 8 0 0 1-8 8H4l-2 2v-10a9 9 0 0 1 18 0Z', 'M7 9h8M7 13h5'],
  photo: ['M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', 'm3 16 5-5 4 4 3-3 6 6M15 7h.01'],
  analysis: ['M9 3h6M10 3v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3', 'M8 15h8M10 18h.01M14 18h.01'],
  plan: ['M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2', 'M8 3h8v4H8ZM8 12h.01M11 12h5M8 17h.01M11 17h5'],
};

/** Decorative: the adjacent empty-state text supplies the accessible description. */
export function EmptyStateIcon({ kind, size = 48 }: { kind: EmptyStateIconKind; size?: number }) {
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      pointerEvents="none" style={{ alignSelf: 'center', marginBottom: 4 }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={emptyStateColor} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round">
        {paths[kind].map((d, index) => <Path key={index} d={d} />)}
      </Svg>
    </View>
  );
}
