import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { canSyncSteps, isUnlocked, stepSyncToken, unlock } from '../lib/access';
import { buildReport, reportStats } from '../lib/insights';
import { commandSchema, emptyHabits, stepSyncSchema } from '../lib/model';
import { schema, trainingStore } from '../lib/storage';

test('the Shortcut key is separate from the private link and its browser session', (context) => {
  const originalKey = process.env.RISE_ACCESS_KEY;
  context.after(() => {
    if (originalKey === undefined) delete process.env.RISE_ACCESS_KEY;
    else process.env.RISE_ACCESS_KEY = originalKey;
  });
  const key = 'test-private-link-secret-for-step-sync';
  process.env.RISE_ACCESS_KEY = key;
  const token = stepSyncToken();
  assert.ok(token);
  assert.equal(canSyncSteps(`Bearer ${token}`), true);
  assert.equal(canSyncSteps(null), false);
  assert.equal(canSyncSteps(`Bearer ${key}`), false);
  assert.equal(canSyncSteps(`Bearer ${unlock(key)}`), false);
  assert.equal(unlock(token), null);
  assert.equal(isUnlocked(token), false);
});

test('step uploads replace daily totals and preserve the rest of the training log', async () => {
  const database = new PGlite();
  try {
    await database.exec(schema);
    const store = trainingStore(async (query, values) => (await database.query<Record<string, unknown>>(query, values)).rows);
    const owner = 'athlete';
    const firstDay = '2026-11-23';
    const secondDay = '2026-11-24';
    const entry = stepSyncSchema.parse({ date: firstDay, steps: 8000 });
    assert.equal(commandSchema.safeParse({ type: 'syncSteps', ...entry }).success, false);
    assert.equal(stepSyncSchema.safeParse({ ...entry, water: 2 }).success, false);
    assert.equal(stepSyncSchema.safeParse({ ...entry, date: '2026-11-31' }).success, false);
    assert.equal(stepSyncSchema.safeParse({ ...entry, steps: 8000.5 }).success, false);

    const initial = await store.mutate(owner, { type: 'syncSteps', ...entry });
    assert.equal(initial.data.startedOn, undefined);
    const existingHabits = { ...emptyHabits, sleep: 8, water: 2, sleepQuality: 'Deep' as const };
    await store.mutate(owner, { type: 'habits', date: secondDay, data: existingHabits });
    await Promise.all([
      store.mutate(owner, { type: 'syncSteps', date: secondDay, steps: 10000 }),
      store.mutate(owner, { type: 'patchHabits', date: secondDay, data: { nutrition: 'Breakfast' } }),
    ]);
    await store.mutate(owner, { type: 'syncSteps', ...entry });
    const { data } = await store.mutate(owner, { type: 'syncSteps', date: firstDay, steps: 9000 });
    assert.deepEqual(data.habits[firstDay], { ...emptyHabits, steps: 9000 });
    assert.deepEqual(data.habits[secondDay], { ...existingHabits, steps: 10000, nutrition: 'Breakfast' });
    assert.equal(reportStats(data, firstDay, '2026-11-25').steps, 9500);
    assert.match(buildReport(data, 'weekly', firstDay, secondDay).text, /10,000 steps\n2 L water\n8 hr sleep/);
  } finally {
    await database.close();
  }
});
