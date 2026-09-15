import { useAuthToken } from '@convex-dev/auth/react';
import {
  useConvexAuth,
  useMutation,
  useQueries,
  type RequestForQueries,
} from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { AppState, Platform } from 'react-native';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { api } from '../convex/_generated/api';
import {
  OCR_MODEL,
  OCR_POLICY_VERSION,
  OCR_LIMITS,
  parseOcrPage,
} from '../shared/document-ocr';
import type { DocumentExtraction } from '../shared/document-policy';
import { renderDocumentPage } from '../modules/document-ocr';
import { useHealthStore } from './health-store';
import { useConnectivity } from './connectivity';
import { userIdFromAuthToken } from './auth-session';
import { newLocalId } from './health-types';
import {
  loadLocalDocumentExtraction,
  saveLocalDocumentExtraction,
  loadLocalSetting,
  saveLocalSetting,
} from './local-database';
import { runDocumentOcrJob, retryDocumentOcrJob } from './document-ocr-job';

type OcrContext = {
  enabled: boolean;
  accepted: boolean;
  reason: string;
  drafts: Record<string, DocumentExtraction>;
  consent(accepted: boolean): Promise<void>;
  enqueue(
    id: string,
    rotation?: 0 | 90 | 180 | 270,
    restart?: boolean,
  ): Promise<void>;
  imported(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
  edited(draft: DocumentExtraction): void;
};
const unavailable = async () => {
  throw new Error('OCR_SERVICE_DISABLED');
};
const Context = createContext<OcrContext>({
  enabled: false,
  accepted: false,
  reason: 'Распознавание доступно в приложении после входа.',
  drafts: {},
  consent: unavailable,
  enqueue: unavailable,
  imported: async () => {},
  cancel: async () => {},
  edited: () => {},
});
export const useDocumentOcr = () => useContext(Context);

export function DocumentOcrManager({ children }: PropsWithChildren) {
  const store = useHealthStore();
  const { isOffline } = useConnectivity();
  const token = useAuthToken();
  const ownerId = userIdFromAuthToken(token);
  const { isAuthenticated } = useConvexAuth();
  const canReadStatus =
    Platform.OS !== 'web' &&
    isAuthenticated &&
    store.cloudSyncEnabled &&
    !store.accountDeletion.pendingDeletion;
  // Convex's subscription hook updates state during render when this object
  // changes. Keep it stable across local preference and draft updates.
  const statusQueries = useMemo((): RequestForQueries => {
    if (!canReadStatus) return {};
    return { status: { query: api.documentOcr.status, args: {} } };
  }, [canReadStatus]);
  const statusValue = useQueries(statusQueries).status;
  const status =
    statusValue instanceof Error
      ? undefined
      : (statusValue as
          FunctionReturnType<typeof api.documentOcr.status> | undefined);
  const setConsent = useMutation(api.documentOcr.setConsent);
  const [cached, setCached] = useState<{
    ownerId: string;
    accepted: boolean;
    enabled: boolean;
  }>();
  const [preferencesOwner, setPreferencesOwner] = useState<string>();
  const [revoked, setRevoked] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DocumentExtraction>>({});
  const [active, setActive] = useState(AppState.currentState === 'active');
  const draftsRef = useRef(drafts);
  const running = useRef<{ id: string; abort: AbortController } | undefined>(
    undefined,
  );
  const alive = useRef(true);
  const epoch = useRef(0);
  const accepted =
    !!ownerId &&
    preferencesOwner === ownerId &&
    !revoked &&
    (status?.accepted ?? (cached?.ownerId === ownerId && cached.accepted));
  const enabled =
    !!ownerId &&
    !(statusValue instanceof Error) &&
    !store.readOnly &&
    store.cloudSyncEnabled &&
    !store.accountDeletion.pendingDeletion &&
    !!(status?.enabled ?? (cached?.ownerId === ownerId && cached.enabled));
  const inputs = useRef({
    store,
    ownerId,
    token,
    accepted,
    enabled,
    isOffline,
    active,
    status,
  });
  inputs.current = {
    store,
    ownerId,
    token,
    accepted,
    enabled,
    isOffline,
    active,
    status,
  };
  const publish = (draft: DocumentExtraction) => {
    draftsRef.current = {
      ...draftsRef.current,
      [draft.documentLocalId]: draft,
    };
    setDrafts(draftsRef.current);
  };
  useEffect(() => {
    alive.current = true;
    const sub = AppState.addEventListener('change', (s) => {
      setActive(s === 'active');
      if (s !== 'active') running.current?.abort.abort();
    });
    return () => {
      alive.current = false;
      epoch.current++;
      running.current?.abort.abort();
      sub.remove();
    };
  }, []);
  useEffect(() => {
    epoch.current++;
    running.current?.abort.abort();
    draftsRef.current = {};
    setDrafts({});
    setCached(undefined);
    setPreferencesOwner(undefined);
    setRevoked(false);
    const current = epoch.current;
    if (ownerId)
      void Promise.all([
        loadLocalSetting<{
          ownerId: string;
          accepted: boolean;
          enabled: boolean;
        }>('documentOcrConsent.v1'),
        loadLocalSetting<{ ownerId: string; revoked: boolean }>(
          'documentOcrRevoked.v1',
        ),
      ])
        .then(([v, r]) => {
          if (alive.current && current === epoch.current) {
            if (v?.ownerId === ownerId) setCached(v);
            setRevoked(r?.ownerId === ownerId && r.revoked);
            setPreferencesOwner(ownerId);
          }
        })
        .catch(() => {});
  }, [ownerId]);
  useEffect(() => {
    if (!ownerId || !status) return;
    const value = {
      ownerId,
      accepted: status.accepted,
      enabled: status.enabled,
    };
    setCached(value);
    void saveLocalSetting('documentOcrConsent.v1', value).catch(() => {});
  }, [ownerId, status]);
  const ids = store.documents
    .filter((d) => !d.deletedAt)
    .map((d) => d.localId)
    .join('|');
  useEffect(() => {
    const current = epoch.current;
    let stopped = false;
    if (!store.ready || !ownerId || store.readOnly) return;
    void (async () => {
      for (const document of inputs.current.store.documents) {
        if (stopped || current !== epoch.current) return;
        if (draftsRef.current[document.localId]) continue;
        const draft = await loadLocalDocumentExtraction(document.localId);
        if (
          draft &&
          !stopped &&
          current === epoch.current &&
          (!draft.job || draft.job.ownerId === ownerId) &&
          !draftsRef.current[document.localId]
        ) {
          publish(
            draft.state === 'recognizing'
              ? {
                  ...draft,
                  state: draft.job?.nextRequestId ? 'error' : 'queued',
                  job: draft.job
                    ? {
                        ...draft.job,
                        errorCode: draft.job.nextRequestId
                          ? 'OCR_UNCERTAIN'
                          : undefined,
                      }
                    : undefined,
                }
              : draft,
          );
        }
      }
    })().catch(() => {
      /* Local failure does not affect import. */
    });
    return () => {
      stopped = true;
    };
  }, [ids, store.ready, store.readOnly, ownerId]);
  useEffect(() => {
    if (!enabled || !accepted || isOffline || !active)
      running.current?.abort.abort();
    const current = running.current;
    if (
      current &&
      !store.documents.some((d) => d.localId === current.id && !d.deletedAt)
    )
      current.abort.abort();
  }, [enabled, accepted, isOffline, active, ids, store.documents]);
  useEffect(() => {
    const tick = async () => {
      const input = inputs.current;
      if (
        running.current ||
        !alive.current ||
        !input.store.ready ||
        !input.enabled ||
        !input.accepted ||
        !input.active ||
        input.isOffline ||
        !input.status?.accepted ||
        !input.token
      )
        return;
      const draft = Object.values(draftsRef.current).find(
        (d) =>
          d.state === 'queued' &&
          d.job?.ownerId === input.ownerId &&
          input.store.documents.some(
            (doc) =>
              doc.localId === d.documentLocalId &&
              !doc.deletedAt &&
              doc.localFileUri,
          ),
      );
      if (!draft) return;
      const document = input.store.documents.find(
        (d) => d.localId === draft.documentLocalId,
      )!;
      const controller = new AbortController();
      running.current = { id: document.localId, abort: controller };
      const current = epoch.current;
      const sameDocument = () =>
        alive.current &&
        current === epoch.current &&
        inputs.current.ownerId === input.ownerId &&
        inputs.current.store.documents.some(
          (d) =>
            d.localId === document.localId &&
            !d.deletedAt &&
            d.localFileUri === document.localFileUri,
        );
      const allowed = () =>
        sameDocument() &&
        inputs.current.enabled &&
        inputs.current.accepted &&
        inputs.current.active &&
        !inputs.current.isOffline &&
        !controller.signal.aborted;
      try {
        await runDocumentOcrJob(
          draft,
          {
            allowed,
            requestId: () => newLocalId('ocr-request'),
            render: (page) =>
              renderDocumentPage(
                document.localFileUri!,
                page,
                draft.rotationDegrees ?? 0,
              ),
            save: async (value) => {
              if (!allowed()) return;
              await saveLocalDocumentExtraction(value);
              if (sameDocument()) publish(value);
            },
            send: async (args, signal) => {
              if (!allowed()) throw new Error('OCR_STOPPED');
              const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
              if (!site?.startsWith('https://'))
                throw new Error('OCR_CONFIGURATION');
              const abort = new AbortController();
              const cancel = () => abort.abort();
              signal.addEventListener('abort', cancel, { once: true });
              const timeout = setTimeout(cancel, OCR_LIMITS.timeoutMs + 15000);
              try {
                const response = await fetch(`${site}/document-ocr/page`, {
                  method: 'POST',
                  signal: abort.signal,
                  headers: {
                    Authorization: `Bearer ${inputs.current.token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    ...args,
                    formatVersion: 2,
                    policyVersion: OCR_POLICY_VERSION,
                  }),
                });
                const result = await response.json();
                if (!response.ok || !result.ok)
                  throw new Error(
                    typeof result.code === 'string'
                      ? result.code
                      : 'OCR_REQUEST_FAILED',
                  );
                if (result.model !== OCR_MODEL || result.page !== args.page || result.result?.version !== 2)
                  throw new Error('OCR_INVALID_OUTPUT');
                return parseOcrPage(result.result);
              } finally {
                clearTimeout(timeout);
                signal.removeEventListener('abort', cancel);
              }
            },
          },
          controller.signal,
        );
      } catch {
        /* Safe error state is retained locally; no raw provider errors in logs. */
      } finally {
        if (sameDocument()) {
          const latest = await loadLocalDocumentExtraction(
            document.localId,
          ).catch(() => undefined);
          if (latest?.state === 'recognizing') {
            const paused = {
              ...latest,
              state: latest.job?.nextRequestId
                ? ('error' as const)
                : ('queued' as const),
              job: latest.job
                ? {
                    ...latest.job,
                    errorCode: latest.job.nextRequestId
                      ? 'OCR_UNCERTAIN'
                      : undefined,
                  }
                : undefined,
            };
            await saveLocalDocumentExtraction(paused)
              .then(() => {
                if (sameDocument()) publish(paused);
              })
              .catch(() => {});
          }
        }
        running.current = undefined;
      }
    };
    const timer = setInterval(() => void tick(), 750);
    return () => clearInterval(timer);
  }, []);
  const enqueue = async (
    id: string,
    rotation: 0 | 90 | 180 | 270 = 0,
    restart = false,
  ) => {
    const input = inputs.current;
    if (!input.ownerId || !input.enabled || !input.accepted)
      throw new Error('OCR_CONSENT_REQUIRED');
    if (running.current?.id === id) throw new Error('DOCUMENT_BUSY');
    const old =
      draftsRef.current[id] ?? (await loadLocalDocumentExtraction(id));
    const resume =
      !restart &&
      old?.provider === 'yandex-ai-studio' &&
      ['error', 'cancelled', 'queued'].includes(old.state) &&
      old.rotationDegrees === rotation;
    const next: DocumentExtraction = resume
      ? retryDocumentOcrJob(old)
      : {
          version: 2,
          documentLocalId: id,
          engineVersion: 'qwen-ocr-v1',
          provider: 'yandex-ai-studio',
          model: OCR_MODEL,
          state: 'queued',
          pages: [],
          editedText: '',
          analytes: [],
          rotationDegrees: rotation,
          job: { id: newLocalId('ocr-job'), ownerId: input.ownerId },
          updatedAt: Date.now(),
        };
    await saveLocalDocumentExtraction(next);
    publish(next);
  };
  const cancel = async (id: string) => {
    if (running.current?.id === id) running.current.abort.abort();
    const value = draftsRef.current[id];
    if (!value) return;
    const next = {
      ...value,
      state: 'cancelled' as const,
      updatedAt: Date.now(),
    };
    await saveLocalDocumentExtraction(next);
    publish(next);
  };
  const consent = async (value: boolean) => {
    if (!ownerId) return;
    if (!value) {
      inputs.current.accepted = false;
      setRevoked(true);
      running.current?.abort.abort();
      await saveLocalSetting('documentOcrRevoked.v1', {
        ownerId,
        revoked: true,
      });
    }
    await setConsent({ accepted: value, policyVersion: OCR_POLICY_VERSION });
    if (value) {
      await saveLocalSetting('documentOcrRevoked.v1', {
        ownerId,
        revoked: false,
      });
      setRevoked(false);
    }
  };
  useEffect(() => {
    if (revoked && status?.accepted && !isOffline)
      void setConsent({
        accepted: false,
        policyVersion: OCR_POLICY_VERSION,
      }).catch(() => {});
  }, [revoked, status?.accepted, isOffline, setConsent]);
  const reason = !store.cloudSyncEnabled
    ? 'Для распознавания включите облачную синхронизацию в разрешениях.'
    : !enabled
      ? 'Распознавание пока недоступно на сервере.'
      : !accepted
        ? 'Разрешите автоматическое распознавание новых документов.'
        : isOffline
          ? 'Нет сети. Документы ожидают распознавания.'
          : '';
  return (
    <Context.Provider
      value={{
        enabled,
        accepted,
        reason,
        drafts,
        consent,
        enqueue,
        cancel,
        edited: publish,
        imported: async (id) => {
          if (inputs.current.enabled && inputs.current.accepted)
            await enqueue(id);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
