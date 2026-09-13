import { context } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('output/playwright/admin-preview');
await mkdir(out, { recursive: true });
await copyFile('tests/admin-ui/index.html', `${out}/index.html`);
const ctx = await context({ entryPoints: ['tests/admin-ui/entry.tsx'], bundle: true, outfile: `${out}/bundle.js`, jsx: 'automatic',
  alias: { 'convex/react': path.resolve('tests/admin-ui/client.ts'), '@convex-dev/auth/react': path.resolve('tests/admin-ui/auth.ts'), react: path.resolve('node_modules/react'), 'react-dom': path.resolve('node_modules/react-dom') },
  plugins: [{ name: 'next-image-fixture', setup(build) { build.onLoad({ filter: /sfera-logo\.png$/ }, async ({ path: imagePath }) => { const { readFile } = await import('node:fs/promises'); return { contents: `export default { src: 'data:image/png;base64,${(await readFile(imagePath)).toString('base64')}', width: 2048, height: 468 }`, loader: 'js' }; }); } }],
  define: { 'process.env.NEXT_PUBLIC_CONVEX_URL': '"http://127.0.0.1:4319"', 'process.env.NODE_ENV': '"development"' } });
await ctx.serve({ host: '127.0.0.1', port: 4319, servedir: out });
console.log('Local fixture preview: http://127.0.0.1:4319 (no production data)');
