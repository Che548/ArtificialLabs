import assert from 'node:assert/strict';
import test from 'node:test';
import { submitConsentOnce } from './chat-consent';

test('two taps save consent and continue a pending message only once', async () => {
  const lock = { current: false };
  let release!: () => void;
  let saves = 0;
  let sends = 0;
  const save = () => {
    saves++;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const first = submitConsentOnce(lock, save, () => {
    sends++;
  });
  assert.equal(
    await submitConsentOnce(lock, save, () => {
      sends++;
    }),
    false,
  );
  assert.equal(sends, 0);
  release();
  assert.equal(await first, true);
  assert.equal(saves, 1);
  assert.equal(sends, 1);
  assert.equal(lock.current, false);
});
test('failed consent does not consume a draft and permits explicit retry', async () => {
  const lock = { current: false };
  let draft = 'Synthetic draft';
  let sends = 0;
  const next = () => {
    sends++;
    draft = '';
  };
  await assert.rejects(
    submitConsentOnce(
      lock,
      async () => {
        throw new Error('offline');
      },
      next,
    ),
  );
  assert.equal(draft, 'Synthetic draft');
  assert.equal(sends, 0);
  assert.equal(lock.current, false);
  await submitConsentOnce(lock, async () => {}, next);
  assert.equal(sends, 1);
});
test('accepting standalone consent does not send or clear the draft', async () => {
  const draft = 'Synthetic draft';
  await submitConsentOnce(
    { current: false },
    async () => {},
    () => {},
  );
  assert.equal(draft, 'Synthetic draft');
});
