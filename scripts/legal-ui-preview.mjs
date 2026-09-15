import { context } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('output/playwright/legal-preview');
await mkdir(out, { recursive: true });
await writeFile(`${out}/index.html`, '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sfera legal reader fixture</title><style>html,body,#root{height:100%;margin:0}body{font-family:Arial}</style><div id="root"></div><script src="/bundle.js"></script></html>');
const stub = path.resolve('tests/legal-ui/stubs.tsx');
const ctx = await context({ entryPoints: ['tests/legal-ui/entry.tsx'], bundle: true, outfile: `${out}/bundle.js`, jsx: 'automatic',
 alias: { 'react-native': 'react-native-web' },
 plugins: [{ name: 'isolated-native-and-server-services', setup(build) {
   build.onResolve({ filter: /^(expo-crypto|expo-symbols|expo-status-bar|expo-sqlite\/kv-store|react-native-safe-area-context|@convex-dev\/auth\/react|convex\/react)$|(?:design-system\/components|lib\/registration-consent|lib\/update-manager|lib\/connectivity|lib\/sms-otp-retriever|\.\/BrandLogo)$/ }, () => ({ path: stub }));
 } }],
 define: { global: 'globalThis', 'process.env': '{}', __DEV__: 'false', 'process.env.NODE_ENV': '"development"' },
});
await ctx.serve({ host: '127.0.0.1', port: 4323, servedir: out });
console.log('Sfera legal UI: http://127.0.0.1:4323 — offline fixture; no live accounts or messages.');
