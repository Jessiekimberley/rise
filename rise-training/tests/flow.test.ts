import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { appendCheckIn, type DocsConfig } from '../lib/google';
import { buildReport, lastPerformance, progressPoints, weekStart } from '../lib/insights';
import { commandSchema, emptyHabits, sessionKey, type SetLog } from '../lib/model';
import { plans } from '../lib/programme';
import { schema, trainingStore } from '../lib/storage';
import { readWeeks, docTarget, type DocContent } from '../lib/coach-doc';
import { programmeWeek, workoutPlan } from '../lib/weeks';
import { scheduleRestChime } from '../lib/rest-audio';

test('workout, concurrent set saves, habits and coach report survive a database restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rise-flow-'));
  let database = new PGlite(directory);
  const connect = () => trainingStore(async (query, params) => (await database.query(query, params)).rows as Record<string, unknown>[]);
  try {
    await database.exec(schema);
    const owner = 'athlete';
    let store = connect();
    const date = '2026-11-23';
    const slot = { date, planId: 'lower-1', slotId: 'leg-press' };
    const set: SetLog = { exerciseId: 'leg-press', variant: '', weight: 45, reps: 8, seconds: null, effort: 7 };
    assert.equal(commandSchema.safeParse({ type: 'putSet', ...slot, index: 0, set }).success, true);
    await Promise.all([
      store.mutate(owner, { type: 'putSet', ...slot, index: 0, set }),
      store.mutate(owner, { type: 'putSet', ...slot, index: 1, set: { ...set, weight: 47.5, effort: 8 } }),
    ]);
    await store.mutate(owner, { type: 'substitute', ...slot, exerciseId: 'squat', variant: 'Barbell' });
    await store.mutate(owner, { type: 'putSet', ...slot, index: 2, set: { ...set, exerciseId: 'squat', variant: 'Barbell' } });
    await store.mutate(owner, { type: 'finish', date, planId: slot.planId });
    await store.mutate(owner, { type: 'habits', date, data: { ...emptyHabits, steps: 9100, water: 3, sleep: 7.5, nutrition: 'Ate before training', recovery: 'Good energy' } });
    await database.close();
    database = new PGlite(directory);
    store = connect();
    const snapshot = await store.load(owner);
    const session = snapshot.data.sessions[sessionKey(date, slot.planId)];
    assert.ok(session.finishedAt);
    assert.equal(session.slots['leg-press'].sets[0].exerciseId, 'leg-press');
    assert.equal(session.slots['leg-press'].sets[2].exerciseId, 'squat');
    assert.equal(lastPerformance(snapshot.data, '2026-11-24', 'leg-press', '')?.sets[1].weight, 47.5);
    assert.deepEqual(progressPoints(snapshot.data, 'leg-press', '', 'weight'), [{ date, value: 47.5 }]);
    assert.equal(weekStart('2026-11-25'), date);
    assert.deepEqual(plans.map(({ day }) => day), [1, 2, 4, 5]);
    const report = buildReport(snapshot.data, 'midweek', date, '2026-11-25');
    assert.match(report.text, /Leg Press, set 2: 47.5 kg · 8 reps · RPE 8/);
    assert.match(report.text, /Back Squat \(Barbell\), set 3/);
    assert.match(report.text, /9,100 steps\n3 L water\n7.5 hr sleep/);
    assert.match(report.text, /Recovery: Good energy/);
    const id = 'da9a7572-7f8e-440a-9012-36004e1f47eb';
    await store.mutate(owner, { type: 'checkIn', data: { id, kind: 'midweek', start: date, end: '2026-11-25', text: report.text } });
    await store.mutate(owner, { type: 'preparePublish', id, target: { documentId: 'fixture-file', tabId: 't.0' } });
    await assert.rejects(() => store.mutate(owner, { type: 'checkIn', data: { id, kind: 'midweek', start: date, end: '2026-11-25', text: 'Changed' } }), /locked/);
    await store.mutate(owner, { type: 'markPublished', id, text: report.text });
    assert.ok((await store.load(owner)).data.checkIns[id].publishedAt);
    assert.deepEqual((await store.load('other')).data.sessions, {});
  } finally {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Google Docs sync appends only in the configured tab and deduplicates a retry', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config: DocsConfig = { documentId: 'target-file', tabId: 't.0', clientEmail: 'rise@example.test', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
  let content = 'Coach’s original plan\n';
  let requests = 0;
  const mock: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.match(String(init?.body), /assertion=/);
      return Response.json({ access_token: 'mock' });
    }
    assert.match(url, /^https:\/\/docs\.googleapis\.com\/v1\/documents\/target-file[?:]/);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body.writeControl, { requiredRevisionId: 'revision-current' });
      assert.deepEqual(body.requests[0].insertText.endOfSegmentLocation, { tabId: 't.0' });
      content += body.requests[0].insertText.text;
      requests++;
      return Response.json({});
    }
    return Response.json({ revisionId: 'revision-current', tabs: [{ tabProperties: { tabId: 't.0' }, documentTab: { body: { content: [{ paragraph: { elements: [{ textRun: { content } }] } }] } } }] });
  };
  const title = 'Midweek training check-in · 23 Nov–25 Nov 2026';
  assert.deepEqual(await appendCheckIn(config, title, 'Set results\nNotes', mock), { duplicate: false });
  assert.deepEqual(await appendCheckIn(config, title, 'Set results\nNotes', mock), { duplicate: true });
  assert.equal(requests, 1);
  assert.equal(content, `Coach’s original plan\n\n\n${title}\n\nSet results\nNotes`);
});

test('coach updates advance weeks and keep the original prescription with existing sets', () => {
  const paragraph = (text: string): DocContent => ({ paragraph: { elements: [{ textRun: { content: `${text}\n` } }] } });
  const table = (day: number, weight: string, rest: string): DocContent => ({
    table: { tableRows: [ [`Day ${day}`, 'Strength'], ['Exercise', 'Sets', 'Reps', 'Rest', 'Weight', 'Cues'],
      ['Leg Press', '4', '8', rest, weight, 'Controlled reps'] ].map((cells) => ({ tableCells: cells.map((cell) => ({ content: [paragraph(cell)] })) })) },
  });
  const content = [paragraph('Week 1'), ...[1, 2, 4, 5].map((day) => table(day, '32.5 kg', '2:00')),
    paragraph('Week 2'), paragraph('Coach notes: Keep the negative controlled.'), ...[1, 2, 4, 5].map((day) => table(day, '37.5 kg', '1:30 after both legs')),
    paragraph('Weekly training check-in · 23 Nov–29 Nov 2026'), paragraph('Private test log which is not a coach note.')];
  const versions = readWeeks(content, 1, '2026-11-30T00:00:00Z');
  assert.equal(versions[1].plans[0].exercises[0].coachKg, 37.5);
  assert.equal(versions[1].plans[0].exercises[0].rest, 90);
  assert.deepEqual(versions[1].notes, ['Keep the negative controlled.']);
  const startedOn = '2026-11-23';
  assert.equal(programmeWeek('2026-11-30', startedOn), 2);
  const data = { startedOn, weeks: { 1: versions[0], 2: versions[1] }, sessions: {
    '2026-11-23:lower-1': { date: '2026-11-23', planId: 'lower-1', startedAt: '2026-11-23T00:00:00Z', plan: versions[0].plans[0], slots: {} },
  }, habits: {}, checkIns: {} };
  assert.equal(workoutPlan(data, '2026-11-23', 'lower-1')?.exercises[0].coachKg, 32.5);
  assert.equal(workoutPlan(data, '2026-11-30', 'lower-1')?.exercises[0].coachKg, 37.5);
  assert.throws(() => docTarget('https://fake.example/document/d/fake/edit'));
});

test('the rest chime is scheduled at the prescribed rest deadline', () => {
  const starts: number[] = [];
  const context = {
    currentTime: 15,
    createOscillator: () => ({ frequency: {}, connect: (target: unknown) => target, start: (time: number) => starts.push(time), stop: () => {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
  } as unknown as AudioContext;
  assert.equal(scheduleRestChime(context, 90).length, 2);
  assert.deepEqual(starts, [105, 105.23]);
});
