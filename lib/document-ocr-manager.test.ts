import { createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({ cloudSyncEnabled: false }));
vi.mock('@convex-dev/auth/react', () => ({ useAuthToken: () => undefined }));
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('convex/react')>()),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active' },
  Platform: { OS: 'ios' },
}));
vi.mock('./health-store', () => ({
  useHealthStore: () => {
    // Reproduce the local-settings update which caused the phone's startup
    // rerender, while exercising the real Convex subscription implementation.
    const [ready, setReady] = useState(false);
    if (!ready) setReady(true);
    return {
      ready,
      cloudSyncEnabled: state.cloudSyncEnabled,
      accountDeletion: { pendingDeletion: false },
      documents: [],
      readOnly: false,
    };
  },
}));
vi.mock('./connectivity', () => ({
  useConnectivity: () => ({ isOffline: false }),
}));
vi.mock('./local-database', () => ({}));
vi.mock('../modules/document-ocr', () => ({}));
import { DocumentOcrManager } from './document-ocr-manager';

test.each([false, true])(
  'OCR manager survives startup rerenders with cloud sync %s',
  async (cloudSyncEnabled) => {
    state.cloudSyncEnabled = cloudSyncEnabled;
    const client = new ConvexReactClient('https://synthetic.convex.cloud');
    try {
      expect(
        renderToString(
          createElement(
            ConvexProvider,
            { client },
            createElement(DocumentOcrManager, null, 'app-ready'),
          ),
        ),
      ).toBe('app-ready');
    } finally {
      await client.close();
    }
  },
);
