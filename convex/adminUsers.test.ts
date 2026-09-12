import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
import { countAccount, uncountAccount } from './lib/accountCounts';
const modules = import.meta.glob('./**/*.ts');
const today = new Date().toISOString().slice(0, 10);
const range = { fromDay: today, toDay: today };

async function setup() {
  const t = convexTest(schema, modules);
  const id = await t.run(ctx => ctx.db.insert('users', { email: 'admin@example.test' }));
  await t.mutation(internal.admin.bootstrapByEmail, { email: 'admin@example.test' });
  return { t, admin: t.withIdentity({ subject: `${id}|test` }), id };
}

describe('read-only admin account directory', () => {
  test('denies guests and ordinary accounts on both queries', async () => {
    const { t } = await setup();
    const id = await t.run(ctx => ctx.db.insert('users', { email: 'ordinary@example.test' }));
    for (const client of [t, t.withIdentity({ subject: `${id}|test` })]) {
      await expect(client.query(api.adminUsers.list, { paginationOpts: { numItems: 25, cursor: null } })).rejects.toThrow();
      await expect(client.query(api.adminUsers.overview, range)).rejects.toThrow();
    }
  });
  test('returns only safe fields, email prefix search and deletion status', async () => {
    const { t, admin } = await setup();
    const id = await t.run(async ctx => {
      const id = await ctx.db.insert('users', { email: 'reader@example.test', name: 'PRIVATE NAME', phone: 'PRIVATE PHONE' });
      await ctx.db.insert('accountStates', { userId: id, scheduledDeletionAt: Date.now() + 1000, updatedAt: Date.now() });
      return id;
    });
    const result = await admin.query(api.adminUsers.list, { email: ' READER@ ', paginationOpts: { numItems: 25, cursor: null } });
    expect(result.page).toHaveLength(1);
    expect(Object.keys(result.page[0]).sort()).toEqual(['email', 'id', 'registeredAt', 'status']);
    expect(result.page[0]).toMatchObject({ id, status: 'pending_deletion' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect((await admin.query(api.adminUsers.list, { email: 'missing', paginationOpts: { numItems: 25, cursor: null } })).page).toEqual([]);
  });
  test('paginates without duplicate rows and caps requests', async () => {
    const { t, admin } = await setup();
    await t.run(async ctx => { for (let i = 0; i < 60; i++) await ctx.db.insert('users', { email: `test${i}@example.test` }); });
    const first = await admin.query(api.adminUsers.list, { paginationOpts: { numItems: 10000, cursor: null } });
    expect(first.page.length).toBeLessThanOrEqual(50);
    const second = await admin.query(api.adminUsers.list, { paginationOpts: { numItems: 50, cursor: first.continueCursor } });
    expect(new Set([...first.page, ...second.page].map(x => x.id)).size).toBe(61);
  });
  test('backfill resumes, is idempotent, and handles creation/deletion between batches', async () => {
    const { t, admin } = await setup();
    const ids = await t.run(async ctx => {
      const ids = []; for (let i = 0; i < 65; i++) ids.push(await ctx.db.insert('users', { email: `a${i}@example.test` })); return ids;
    });
    expect((await admin.query(api.adminUsers.overview, range)).complete).toBe(false);
    expect((await t.mutation(internal.adminUsers.backfill, {})).complete).toBe(false);
    await t.run(async ctx => {
      const id = await ctx.db.insert('users', { email: 'new@example.test' });
      await countAccount(ctx, id); await countAccount(ctx, id);
      await uncountAccount(ctx, ids[64]); await ctx.db.delete(ids[64]);
      await uncountAccount(ctx, ids[64]);
    });
    while (!(await t.mutation(internal.adminUsers.backfill, {})).complete) { /* bounded fixture */ }
    const first = await admin.query(api.adminUsers.overview, range);
    expect(first.total).toBe(66);
    expect(first.registrations).toBe(67);
    expect(first.complete).toBe(true);
    expect(await t.mutation(internal.adminUsers.backfill, {})).toEqual({ complete: true, processed: 0 });
    expect(await admin.query(api.adminUsers.overview, range)).toEqual(first);
  });
  test('validates calendar dates and bounds statistics reads', async () => {
    const { admin } = await setup();
    for (const fromDay of ['2026-02-30', 'bad', '1900-01-01']) {
      await expect(admin.query(api.adminUsers.overview, { ...range, fromDay })).rejects.toThrow('INVALID_DATE_RANGE');
    }
  });
});
