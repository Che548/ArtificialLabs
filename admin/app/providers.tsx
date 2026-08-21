'use client';

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import { useState, type PropsWithChildren } from 'react';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export function Providers({ children }: PropsWithChildren) {
  const [client] = useState(() => {
    if (!convexUrl) {
      throw new Error(
        'NEXT_PUBLIC_CONVEX_URL is required for the admin console',
      );
    }
    return new ConvexReactClient(convexUrl);
  });
  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
