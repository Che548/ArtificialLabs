import { context } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('output/playwright/document-preview');
await mkdir(out, { recursive: true });
await writeFile(
  `${out}/index.html`,
  '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Document OCR UI fixture</title><style>@font-face{font-family:Comfortaa;src:url(/Comfortaa-Regular.ttf)}body{margin:0;background:#fff7fa}</style><div id="root"></div><script src="/bundle.js"></script></html>',
);
await copyFile(
  'assets/fonts/Comfortaa-Regular.ttf',
  `${out}/Comfortaa-Regular.ttf`,
);
const stub = path.resolve('tests/document-ui/fixture.tsx');
const ctx = await context({
  entryPoints: ['tests/document-ui/fixture.tsx'],
  bundle: true,
  outfile: `${out}/bundle.js`,
  jsx: 'automatic',
  resolveExtensions: ['.web.tsx', '.tsx', '.web.ts', '.ts', '.web.jsx', '.jsx', '.web.js', '.js', '.json'],
  loader: { '.png': 'file', '.jpg': 'file' },
  plugins: [
    {
      name: 'offline-native-services',
      setup(build) {
        build.onResolve({ filter: /(^|\/)theme$/ }, () => ({ path: stub }));
        build.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: path.resolve('node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js') }));
        build.onResolve(
          {
            filter:
              /^(expo-symbols|expo-blur|expo-linear-gradient|expo-glass-effect|@react-native-community\/datetimepicker)$/,
          },
          () => ({
            path: path.resolve('tests/document-ui/native-effects.tsx'),
          }),
        );
        build.onResolve({ filter: /^react-native$/ }, () => ({
          path: path.resolve('tests/document-ui/native.js'),
        }));
        build.onResolve(
          {
            filter:
              /^(expo-router|react-native-safe-area-context|convex\/react)$|(?:\/design-system|\/lib\/(document-ocr-manager|health-store|local-database|theme)|\/modules\/document-ocr)$/,
          },
          () => ({ path: stub }),
        );
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'false', global: 'globalThis' },
});
await ctx.serve({ host: '127.0.0.1', port: 4324, servedir: out });
console.log('Document UI fixture: synthetic data and mocked services only.');
