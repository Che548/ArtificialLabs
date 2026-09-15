import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  assertDocumentNotCancelled,
  type LocalDocumentEngine,
} from '../../lib/document-recognition';
import lock from './dependencies.lock.json';

type NativeApi = {
  begin(): boolean;
  exportPageAsync(uri: string, page: number, rotation: number): Promise<string>;
  cancel(): void;
  inspectAsync(
    uri: string,
  ): Promise<{ mime: string; bytes: number; pages: number }>;
  recognizePageAsync(
    uri: string,
    page: number,
    rotation: number,
  ): Promise<{ text: string; confidence: number }>;
  previewPageAsync(
    uri: string,
    page: number,
    rotation: number,
  ): Promise<string>;
  cleanupAsync(): Promise<void>;
};

export function createLocalDocumentEngine(
  rotation: 0 | 90 | 180 | 270 = 0,
): LocalDocumentEngine & {
  preview(uri: string, page: number): Promise<string>;
} {
  const native = requireOptionalNativeModule<NativeApi>('DocumentOcr');
  if (!native) throw new Error('DOCUMENT_NATIVE_BUILD_REQUIRED');
  if (!native.begin()) throw new Error('DOCUMENT_BUSY');
  let ended = false;
  return {
    version: lock.engineVersion,
    inspect: (uri) => native.inspectAsync(uri),
    preview: (uri, page) => native.previewPageAsync(uri, page, rotation),
    recognizePage: async (uri, page, signal) => {
      assertDocumentNotCancelled(signal);
      if (ended) throw new Error('DOCUMENT_CANCELLED');
      const cancel = () => native.cancel();
      signal.addEventListener('abort', cancel, { once: true });
      try {
        return await native.recognizePageAsync(uri, page, rotation);
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
    cleanup: async () => {
      if (ended) return;
      ended = true;
      await native.cleanupAsync();
    },
  };
}

/** Rendering only: no Tesseract invocation and no image files written for uploads. */
export async function renderDocumentPage(
  uri: string,
  page: number,
  rotation: number,
) {
  const native = requireOptionalNativeModule<NativeApi>('DocumentOcr');
  if (!native?.exportPageAsync)
    throw new Error('DOCUMENT_NATIVE_BUILD_REQUIRED');
  if (!native.begin()) throw new Error('DOCUMENT_BUSY');
  try {
    const metadata = await native.inspectAsync(uri);
    const image = await native.exportPageAsync(uri, page, rotation);
    return { image, pages: metadata.pages };
  } finally {
    await native.cleanupAsync();
  }
}

/** Inspection is stateless and does not acquire the recognition/preview lease. */
export async function inspectLocalDocument(uri: string) {
  const native = requireOptionalNativeModule<NativeApi>('DocumentOcr');
  if (!native) throw new Error('DOCUMENT_NATIVE_BUILD_REQUIRED');
  return native.inspectAsync(uri);
}
