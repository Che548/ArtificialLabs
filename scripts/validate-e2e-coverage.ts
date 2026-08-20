import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Capability = {
  id: string;
  platforms: string[];
  evidence: string[];
};

const matrix = JSON.parse(
  readFileSync('tests/e2e/coverage-matrix.json', 'utf8'),
) as { capabilities: Capability[]; deferred: string[]; excluded: string[] };

assert(matrix.capabilities.length > 0, 'Coverage matrix is empty');
assert.equal(
  new Set(matrix.capabilities.map(({ id }) => id)).size,
  matrix.capabilities.length,
  'Coverage matrix contains duplicate capability ids',
);

for (const capability of matrix.capabilities) {
  assert(capability.evidence.length > 0, `${capability.id}: missing evidence`);
  assert(capability.platforms.length > 0, `${capability.id}: missing platform`);
  if (capability.platforms.includes('ios')) {
    assert(
      capability.platforms.includes('android'),
      `${capability.id}: native capability must cover both clients`,
    );
  }
}

console.log(
  `Functional coverage matrix: ${matrix.capabilities.length}/${matrix.capabilities.length} in-scope capabilities mapped; ${matrix.deferred.length} deferred; ${matrix.excluded.length} development-only exclusions.`,
);
