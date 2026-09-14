import { accessSync, constants } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    accessSync(
      process.env.STRIPCV_CLI || path.resolve(process.cwd(), '../web-build/stripcv-native/stripcv_cli'),
      constants.X_OK,
    );
    const models = process.env.STRIPCV_MODELS || path.resolve(process.cwd(), '../modules/strip-cv/models/reader-20260914');
    for (const name of ['detector', 'points', 'presence', 'coverage', 'auxiliary']) {
      accessSync(path.join(models, `${name}.onnx`), constants.R_OK);
    }
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
