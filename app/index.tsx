import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DisplayIcon from '../assets/figma/programs-scan/display.svg';
import HistoryIcon from '../assets/figma/programs-scan/history.svg';
import NotificationIcon from '../assets/figma/programs-scan/notification.svg';
import { GlassControl, fonts, getHeaderTop } from '../design-system';

const weightLossImage = require('../assets/figma/programs-scan/weight-loss.png');

export default function ProgramsScreen() {
  const insets = useSafeAreaInsets();
  const headerTop = getHeaderTop(insets.top);
  const [programVisible, setProgramVisible] = useState(true);

  const showPlaceholder = (title: string) => {
    Alert.alert(title, 'This section will be available soon.');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" hidden={false} />

      <View style={[styles.header, { top: headerTop }]}>
        <GlassControl
          accessibilityLabel="Program history"
          onPress={() => showPlaceholder('Program history')}
          style={styles.historyControl}
          tintColor="rgba(255,255,255,0.50)"
          washColor="rgba(255,255,255,0.44)"
        >
          <View style={styles.historyContent}>
            <HistoryIcon width={20} height={20} />
            <Text style={styles.historyLabel}>History</Text>
          </View>
        </GlassControl>

        <Text pointerEvents="none" style={styles.headerTitle}>
          Programs
        </Text>

        <View style={styles.headerActions}>
          <GlassControl
            accessibilityLabel="Notifications"
            onPress={() => showPlaceholder('Notifications')}
            style={styles.headerCircle}
            tintColor="rgba(255,255,255,0.50)"
            washColor="rgba(255,255,255,0.44)"
          >
            <NotificationIcon width={22} height={22} />
          </GlassControl>
          <GlassControl
            accessibilityLabel="Display options"
            onPress={() => showPlaceholder('Display options')}
            style={styles.headerCircle}
            tintColor="rgba(255,255,255,0.50)"
            washColor="rgba(255,255,255,0.44)"
          >
            <DisplayIcon width={22} height={22} />
          </GlassControl>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerTop + 64,
            paddingBottom: Math.max(insets.bottom + 118, 142),
          },
        ]}
      >
        <View style={styles.addProgramButton}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add new Program"
            onPress={() => setProgramVisible(true)}
            style={({ pressed }) => [
              styles.buttonPressTarget,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.addProgramLabel}>Add new Program  +</Text>
          </Pressable>
        </View>

        {programVisible ? (
          <View style={styles.programCard}>
            <View style={styles.programImageFrame}>
              <Image
                accessibilityLabel="Weight Loss program image"
                resizeMode="cover"
                source={weightLossImage}
                style={styles.programImage}
              />
            </View>

            <View style={styles.cardRule} />

            <View style={styles.programFooter}>
              <View style={styles.programCopy}>
                <Text style={styles.programTitle}>Weight Loss</Text>
                <Text numberOfLines={1} style={styles.programSubtitle}>
                  Comfortable weight loss program
                </Text>
              </View>
              <View style={styles.deleteButton}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete Weight Loss program"
                  onPress={() => setProgramVisible(false)}
                  style={({ pressed }) => [
                    styles.deletePressTarget,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.deleteLabel}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const cardShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F2' },
  header: {
    position: 'absolute',
    zIndex: 10,
    left: 16,
    right: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: -1,
    color: '#171717',
    fontFamily: fonts.sfSemibold,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.42,
    textAlign: 'center',
  },
  historyControl: { width: 116, height: 48, borderRadius: 24 },
  historyContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  historyLabel: {
    color: '#171717',
    fontFamily: fonts.sfRegular,
    fontSize: 17,
    lineHeight: 21,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingHorizontal: 16, gap: 16 },
  addProgramButton: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#171717',
  },
  buttonPressTarget: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  addProgramLabel: {
    color: '#FFFFFF',
    fontFamily: fonts.sfRegular,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.42,
  },
  programCard: {
    width: '100%',
    borderRadius: 24,
    padding: 16,
    gap: 10,
    backgroundColor: '#FFFFFF',
    ...cardShadow,
  },
  programImageFrame: {
    width: '100%',
    height: 82,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#ECECEC',
  },
  programImage: { width: '100%', height: '100%' },
  cardRule: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E4E4E4',
  },
  programFooter: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  programCopy: { minWidth: 0, flex: 1, gap: 4 },
  programTitle: {
    color: '#171717',
    fontFamily: fonts.sfSemibold,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.36,
  },
  programSubtitle: {
    color: '#5D5D5D',
    fontFamily: fonts.sfRegular,
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.28,
  },
  deleteButton: {
    width: 126,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171717',
  },
  deletePressTarget: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    color: '#FFFFFF',
    fontFamily: fonts.sfMedium,
    fontSize: 16,
    lineHeight: 19,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
