import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { DailySymptomsPromptContext } from '../lib/daily-symptoms-prompt-context';
import { AppState, Image, Platform, StyleSheet, View } from 'react-native';
import { useAuthToken } from '@convex-dev/auth/react';
import { PlanningQuickAction } from '../App';
import SymptomsIcon from '../assets/today/planning-symptoms.svg';
import { AppText } from '../design-system/components';
import { JournalFlowModal, type JournalFlowEntry } from '../design-system/journal-flow';
import { useHealthStore } from '../lib/health-store';
import { useAppTheme } from '../lib/theme';
import { userIdFromAuthToken } from '../lib/auth-session';
import { createDailyPromptClaim } from '../lib/daily-symptoms-prompt';
import { loadLocalSetting, saveLocalSetting } from '../lib/local-database';
import { AppSheet } from './AppSheet';

export function DailySymptomsPrompt({ children }: PropsWithChildren) {
  const { colors } = useAppTheme();
  const { addJournalEntry } = useHealthStore();
  const token = useAuthToken();
  const owner = userIdFromAuthToken(token) ?? 'local';
  const [visible, setVisible] = useState(false);
  const [journalDate, setJournalDate] = useState<Date | null>(null);
  const openJournalAfterClose = useRef(false);
  const busy = useRef(false);

  const openPrompt = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setVisible(true);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    const key = `daily-symptoms-prompt.v1:${owner}`;
    const claim = createDailyPromptClaim(
      () => loadLocalSetting<string>(key),
      (day) => saveLocalSetting(key, day),
    );
    const check = async () => {
      if (AppState.currentState !== 'active' || busy.current) return;
      try {
        if (await claim(new Date()) && active && AppState.currentState === 'active') {
          busy.current = true;
          setVisible(true);
        }
      } catch {
        // A reminder must never block entry when local storage is unavailable.
      }
    };
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => { active = false; subscription.remove(); };
  }, [owner]);

  const save = async (entries: JournalFlowEntry[]) => {
    if (!journalDate) return;
    const occurredAt = new Date(journalDate.getFullYear(), journalDate.getMonth(), journalDate.getDate(), 12).getTime();
    for (const entry of entries) await addJournalEntry({ occurredAt, ...entry });
  };

  return <DailySymptomsPromptContext.Provider value={openPrompt}>
    {children}
    <AppSheet
      visible={visible}
      title="Как ты себя чувствуешь?"
      scroll={false}
      containsLiquidGlass
      onClose={() => setVisible(false)}
      onClosed={() => {
        if (openJournalAfterClose.current) {
          openJournalAfterClose.current = false;
          setJournalDate(new Date());
        } else busy.current = false;
      }}
    >
      <View style={styles.content}>
        <Image
          source={require('../assets/today/spherka-wave.png')}
          resizeMode="contain"
          accessible={false}
          style={styles.mascot}
        />
        <AppText color={colors.text.secondary} style={styles.copy}>
          Отметь симптомы за сегодня — я помогу сохранить их в дневнике.
        </AppText>
        <PlanningQuickAction
          glassVariant="regular"
          glyph={<SymptomsIcon width={28} height={28} color={colors.brand.primary} />}
          label="Симптомы"
          onPress={() => {
            openJournalAfterClose.current = true;
            setVisible(false);
          }}
        />
      </View>
    </AppSheet>
    <JournalFlowModal
      visible={journalDate !== null}
      targetDate={journalDate ?? new Date()}
      initialCategory="symptoms"
      onClose={() => { setJournalDate(null); busy.current = false; }}
      onComplete={save}
    />
  </DailySymptomsPromptContext.Provider>;
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: 18, paddingBottom: 4 },
  mascot: { width: 180, height: 180, borderRadius: 28, overflow: 'hidden' },
  copy: { marginTop: -36, maxWidth: 290, textAlign: 'center', fontSize: 16, lineHeight: 23 },
});
