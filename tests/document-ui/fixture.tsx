import { parseOcrPage } from '../../shared/document-ocr';
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { ProfileDocumentsSection } from '../../components/ProfileDocumentsSection';
import type { HealthDocument } from '../../lib/health-types';
import {
  validateDocumentExtraction,
  type DocumentExtraction,
} from '../../shared/document-policy';
import { colors } from '../../design-system/tokens';

const initial: DocumentExtraction = {
  version: 2,
  documentLocalId: 'synthetic-doc',
  engineVersion: 'qwen-ocr-v1',
  provider: 'yandex-ai-studio',
  model: 'qwen3.6-35b-a3b/latest',
  state: 'review',
  pages: [
    {
      page: 1,
      text: 'Synthetic CRP <0,10 mg/L',
      confidence: null,
      dates: ['2026-09-11'],
    },
  ],
  editedText: 'Synthetic CRP <0,10 mg/L',
  updatedAt: 1,
  analytes: [
    {
      name: 'CRP',
      value: '<0,10',
      unit: 'mg/L',
      reference: '',
      reviewed: false,
      selected: false,
      sourcePage: 1,
      sourceText: 'Synthetic CRP <0,10 mg/L',
      date: '2026-09-11',
    },
  ],
  job: { id: 'synthetic-job', ownerId: 'synthetic-owner', pageCount: 2 },
};
let disk: DocumentExtraction | undefined;
let failWrites = false;
let finishLoad: (() => void) | undefined;
const operations: string[] = [];
const renders: Array<{ uri: string; page: number; rotation: number }> = [];
const saved: DocumentExtraction[] = [];
const confirmed: DocumentExtraction[] = [];
export const loadLocalDocumentExtraction = async () => {
  const snapshot = disk;
  if (new URLSearchParams(location.search).has('slow'))
    await new Promise<void>((resolve) => {
      finishLoad = resolve;
    });
  return snapshot;
};
export const saveLocalDocumentExtraction = async (
  value: DocumentExtraction,
) => {
  if (failWrites) throw new Error('Synthetic local write failure');
  disk = structuredClone(value);
  saved.push(disk);
};
export const useSafeAreaInsets = () => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
});
export const useRouter = () => ({ push() {} });
export const useConvexAuth = () => ({ isAuthenticated: true });
export const useQueries = () => ({
  status: { enabled: false, accepted: false },
});
export const useMutation = () => async () => {
  throw new Error('Unexpected live mutation');
};
export const useAction = useMutation;
export { AppText, SegmentedSwitcher } from '../../design-system/components';
export {
  ProfileActionRow,
  ProfileEmptyMessage,
  ProfileSettingsGroup,
  ProfileSettingsRow,
} from '../../design-system/profile';
export { profileTones, spacing } from '../../design-system/tokens';
export function useAppTheme() {
  return { colors };
}
export function useThemeStyles<T>(factory: (palette: typeof colors) => T): T {
  return factory(colors);
}
export const renderDocumentPage = async (
  uri: string,
  page: number,
  rotation: number,
) => {
  renders.push({ uri, page, rotation });
  return { pages: 2, image: '' };
};
const FixtureContext = createContext<any>(undefined);
export const useDocumentOcr = () => useContext(FixtureContext).ocr;
export const useHealthStore = () => useContext(FixtureContext).store;
function Fixture({ children }: PropsWithChildren) {
  const params = new URLSearchParams(location.search);
  const [accepted, setAccepted] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, DocumentExtraction>>({});
  const [documents, setDocuments] = useState<HealthDocument[]>([
    {
      localId: 'synthetic-doc',
      title: 'Synthetic laboratory document',
      category: 'medical',
      documentDate: 1,
      hasLocalFile: true,
      localFileUri: 'file:///synthetic.pdf',
      updatedAt: 1,
    },
  ]);
  const readOnly = params.has('readonly');
  const publish = (draft: DocumentExtraction) =>
    setDrafts((value) => ({ ...value, [draft.documentLocalId]: draft }));
  const ocr = {
    accepted,
    enabled,
    drafts,
    reason: !enabled
      ? 'Для распознавания включите облачную синхронизацию в разрешениях.'
      : !accepted
        ? 'Разрешите автоматическое распознавание новых документов.'
        : '',
    consent: async (value: boolean) => {
      operations.push(`consent:${value}`);
      setAccepted(value);
    },
    enqueue: async (id: string, rotation: number) => {
      operations.push(`enqueue:${id}:${rotation}`);
      publish({
        ...initial,
        documentLocalId: id,
        state: 'queued',
        rotationDegrees: rotation as 0,
      });
    },
    cancel: async (id: string) => {
      operations.push(`cancel:${id}`);
      if (drafts[id]) publish({ ...drafts[id], state: 'cancelled' });
    },
    edited: publish,
  };
  const store = {
    readOnly,
    cloudSyncEnabled: enabled,
    confirmDocumentExtraction: async (value: DocumentExtraction) => {
      validateDocumentExtraction(value);
      confirmed.push(structuredClone(value));
      await saveLocalDocumentExtraction(value);
    },
  };
  Object.assign(window, {
    fixture: {
      operations,
      renders,
      saved,
      confirmed,
      finishLoad: () => finishLoad?.(),
      failWrites: () => {
        failWrites = true;
      },
      resumeWrites: () => {
        failWrites = false;
      },
      setDisk: () => {
        disk = { ...initial, editedText: 'STALE DISK TEXT' };
      },
      progress: () => publish({ ...initial, state: 'recognizing' }),
      complete: () =>
        publish({
          ...initial,
          collectedAt: new Date(2026, 8, 11, 12).getTime(),
        }),
      mixed: () =>
        publish({
          ...initial,
          collectedAt: undefined,
          analytes: [
            initial.analytes![0],
            {
              ...initial.analytes![0],
              name: 'Qualitative',
              value: 'Отрицательно',
              date: '2026-09-12',
            },
          ],
        }),
      structured: () => {
        const text = 'Sample report\nBorn: 1988-06-14\nCollected: 2024-02-29 08:15\nSerum\nTechnique optical\nMarker <1,25 mg/L\nUrine\nMarker negative\nConclusion: specimen findings are listed separately.';
        const p = parseOcrPage({version:2,text,dates:['1988-06-14','2024-02-29'],issues:[],structure:{version:1,title:'Sample report',pageRole:'content',dates:[
          {kind:'birth',text:'1988-06-14',sourceText:'Born: 1988-06-14',section:''},
          {kind:'collection',text:'2024-02-29 08:15',sourceText:'Collected: 2024-02-29 08:15',section:''}],blocks:[{kind:'conclusion',text:'Conclusion: specimen findings are listed separately.',section:''}]}, rows:[
          {kind:'method',section:'Serum',name:'Technique',value:'optical',unit:'',reference:'',date:'',sourceText:'Technique optical',issues:[]},
          {kind:'observation',section:'Serum',name:'Marker',value:'<1,25',unit:'mg/L',reference:'',date:'',sourceText:'Marker <1,25 mg/L',issues:[]},
          {kind:'observation',section:'Urine',name:'Marker',value:'negative',unit:'',reference:'',date:'',sourceText:'Marker negative',issues:[]} ]});
        publish({...initial, editedText:p.text, pages:[{page:1,text:p.text,confidence:null,dates:p.dates,structure:p.structure}],analytes:p.rows.map(r=>({...r,reviewed:false,selected:false,sourcePage:1}))});
      },
      many: () =>
        publish({
          ...initial,
          collectedAt: new Date(2026, 8, 11, 12).getTime(),
          analytes: Array.from({ length: 24 }, (_, index) => ({
            ...initial.analytes![0],
            name: `Synthetic ${index + 1}`,
          })),
        }),
      uncertain: () =>
        publish({
          ...initial,
          state: 'error',
          job: {
            ...initial.job!,
            uncertainPage: 2,
            errorCode: 'OCR_UNCERTAIN',
          },
        }),
      syncOff: () => setEnabled(false),
      remove: () => setDocuments([]),
    },
  });
  return (
    <FixtureContext.Provider value={{ ocr, store }}>
      <View
        style={{
          padding: 20,
          width: '100%',
          maxWidth: 430,
          alignSelf: 'center',
        }}
      >
        <ProfileDocumentsSection
          documents={documents}
          readOnly={readOnly}
          onAdd={async () => {
            operations.push('save-original');
            operations.push('save-document');
            if (accepted && enabled) await ocr.enqueue('synthetic-doc', 0);
          }}
          onDelete={async (document) => {
            operations.push(`delete:${document.localId}`);
            setDocuments([]);
          }}
        />
      </View>
      {children}
    </FixtureContext.Provider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
