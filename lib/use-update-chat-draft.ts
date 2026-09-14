import { useAuthToken } from '@convex-dev/auth/react';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { userIdFromAuthToken } from './auth-session';
import { loadUpdateChatDraft, saveUpdateChatDraft } from './local-database';
import { useBeforeUpdateRestart } from './update-manager';

export function useUpdateChatDraft(text: string, conversationId: string | undefined,
  restore: (text: string, conversationId: string | undefined) => void, busy: () => boolean, ready: boolean) {
  const token = useAuthToken();
  const owner = userIdFromAuthToken(token);
  const latest = useRef({ text, restore, owner });
  latest.current = { text, restore, owner };
  useEffect(() => {
    if (!owner || !ready || Platform.OS === 'web') return;
    let active = true;
    void loadUpdateChatDraft(owner).then(async saved => {
      if (active && saved && latest.current.owner === owner && !latest.current.text) {
        latest.current.restore(saved.text, saved.conversationId);
        // Consume only after restoring; the next requested restart writes afresh.
        await saveUpdateChatDraft(owner, { text: '' });
      }
    }).catch(() => { /* No draft is discarded or uploaded on a read failure. */ });
    return () => { active = false; };
  }, [owner, ready]);
  useBeforeUpdateRestart(async () => {
    if (Platform.OS === 'web') return;
    if (busy() || !ready) throw new Error('EDITOR_BUSY');
    if (!owner) { if (text) throw new Error('DRAFT_OWNER_REQUIRED'); return; }
    await saveUpdateChatDraft(owner, { text, conversationId });
    if (latest.current.text !== text || latest.current.owner !== owner) throw new Error('DRAFT_CHANGED');
  });
}
