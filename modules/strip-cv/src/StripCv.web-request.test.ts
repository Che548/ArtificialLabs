import assert from 'node:assert/strict';
import test from 'node:test';

import { toStripCvCliRequest } from './StripCv.web-request.ts';

test('maps the TypeScript StripCV request to the CLI wire schema', () => {
  const assayProfile = { schema_version: '1.0', id: 'assay' };
  const cardProfile = { schema_version: '1.0', id: 'card' };
  const options = { cutoff: 1.25 };

  assert.deepEqual(
    toStripCvCliRequest(
      {
        imageUri: 'blob:test-image',
        assayProfile,
        cardProfile,
        options,
      },
      {
        base64: 'AAEC',
        width: 1,
        height: 1,
        rowStride: 3,
      },
    ),
    {
      assay_profile: assayProfile,
      card_profile: cardProfile,
      options,
      rgb_base64: 'AAEC',
      width: 1,
      height: 1,
      row_stride: 3,
    },
  );
});
