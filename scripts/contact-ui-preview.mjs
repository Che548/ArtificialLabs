import { context } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('output/playwright/contact-preview');
await mkdir(out, { recursive: true });
await copyFile('tests/contact-ui/index.html', `${out}/index.html`);
const ctx = await context({
  entryPoints: ['tests/contact-ui/entry.tsx'],
  bundle: true,
  outfile: `${out}/bundle.js`,
  jsx: 'automatic',
  alias: {
    '@convex-dev/auth/react': path.resolve('tests/contact-ui/auth.ts'),
    'convex/react': path.resolve('tests/contact-ui/client.ts'),
    'react-native': 'react-native-web',
    'react-native-safe-area-context': path.resolve(
      'tests/contact-ui/safe-area.ts',
    ),
  },
  plugins: [
    {
      name: 'fixture-native-sms',
      setup(build) {
        build.onResolve({ filter: /^(expo-symbols)$|(?:design-system\/(components|profile))$/ }, () => ({
          path: path.resolve('tests/contact-ui/presentation.tsx'),
        }));
        build.onResolve({ filter: /^expo-sqlite\/kv-store$/ }, () => ({
          path: path.resolve('tests/legal-ui/stubs.tsx'),
        }));
        build.onResolve({ filter: /\/sms-otp-retriever$/ }, () => ({
          path: path.resolve('tests/contact-ui/sms.ts'),
        }));
      },
    },
  ],
  define: { global: 'globalThis', 'process.env.NODE_ENV': '"development"' },
});
await ctx.serve({ host: '127.0.0.1', port: 4321, servedir: out });
console.log(
  'Contact UI fixture on http://127.0.0.1:4321; no live messages or accounts.',
);
