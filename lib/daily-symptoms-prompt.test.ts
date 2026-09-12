import assert from 'node:assert/strict';
import test from 'node:test';
import { createDailyPromptClaim, localDayKey } from './daily-symptoms-prompt';

test('uses the local calendar date, including month/year boundaries', () => {
  assert.equal(localDayKey(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
  assert.equal(localDayKey(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('shows once, survives a new session, and allows the next local day', async () => {
  let saved: string | undefined;
  const read = async () => saved;
  const write = async (day: string) => { saved = day; };
  const first = createDailyPromptClaim(read, write);
  assert.equal(await first(new Date(2026, 8, 12, 9)), true);
  assert.equal(await first(new Date(2026, 8, 12, 21)), false);
  const restarted = createDailyPromptClaim(read, write);
  assert.equal(await restarted(new Date(2026, 8, 12, 22)), false);
  assert.equal(await restarted(new Date(2026, 8, 13, 0, 1)), true);
});

test('deduplicates simultaneous foreground events', async () => {
  let writes = 0;
  const claim = createDailyPromptClaim(async () => undefined, async () => { writes += 1; });
  const date = new Date(2026, 8, 12);
  assert.deepEqual(await Promise.all([claim(date), claim(date), claim(date)]), [true, false, false]);
  assert.equal(writes, 1);
});

test('a storage failure can be retried', async () => {
  let failed = true;
  const claim = createDailyPromptClaim(async () => undefined, async () => {
    if (failed) throw new Error('storage unavailable');
  });
  const date = new Date(2026, 8, 12);
  await assert.rejects(claim(date));
  failed = false;
  assert.equal(await claim(date), true);
});
