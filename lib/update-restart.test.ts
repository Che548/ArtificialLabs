import { expect, test, vi } from 'vitest';
import { createRestartPreparation } from './update-restart';

test('restart saves first, is single flight and respects late blocking', async () => {
  const gate = createRestartPreparation();
  const calls: string[] = [];
  gate.register(async () => { await Promise.resolve(); calls.push('saved'); });
  const reload = async () => { calls.push('reload'); };
  const a = gate.run(() => true, reload);
  expect(gate.run(() => true, reload)).toBe(a);
  expect(await a).toBe(true);
  expect(calls).toEqual(['saved', 'reload']);
  let allowed = true;
  gate.register(async () => { allowed = false; });
  expect(await gate.run(() => allowed, reload)).toBe(false);
  expect(calls.filter(c => c === 'reload')).toHaveLength(1);
});

test('failed preservation and blocked operations never reload or clear drafts', async () => {
  const gate = createRestartPreparation();
  const reload = vi.fn(async () => {});
  const remove = gate.register(async () => { throw new Error('SAVE_FAILED'); });
  expect(await gate.run(() => false, reload)).toBe(false);
  await expect(gate.run(() => true, reload)).rejects.toThrow('SAVE_FAILED');
  expect(reload).not.toHaveBeenCalled();
  remove();
  expect(await gate.run(() => true, reload)).toBe(true);
});
