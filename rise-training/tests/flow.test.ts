import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { appendCheckIn, type DocsConfig } from '../lib/google';
import { blocksForDates, buildReport, lastPerformance, ordinal, progressPoints, scheduledProgrammeDay, temporarySchedule, todayKey, trainingWeekStart, weekStart, workoutElapsedMs, workoutsThisWeek } from '../lib/insights';
import { applyCommand, commandSchema, createData, effectiveSlot, emptyHabits, sessionKey, type SetLog } from '../lib/model';
import { plans, prescribedReps } from '../lib/programme';
import { reviewProgramme } from '../lib/programme-review';
import { schema, trainingStore } from '../lib/storage';
import { readWeeks, docTarget, type DocContent } from '../lib/coach-doc';
import { programmeWeek, workoutPlan } from '../lib/weeks';
import { scheduleRestChime } from '../lib/rest-audio';
import { readStoredZip } from '../lib/plain-xlsx';
import { setsPdf, setsWorkbook, workoutCsv } from '../lib/workout-export';

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

test('a set list can grow or shrink, and warm-up, upper, and lower stay out of the strength record', () => {
  const data = createData();
  const date = '2026-11-25';
  const slot = { date, planId: 'lower-1', slotId: 'rdl' };
  const now = `${date}T00:00:00Z`;
  const set: SetLog = { exerciseId: 'rdl', variant: '', weight: 40, reps: 8, seconds: null, effort: null };
  const log = () => data.sessions[sessionKey(date, slot.planId)].slots.rdl;

  applyCommand(data, commandSchema.parse({ type: 'addSet', ...slot }), now);
  assert.equal(log().setCount, 4);
  applyCommand(data, { type: 'putSet', ...slot, index: 0, set }, now);
  applyCommand(data, { type: 'putSet', ...slot, index: 2, set: { ...set, weight: 50 } }, now);
  applyCommand(data, { type: 'putSet', ...slot, index: 3, set: { ...set, weight: 60 } }, now);
  applyCommand(data, commandSchema.parse({ type: 'dropSet', ...slot, index: 0 }), now);
  assert.equal(log().setCount, 3);
  assert.equal(log().sets[0], undefined);
  assert.equal(log().sets[1].weight, 50);
  assert.equal(log().sets[2].weight, 60);

  applyCommand(data, commandSchema.parse({ type: 'addSet', ...slot, kind: 'upper' }), now);
  applyCommand(data, commandSchema.parse({ type: 'addSet', ...slot, kind: 'lower' }), now);
  applyCommand(data, commandSchema.parse({ type: 'addSet', ...slot, kind: 'warmup' }), now);
  applyCommand(data, { type: 'saveWarmup', ...slot, kind: 'upper', set: { ...set, weight: 200 } }, now);
  applyCommand(data, { type: 'saveWarmup', ...slot, kind: 'lower', set: { ...set, weight: 30 } }, now);
  assert.equal(log().upper?.weight, 200);
  assert.equal(log().lower?.weight, 30);
  assert.equal(log().showWarmup, true);
  assert.deepEqual(progressPoints(data, 'rdl', '', 'weight'), [{ date, value: 60 }]);

  applyCommand(data, commandSchema.parse({ type: 'dropSet', ...slot, kind: 'upper' }), now);
  assert.equal(log().upper, undefined);
  assert.equal(log().showUpper, false);
  assert.equal(log().lower?.weight, 30);
  applyCommand(data, { type: 'dropSet', ...slot, index: 1 }, now);
  applyCommand(data, { type: 'dropSet', ...slot, index: 0 }, now);
  assert.equal(log().setCount, 1);
  assert.throws(() => applyCommand(data, { type: 'dropSet', ...slot, index: 0 }, now), /at least one working set/);
  assert.equal(commandSchema.safeParse({ type: 'addSet', ...slot, kind: 'cardio' }).success, false);
});

test('an unfinished workout can be discarded, and a submitted one cannot', () => {
  const data = createData();
  const date = '2026-11-18';
  const now = `${date}T01:00:00Z`;
  const session = { date, planId: 'lower-1' };
  const key = sessionKey(date, session.planId);
  applyCommand(data, commandSchema.parse({ type: 'start', ...session }), now);
  assert.equal(data.sessions[key].startedAt, now);
  applyCommand(data, { type: 'discard', ...session }, now);
  assert.equal(key in data.sessions, false);
  applyCommand(data, { type: 'discard', date: '2026-11-19', planId: 'upper-1' }, now);

  const set: SetLog = { exerciseId: 'leg-press', variant: '', weight: 40, reps: 8, seconds: null, effort: null };
  applyCommand(data, { type: 'putSet', ...session, slotId: 'leg-press', index: 0, set }, now);
  applyCommand(data, { type: 'finish', ...session }, now);
  assert.throws(() => applyCommand(data, { type: 'discard', ...session }, now), /already submitted/);
  assert.equal(data.sessions[key].finishedAt, now);
});

test('submitted workouts count inside their calendar week', () => {
  const data = createData();
  const set: SetLog = { exerciseId: 'leg-press', variant: '', weight: 40, reps: 8, seconds: null, effort: null };
  function finish(date: string) {
    const session = { date, planId: 'lower-1', slotId: 'leg-press' };
    applyCommand(data, { type: 'putSet', ...session, index: 0, set }, `${date}T01:00:00Z`);
    applyCommand(data, { type: 'finish', date, planId: 'lower-1' }, `${date}T02:00:00Z`);
  }
  finish('2026-11-22');
  finish('2026-11-23');
  applyCommand(data, { type: 'start', date: '2026-11-24', planId: 'upper-1' }, '2026-11-24T01:00:00Z');
  finish('2026-11-25');
  assert.equal(workoutsThisWeek(data, '2026-11-25'), 2);
  assert.equal(workoutsThisWeek(data, '2026-11-22'), 1);
  assert.equal(ordinal(1), '1st');
  assert.equal(ordinal(2), '2nd');
  assert.equal(ordinal(3), '3rd');
  assert.equal(ordinal(4), '4th');
  assert.equal(ordinal(11), '11th');
  assert.equal(ordinal(13), '13th');
  assert.equal(ordinal(21), '21st');
});

test('an open workout clock can be reset, and a restart clears its sets', () => {
  const data = createData();
  const date = '2026-11-25';
  const now = `${date}T01:00:00Z`;
  const later = `${date}T02:15:00Z`;
  const session = { date, planId: 'lower-1' };
  const key = sessionKey(date, session.planId);
  const set: SetLog = { exerciseId: 'leg-press', variant: '', weight: 40, reps: 8, seconds: null, effort: null };
  assert.throws(() => applyCommand(data, { type: 'resetClock', ...session }, now), /Start the workout/);
  applyCommand(data, commandSchema.parse({ type: 'start', ...session }), now);
  applyCommand(data, { type: 'putSet', ...session, slotId: 'leg-press', index: 0, set }, now);
  applyCommand(data, commandSchema.parse({ type: 'resetClock', ...session }), later);
  assert.equal(data.sessions[key].startedAt, later);
  assert.equal(data.sessions[key].pausedAt, undefined);
  assert.equal(data.sessions[key].slots['leg-press'].sets[0].weight, 40);

  applyCommand(data, commandSchema.parse({ type: 'pauseClock', ...session }), later);
  applyCommand(data, commandSchema.parse({ type: 'restart', ...session }), later);
  assert.equal(data.sessions[key].startedAt, later);
  assert.equal(data.sessions[key].pausedAt, undefined);
  assert.equal(data.sessions[key].pausedMs, undefined);
  assert.equal(data.sessions[key].slotOrder, undefined);
  assert.deepEqual(data.sessions[key].slots, {});

  applyCommand(data, { type: 'putSet', ...session, slotId: 'leg-press', index: 0, set }, later);
  applyCommand(data, { type: 'finish', ...session }, later);
  assert.throws(() => applyCommand(data, { type: 'resetClock', ...session }, later), /already submitted/);
  assert.throws(() => applyCommand(data, { type: 'restart', ...session }, later), /already submitted/);
  assert.equal(data.sessions[key].slots['leg-press'].sets[0].weight, 40);
});

test('a stopped workout clock keeps the gym time and a paused reset stays at zero', () => {
  const data = createData();
  const date = '2026-11-25';
  const start = `${date}T01:00:00.000Z`;
  const paused = `${date}T01:10:00.000Z`;
  const resumed = `${date}T01:40:00.000Z`;
  const session = { date, planId: 'lower-1' };
  const key = sessionKey(date, session.planId);
  const minutes = (count: number) => count * 60 * 1000;

  assert.throws(() => applyCommand(data, { type: 'pauseClock', ...session }, start), /Start the workout/);
  assert.throws(() => applyCommand(data, { type: 'resumeClock', ...session }, start), /Start the workout/);
  applyCommand(data, commandSchema.parse({ type: 'start', ...session }), start);
  applyCommand(data, commandSchema.parse({ type: 'pauseClock', ...session }), paused);
  applyCommand(data, commandSchema.parse({ type: 'pauseClock', ...session }), resumed);
  const open = data.sessions[key];
  assert.equal(open.startedAt, start);
  assert.equal(open.pausedAt, paused);
  assert.equal(open.pausedMs, undefined);
  assert.equal(workoutElapsedMs(open, Date.parse(resumed)), minutes(10));

  applyCommand(data, commandSchema.parse({ type: 'resumeClock', ...session }), resumed);
  applyCommand(data, commandSchema.parse({ type: 'resumeClock', ...session }), `${date}T01:50:00.000Z`);
  assert.equal(open.pausedAt, undefined);
  assert.equal(open.pausedMs, minutes(30));
  assert.equal(workoutElapsedMs(open, Date.parse(resumed)), minutes(10));
  assert.equal(workoutElapsedMs(open, Date.parse(`${date}T01:45:00.000Z`)), minutes(15));

  applyCommand(data, commandSchema.parse({ type: 'pauseClock', ...session }), `${date}T01:50:00.000Z`);
  applyCommand(data, commandSchema.parse({ type: 'resetClock', ...session }), `${date}T02:00:00.000Z`);
  assert.equal(open.startedAt, `${date}T02:00:00.000Z`);
  assert.equal(open.pausedAt, `${date}T02:00:00.000Z`);
  assert.equal(open.pausedMs, undefined);
  assert.equal(workoutElapsedMs(open, Date.parse(`${date}T02:30:00.000Z`)), 0);

  applyCommand(data, commandSchema.parse({ type: 'resumeClock', ...session }), `${date}T02:05:00.000Z`);
  const set: SetLog = { exerciseId: 'leg-press', variant: '', weight: 40, reps: 8, seconds: null, effort: null };
  applyCommand(data, { type: 'putSet', ...session, slotId: 'leg-press', index: 0, set }, `${date}T02:10:00.000Z`);
  applyCommand(data, commandSchema.parse({ type: 'pauseClock', ...session }), `${date}T02:20:00.000Z`);
  applyCommand(data, { type: 'finish', ...session }, `${date}T02:35:00.000Z`);
  assert.equal(open.finishedAt, `${date}T02:35:00.000Z`);
  assert.equal(open.pausedAt, undefined);
  assert.equal(open.pausedMs, minutes(20));
  assert.equal(open.slots['leg-press'].sets[0].weight, 40);
  assert.equal(workoutElapsedMs(open, Date.parse(`${date}T03:00:00.000Z`)), minutes(15));
  assert.throws(() => applyCommand(data, { type: 'pauseClock', ...session }, `${date}T03:00:00.000Z`), /already submitted/);
  assert.throws(() => applyCommand(data, { type: 'resumeClock', ...session }, `${date}T03:00:00.000Z`), /already submitted/);
});

test('logged habits sit on the day’s record and under that day’s workout notes', () => {
  const date = '2026-11-25';
  const now = `${date}T01:00:00Z`;
  const data = createData();
  assert.equal(buildReport(data, 'weekly', date, date).text, '');
  const logged = {
    steps: 8640, waterHitTarget: true, sleep: 7.5,
    sleepNote: 'Woke once around 3am, still felt rested.',
    fuellingNote: 'Oats and eggs before training, big rice bowl after.',
  };
  assert.equal(commandSchema.safeParse({ type: 'patchHabits', date, data: logged }).success, true);
  applyCommand(data, { type: 'patchHabits', date, data: logged }, now);
  const habits = [
    'Wednesday, 25 Nov',
    'Habits',
    'Steps: 8,640 (goal 8,000–10,000)',
    'Water 3–4 L: Yes',
    'Sleep: 7.5 h (goal 7–8 h). Woke once around 3am, still felt rested.',
    'Fuelling: Oats and eggs before training, big rice bowl after.',
  ].join('\n');
  assert.equal(buildReport(data, 'weekly', date, date).text, habits);

  const session = { date, planId: 'lower-1' };
  const set: SetLog = { exerciseId: 'leg-press', variant: '', weight: 40, reps: 8, seconds: null, effort: null };
  applyCommand(data, { type: 'putSet', ...session, slotId: 'leg-press', index: 0, set }, now);
  applyCommand(data, { type: 'note', ...session, slotId: 'leg-press', text: 'Felt steady.' }, now);
  const withWorkout = buildReport(data, 'weekly', date, date).text;
  assert.match(withWorkout, /Leg Press notes: Felt steady\.\nHabits\nSteps: 8,640/);

  const id = 'da9a7572-7f8e-440a-9012-36004e1f47eb';
  applyCommand(data, { type: 'checkIn', data: { id, kind: 'weekly', start: date, end: date, text: withWorkout } }, now);
  applyCommand(data, { type: 'markPublished', id, text: withWorkout }, now);
  applyCommand(data, { type: 'patchHabits', date, data: { waterHitTarget: false } }, now);
  assert.equal(data.checkIns[id].text, withWorkout);
  assert.match(buildReport(data, 'weekly', date, date).text, /Water 3–4 L: No/);
  assert.doesNotMatch(data.checkIns[id].text, /Water 3–4 L: No/);

  applyCommand(data, { type: 'patchHabits', date, data: { steps: null, waterHitTarget: null, sleep: null, sleepNote: null, fuellingNote: null } }, now);
  assert.doesNotMatch(buildReport(data, 'weekly', date, date).text, /Habits/);
});

test('check-in lists exercises in the order they were logged, and a day can carry a note', () => {
  const date = '2026-11-25';
  const now = `${date}T01:00:00Z`;
  const data = createData();
  const session = { date, planId: 'lower-1' };
  const key = sessionKey(date, session.planId);
  const set = (exerciseId: string): SetLog => ({ exerciseId, variant: '', weight: 40, reps: 8, seconds: null, effort: null });
  applyCommand(data, { type: 'putSet', ...session, slotId: 'rdl', index: 0, set: set('rdl') }, `${date}T01:00:00Z`);
  applyCommand(data, { type: 'putSet', ...session, slotId: 'leg-press', index: 0, set: set('leg-press') }, `${date}T01:10:00Z`);
  assert.deepEqual(data.sessions[key].slotOrder, ['rdl', 'leg-press']);
  const names = () => buildReport(data, 'weekly', date, date).days[0].sets.map((row) => row.exercise);
  assert.deepEqual(names(), ['RDL', 'Leg Press']);

  const slots = data.sessions[key].slots;
  data.sessions[key].slots = { 'leg-press': slots['leg-press'], rdl: slots.rdl };
  assert.deepEqual(names(), ['RDL', 'Leg Press']);

  delete data.sessions[key].slotOrder;
  assert.deepEqual(names(), ['Leg Press', 'RDL']);

  data.sessions[key].slots.rdl.completion = { completedAt: `${date}T01:05:00Z`, rir: 2 };
  data.sessions[key].slots['leg-press'].completion = { completedAt: `${date}T01:20:00Z`, rir: 2 };
  assert.deepEqual(names(), ['RDL', 'Leg Press']);

  assert.equal(commandSchema.safeParse({ type: 'dayNote', date, text: 'Knee felt good.' }).success, true);
  applyCommand(data, { type: 'dayNote', date, text: '  Knee felt good.\nEasy session. ' }, now);
  const report = buildReport(data, 'weekly', date, date);
  assert.equal(report.days[0].dayNote, 'Knee felt good.\nEasy session.');
  assert.match(report.text, /Notes: Knee felt good\.\nEasy session\./);
  applyCommand(data, { type: 'dayNote', date, text: '   ' }, now);
  assert.equal(data.dayNotes, undefined);
  assert.equal(buildReport(data, 'weekly', date, date).days[0].dayNote, undefined);

  applyCommand(data, { type: 'dayNote', date: '2026-11-26', text: 'Rest day walk.' }, now);
  const rest = buildReport(data, 'weekly', '2026-11-26', '2026-11-26');
  assert.equal(rest.days[0]?.dayNote, 'Rest day walk.');
  assert.match(rest.text, /Thursday, 26 Nov\nNotes: Rest day walk\./);
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
    assert.match(report.text, /Monday, 23 Nov · /);
    assert.equal(report.days[0]?.weekday, 'Monday');
    assert.equal(report.days[0]?.sets.find((set) => set.set === 2)?.weight, 47.5);
    assert.match(report.text, /Leg Press, set 2: 47.5 kg · 8 reps · RIR 2/);
    assert.match(report.text, /Back squat \(Barbell\), set 3/);
    assert.match(report.text, /Leg Press · final set RIR 3\+/);
    assert.equal(snapshot.data.habits[date].steps, 9100);
    assert.match(report.text, /Habits\nSteps: 9,100 \(goal 8,000–10,000\)\nSleep: 7\.5 h \(goal 7–8 h\)\./);
    assert.doesNotMatch(report.text, /Daily habits/);
    assert.doesNotMatch(report.text, /Water/);
    assert.doesNotMatch(report.text, /Ate before training/);
    assert.doesNotMatch(report.text, /Good energy/);
    const selected = blocksForDates(snapshot.data, [date, '2026-11-24', '2026-11-25']);
    assert.equal(selected.find((day) => day.date === '2026-11-24')?.sets.length, 0);
    const pdf = new TextDecoder().decode(setsPdf(selected));
    assert.match(pdf, /^%PDF-1.4\n/);
    assert.match(pdf, /%%EOF\n$/);
    assert.ok(pdf.includes('(Leg Press)'));
    assert.ok(pdf.includes('(47.5)'));
    assert.ok(pdf.includes('(No sets logged)'));
    assert.ok(pdf.includes('Paused'));
    assert.ok(pdf.includes('Finished'));
    const sheet = readStoredZip(setsWorkbook(selected)).get('xl/worksheets/sheet1.xml') ?? '';
    assert.match(sheet, /Monday, 23 Nov 2026 · Lower body · Finished/);
    assert.match(sheet, /Leg Press/);
    assert.match(sheet, /<v>47\.5<\/v>/);
    assert.match(sheet, /No sets logged/);
    assert.match(sheet, /Paused/);
    assert.match(sheet, /9,100/);
    assert.doesNotMatch(sheet, /<f>/);
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
    const edited = await store.mutate(owner, commandSchema.parse({ type: 'checkIn', data: { ...checkIn, text: 'Updated log' } }));
    assert.equal(edited.data.checkIns[id].text, 'Updated log');
    assert.ok(edited.data.checkIns[id].publishedAt);
    const deleted = await store.mutate(owner, commandSchema.parse({ type: 'deleteCheckIn', id: midweekId }));
    assert.equal(deleted.data.checkIns[midweekId], undefined);
    assert.equal(deleted.data.checkIns[id].text, 'Updated log');
    const deletedSent = await store.mutate(owner, commandSchema.parse({ type: 'deleteCheckIn', id }));
    assert.equal(deletedSent.data.checkIns[id], undefined);
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
