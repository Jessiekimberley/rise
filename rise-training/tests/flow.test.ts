import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { appendCheckIn, type DocsConfig } from '../lib/google';
import { buildReport, lastPerformance, progressPoints, scheduledProgrammeDay, temporarySchedule, todayKey, trainingWeekStart, weekStart } from '../lib/insights';
import { applyCommand, commandSchema, createData, effectiveSlot, emptyHabits, sessionKey, type SetLog } from '../lib/model';
import { plans, prescribedReps } from '../lib/programme';
import { reviewProgramme } from '../lib/programme-review';
import { schema, trainingStore } from '../lib/storage';
import { readWeeks, docTarget, type DocContent } from '../lib/coach-doc';
import { programmeWeek, workoutPlan } from '../lib/weeks';
import { scheduleRestChime } from '../lib/rest-audio';
import { workoutCsv } from '../lib/workout-export';

test('the training date rolls over at Auckland midnight in summer and winter', () => {
  assert.equal(todayKey(new Date('2026-11-24T10:59:59Z')), '2026-11-24');
  assert.equal(todayKey(new Date('2026-11-24T11:00:00Z')), '2026-11-25');
  assert.equal(todayKey(new Date('2026-07-07T11:59:59Z')), '2026-07-07');
  assert.equal(todayKey(new Date('2026-07-07T12:00:00Z')), '2026-07-08');
});

test('rep defaults use the lowest count in the coach’s target', () => {
  const exercise = plans[0].exercises[0];
  assert.equal(prescribedReps({ ...exercise, target: '8 reps' }), 8);
  assert.equal(prescribedReps({ ...exercise, target: '10–12 reps' }), 10);
  assert.equal(prescribedReps({ ...exercise, target: '8-10 reps per leg' }), 8);
  assert.equal(prescribedReps({ ...exercise, target: '12 to 15 per side' }), 12);
  assert.equal(prescribedReps({ ...exercise, target: '12–10 reps' }), undefined);
  assert.equal(prescribedReps({ ...exercise, target: 'AMRAP' }), undefined);
  assert.equal(prescribedReps({ ...exercise, metric: 'seconds', target: '30 sec–1 min' }), undefined);
});

test('an optional warm-up stays separate from work sets and strength history', () => {
  const data = createData();
  const date = '2026-11-25';
  const slot = { date, planId: 'lower-2', slotId: 'squat' };
  const set: SetLog = { exerciseId: 'squat', variant: '', weight: 20, reps: 8, seconds: null, effort: null };
  const now = `${date}T00:00:00Z`;
  applyCommand(data, commandSchema.parse({ type: 'saveWarmup', ...slot, set }), now);
  const session = data.sessions[sessionKey(date, slot.planId)];
  assert.equal(session.slots.squat.warmup?.weight, 20);
  assert.deepEqual(session.slots.squat.sets, {});
  assert.deepEqual(progressPoints(data, 'squat', '', 'weight'), []);
  assert.throws(() => applyCommand(data, { ...slot, type: 'finish' }, now), /Log a set/);

  applyCommand(data, { type: 'putSet', ...slot, index: 0, set: { ...set, weight: 42.5 } }, now);
  applyCommand(data, { type: 'finish', ...slot }, now);
  applyCommand(data, { type: 'saveWarmup', ...slot, set: null }, now);
  assert.equal(session.slots.squat.warmup, undefined);
  assert.equal(session.finishedAt, now);
  assert.deepEqual(progressPoints(data, 'squat', '', 'weight'), [{ date, value: 42.5 }]);
});

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
    const complete = commandSchema.parse({ type: 'completeExercise', ...slot, rir: 2 });
    assert.equal(commandSchema.safeParse({ type: 'completeExercise', ...slot, rir: 4 }).success, false);
    assert.equal(commandSchema.safeParse({ type: 'putSet', ...slot, index: 0, set }).success, true);
    await Promise.all([
      store.mutate(owner, { type: 'putSet', ...slot, index: 0, set }),
      store.mutate(owner, { type: 'putSet', ...slot, index: 1, set: { ...set, weight: 47.5, effort: 8 } }),
    ]);
    await assert.rejects(() => store.mutate(owner, complete), /Log every working set/);
    await store.mutate(owner, { type: 'substitute', ...slot, exerciseId: 'squat', variant: 'Barbell' });
    await store.mutate(owner, { type: 'putSet', ...slot, index: 2, set: { ...set, exerciseId: 'squat', variant: 'Barbell' } });
    await store.mutate(owner, { type: 'putSet', ...slot, index: 3, set: { ...set, exerciseId: 'squat', variant: 'Barbell' } });
    const marked = await store.mutate(owner, complete);
    const completedAt = marked.data.sessions[sessionKey(date, slot.planId)].slots[slot.slotId].completion?.completedAt;
    assert.ok(completedAt);
    await store.mutate(owner, complete);
    await store.mutate(owner, { type: 'saveWarmup', ...slot, set: { ...set, exerciseId: 'squat', variant: 'Barbell', weight: 20, effort: null } });
    await store.mutate(owner, { type: 'note', ...slot, text: '= "Paused",\nthen reset' });
    await store.mutate(owner, { type: 'completeExercise', ...slot, rir: 3 });
    await store.mutate(owner, { type: 'finish', date, planId: slot.planId });
    await store.mutate(owner, { type: 'start', date: '2026-12-07', planId: slot.planId });
    await store.mutate(owner, { type: 'habits', date, data: { ...emptyHabits, steps: 9100, water: 3, sleep: 7.5, nutrition: 'Ate before training', recovery: 'Good energy' } });
    await database.close();
    database = new PGlite(directory);
    store = connect();
    const snapshot = await store.load(owner);
    const session = snapshot.data.sessions[sessionKey(date, slot.planId)];
    assert.ok(session.finishedAt);
    assert.equal(session.date, date);
    assert.equal(session.slots['leg-press'].sets[0].exerciseId, 'leg-press');
    assert.equal(session.slots['leg-press'].sets[2].exerciseId, 'squat');
    assert.deepEqual(session.slots['leg-press'].completion, { completedAt, rir: 3 });
    assert.equal(lastPerformance(snapshot.data, '2026-11-24', 'leg-press', '')?.sets[1].weight, 47.5);
    assert.deepEqual(progressPoints(snapshot.data, 'leg-press', '', 'weight'), [{ date, value: 47.5 }]);
    assert.equal(weekStart('2026-11-25'), date);
    assert.deepEqual(plans.map(({ day }) => day), [1, 2, 4, 5]);
    const report = buildReport(snapshot.data, 'weekly', date, '2026-11-25');
    assert.match(report.title, /^Weekly training check-in/);
    assert.match(report.text, /Leg Press, set 2: 47.5 kg · 8 reps · RIR 2/);
    assert.match(report.text, /Back squat \(Barbell\), set 3/);
    assert.match(report.text, /Leg Press · final set RIR 3\+/);
    assert.match(report.text, /9,100 steps\n3 L water\n7.5 hr sleep/);
    assert.match(report.text, /Recovery: Good energy/);
    const csv = workoutCsv(snapshot.data);
    assert.match(csv, /^\uFEFF"Workout date","Workout","Programme day","Status"/);
    assert.match(csv, /"2026-11-23",[^\r\n]+"Finished",[^\r\n]+"Back squat","Barbell","Warm-up",,20,8/);
    assert.match(csv, /"2026-11-23",[^\r\n]+"Leg Press","","Working set",2,47\.5,8/);
    assert.match(csv, /"2026-11-23",[^\r\n]+"Back squat","Barbell","Working set",3,45,8/);
    assert.ok(csv.includes(`"'= ""Paused"",\nthen reset"`));
    assert.match(csv, /"Exercise completed",{8}"[^"]+","3\+"/);
    assert.match(csv, /"2026-12-07",[^\r\n]+"In progress"/);
    const id = 'da9a7572-7f8e-440a-9012-36004e1f47eb';
    const checkIn = { id, kind: 'weekly' as const, start: date, end: '2026-11-25', text: report.text };
    const midweekId = '74d04f5b-8874-4820-9c83-4f1774c14d5f';
    const midweek = await store.mutate(owner, { type: 'checkIn', data: { ...checkIn, id: midweekId, kind: 'midweek' } });
    assert.equal(midweek.data.checkIns[midweekId].kind, 'midweek');
    await store.mutate(owner, { type: 'checkIn', data: checkIn });
    await store.mutate(owner, { type: 'preparePublish', id, target: { documentId: 'fixture-file', tabId: 't.0' } });
    await assert.rejects(() => store.mutate(owner, { type: 'checkIn', data: { ...checkIn, text: 'Changed' } }), /locked/);
    await store.mutate(owner, { type: 'markPublished', id, text: report.text });
    assert.ok((await store.load(owner)).data.checkIns[id].publishedAt);
    assert.deepEqual((await store.load('other')).data.sessions, {});
    const removed = await store.mutate(owner, { type: 'removeSet', ...slot, index: 1 });
    assert.equal(removed.data.sessions[sessionKey(date, slot.planId)].slots[slot.slotId].completion, undefined);
    await assert.rejects(() => store.mutate(owner, complete), /Log every working set/);
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
  const title = 'Weekly training check-in · 23 Nov–25 Nov 2026';
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

test('the temporary workout dates preserve the programme calendar and expire after Sunday', () => {
  const startedOn = '2026-11-23';
  const data = { ...createData(), startedOn };
  applyCommand(data, { type: 'saveSchedule', days: temporarySchedule }, '2026-11-25T08:00:00Z');
  assert.deepEqual(data.scheduledDays, temporarySchedule);
  assert.equal(data.startedOn, startedOn);
  assert.equal(scheduledProgrammeDay('2026-11-25', data), 1);
  assert.equal(scheduledProgrammeDay('2026-11-26', data), 4);
  assert.equal(scheduledProgrammeDay('2026-11-27', data), 5);
  assert.equal(scheduledProgrammeDay('2026-11-28', { startedOn: '2026-11-25' }), 6);
  assert.equal(scheduledProgrammeDay('2026-11-29', { startedOn: '2026-11-25' }), 7);
  assert.equal(scheduledProgrammeDay('2026-11-30', data), 1);
  assert.equal(scheduledProgrammeDay('2026-11-30', { startedOn: '2026-11-25' }), 6);
  assert.equal(trainingWeekStart('2026-11-25', startedOn), startedOn);
});

test('reviewed midweek changes preserve started workouts, and recurring swaps keep set histories separate', () => {
  const data = createData();
  const date = '2026-11-23';
  const upcoming = '2026-11-30';
  const now = '2026-11-23T09:30:00Z';
  const plan = plans[0];
  const legPress = plan.exercises[0];
  const rdl = plan.exercises[1];
  applyCommand(data, { type: 'start', date, planId: plan.id }, now);
  applyCommand(data, { type: 'substitute', date, planId: plan.id, slotId: rdl.id, exerciseId: rdl.id, variant: 'Dumbbells', recurring: true }, now);
  const updated = [{ number: 1, refreshedAt: now, plans: [{ ...plan, exercises: [{ ...legPress, target: '10 reps' }, ...plan.exercises.slice(1)] }, ...plans.slice(1)] }];
  const target = { documentId: 'fixture-file', tabId: 't.0' };
  const review = reviewProgramme(updated, data, target);
  assert.deepEqual(review.changes.map(({ exercise }) => exercise), ['Leg Press']);
  assert.equal(reviewProgramme(updated.map((week) => ({ ...week, refreshedAt: 'later' })), data, target).fingerprint, review.fingerprint);
  assert.equal(workoutPlan(data, upcoming, plan.id)?.exercises[0].target, '8 reps');
  applyCommand(data, { type: 'syncProgramme', date, weeks: updated }, now);
  assert.equal(workoutPlan(data, date, plan.id)?.exercises[0].target, '8 reps');
  assert.equal(workoutPlan(data, upcoming, plan.id)?.exercises[0].target, '10 reps');
  assert.equal(reviewProgramme(updated, data, target).changes.length, 0);
  assert.equal(effectiveSlot(data, upcoming, plan.id, rdl).variant, 'Dumbbells');
  applyCommand(data, { type: 'substitute', date: upcoming, planId: plan.id, slotId: rdl.id, exerciseId: rdl.id, variant: 'Barbell' }, now);
  assert.equal(effectiveSlot(data, upcoming, plan.id, rdl).variant, 'Barbell');
  assert.equal(effectiveSlot(data, '2026-12-07', plan.id, rdl).variant, 'Dumbbells');
});
