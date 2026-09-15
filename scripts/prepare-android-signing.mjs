import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const path = join(process.env.RUNNER_TEMP, 'sfera-android-upload.keystore');
const bytes = Buffer.from(process.env.ANDROID_UPLOAD_KEYSTORE_BASE64 ?? '', 'base64');
if (!bytes.length) throw new Error('Missing upload keystore');
writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' });
writeFileSync(process.env.GITHUB_ENV, `ANDROID_KEYSTORE_PATH=${path}\n`, { flag: 'a' });
