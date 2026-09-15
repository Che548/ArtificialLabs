import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { EXPECTED_READER_VERSION } from '../../../lib/reader-version';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    accessSync(
      process.env.STRIPCV_CLI || path.resolve(process.cwd(), '../web-build/stripcv-native/stripcv_cli'),
      constants.X_OK,
    );
    const models = process.env.STRIPCV_MODELS || path.resolve(process.cwd(), '../modules/strip-cv/models/reader-20260914');
    for (const name of ['detector', 'points', 'presence', 'coverage', 'auxiliary', 'local_bands']) {
      accessSync(path.join(models, `${name}.onnx`), constants.R_OK);
    }
    return Response.json({ status: 'ok', expectedAlgorithmVersion: EXPECTED_READER_VERSION }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
