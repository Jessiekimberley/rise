import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { applyCommand, createData, sessionKey, type SetLog } from '../lib/model';
import { plans } from '../lib/programme';
import {
  applyProgramme, baselineDays, contentBefore, duplicateDay, emptyProgramme, fromDraft, programmeChanges,
  staticHabits, toDraft, type ProgrammeDay, type ProgrammeHabits,
} from '../lib/prescription';
import { programmeSchema, programmeStore, schema, trainingStore } from '../lib/storage';
import { workoutPlan } from '../lib/weeks';

const now = '2026-11-26T00:00:00Z';
const saveId = '6f1c3e8a-1c2b-4d5e-8f90-123456789abc';

function saved(days: ProgrammeDay[] = baselineDays(), effectiveFrom = '2026-11-26', habits: ProgrammeHabits = staticHabits()) {
  return { type: 'save' as const, id: saveId, effectiveFrom, deload: false, weekNote: '', days, habits };
}

test('Brenna’s latest programme replaces calf raises and keeps the split-squat form video', () => {
  const lower = plans.find((plan) => plan.id === 'lower-2');
  assert.deepEqual(lower?.exercises.map((exercise) => exercise.id), ['squat', 'hamstring-curl', 'split-squat', 'cable-crunch', 'leg-raise']);
  const crunch = lower?.exercises.find((exercise) => exercise.id === 'cable-crunch');
  assert.equal(crunch?.sets, 3);
  assert.equal(crunch?.target, '10 reps');
  assert.equal(crunch?.rest, 90);
  assert.equal(lower?.exercises.find((exercise) => exercise.id === 'split-squat')?.video, 'https://youtube.com/shorts/uBSoEWZu07k');
  const days = baselineDays();
  assert.equal(days.find((day) => day.day === 3)?.guidance?.[0], 'BFT class or 20 min run');
  assert.equal(days.find((day) => day.day === 7)?.guidance?.[0], 'BFT class or 20 min run');
  assert.deepEqual(days.find((day) => day.day === 6)?.options?.slice(0, 2), ['20-30 min run', 'BFT class']);
});

test('the editor round-trips the current programme without inventing changes', () => {
  const days = baselineDays();
  const draft = fromDraft(toDraft(days), '8000', '10000', staticHabits());
  assert.equal(draft.ok, true);
  if (!draft.ok) return;
  assert.deepEqual(draft.days, days);
  assert.deepEqual(programmeChanges(contentBefore(emptyProgramme(), '2026-11-26'), { deload: false, weekNote: '', days: draft.days, habits: draft.habits }), []);
});

test('a saved programme never rewrites a logged workout', () => {
  const data = createData();
  const date = '2026-11-25';
  const slot = { date, planId: 'lower-1', slotId: 'leg-press' };
  const set: SetLog = { exerciseId: 'leg-press', variant: '', weight: 80, reps: 8, seconds: null, effort: 8 };
  applyCommand(data, { type: 'putSet', ...slot, index: 0, set }, now);
  applyCommand(data, { type: 'finish', ...slot }, now);
  const logged = data.sessions[sessionKey(date, 'lower-1')];
  const originalName = logged.slots['leg-press'].sets[0].exerciseName;
  const originalTarget = logged.plan?.exercises[0].target;
  const days = baselineDays().map((day) => day.id === 'lower-1' ? {
    ...day,
    exercises: day.exercises.map((exercise) => exercise.id === 'leg-press' ? { ...exercise, name: 'Hack squat', target: '12 reps', sets: 5 } : exercise),
  } : day);
  const state = applyProgramme(emptyProgramme(), { ...saved(days), effectiveFrom: '2026-11-01' }, now);
  assert.equal(logged.plan?.exercises[0].target, originalTarget);
  assert.equal(logged.plan?.exercises[0].name, 'Leg Press');
  assert.equal(logged.slots['leg-press'].sets[0].exerciseName, originalName);
  assert.equal(logged.slots['leg-press'].sets[0].weight, 80);
  assert.equal(state.revisions[0].days.find((day) => day.id === 'lower-1')?.exercises[0].name, 'Hack squat');
  assert.equal(workoutPlan(data, date, 'lower-1', { revision: 1, state })?.exercises[0].name, 'Leg Press');
  assert.equal(workoutPlan(data, '2026-11-30', 'lower-1', { revision: 1, state })?.exercises[0].target, '12 reps');
  assert.equal(workoutPlan(data, '2026-10-01', 'lower-1', { revision: 1, state })?.exercises[0].target, plans[0].exercises[0].target);
});

test('a workout started after a revision keeps that copy when the programme changes again', () => {
  const data = createData();
  const firstDays = baselineDays().map((day) => day.id === 'lower-1' ? {
    ...day, exercises: day.exercises.map((exercise, index) => index === 0 ? { ...exercise, target: '6 reps' } : exercise),
  } : day);
  const first = applyProgramme(emptyProgramme(), saved(firstDays, '2026-11-20'), now);
  applyCommand(data, { type: 'start', date: '2026-11-25', planId: 'lower-1' }, now, { revision: 1, state: first });
  const secondDays = firstDays.map((day) => day.id === 'lower-1' ? {
    ...day, exercises: day.exercises.map((exercise, index) => index === 0 ? { ...exercise, target: '4 reps', coachKg: 100 } : exercise),
  } : day);
  const second = applyProgramme(first, { ...saved(secondDays, '2026-11-25'), id: '6f1c3e8a-1c2b-4d5e-8f90-123456789abd' }, now);
  assert.equal(data.sessions[sessionKey('2026-11-25', 'lower-1')].plan?.exercises[0].target, '6 reps');
  assert.equal(data.sessions[sessionKey('2026-11-25', 'lower-1')].plan?.exercises[0].coachKg, undefined);
  assert.equal(workoutPlan(data, '2026-11-26', 'lower-1', { revision: 2, state: second })?.exercises[0].target, '4 reps');
  assert.match(second.revisions[1].summary.join('\n'), /6 reps → 4 reps/);
});

test('day copies, step targets, deload weeks and coaching notes are saved in order', () => {
  const days = duplicateDay(toDraft(baselineDays()), 2);
  const draft = fromDraft(days, '9000', '12000', staticHabits());
  assert.equal(draft.ok, true);
  if (!draft.ok) return;
  const state = applyProgramme(emptyProgramme(), {
    ...saved(draft.days), deload: true, weekNote: 'Keep the effort easy.', habits: draft.habits,
  }, now);
  const summary = state.revisions[0].summary.join('\n');
  assert.match(summary, /Steps: 8000–10000 → 9000–12000/);
  assert.match(summary, /deload week/i);
  assert.match(summary, /Week note/);
  const noted = applyProgramme(state, { type: 'message', id: '6f1c3e8a-1c2b-4d5e-8f90-123456789abe', author: 'jessie', text: 'Knee felt fine.' }, now);
  const replied = applyProgramme(noted, { type: 'message', id: '6f1c3e8a-1c2b-4d5e-8f90-123456789abf', author: 'brenna', text: 'Keep the next week as written.' }, now);
  assert.deepEqual(replied.messages.map((message) => message.author), ['jessie', 'brenna']);
  assert.equal(applyProgramme(replied, { type: 'message', id: '6f1c3e8a-1c2b-4d5e-8f90-123456789abf', author: 'brenna', text: 'A duplicate send.' }, now).messages.length, 2);
});

test('programme versions live beside the workout log and do not share its revision', async () => {
  const database = new PGlite();
  await database.exec(`${schema}\n${programmeSchema}`);
  const query = async (sql: string, values?: unknown[]) => (await database.query<Record<string, unknown>>(sql, values)).rows;
  const training = trainingStore(query);
  const programmes = programmeStore(query);
  const date = '2026-11-25';
  await training.mutate('rise-owner', { type: 'start', date, planId: 'lower-1' });
  const before = await training.load('rise-owner');
  const days = baselineDays().map((day) => day.id === 'upper-1' ? { ...day, title: 'Pull day' } : day);
  const savedProgramme = await programmes.mutate('rise-owner', saved(days));
  const after = await training.load('rise-owner');
  assert.equal(after.revision, before.revision);
  assert.equal(after.data.sessions[sessionKey(date, 'lower-1')].plan?.exercises[0].name, 'Leg Press');
  assert.equal(savedProgramme.state.revisions[0].days.find((day) => day.id === 'upper-1')?.title, 'Pull day');
  const again = programmeStore(query);
  assert.equal((await again.load('rise-owner')).state.revisions.length, 1);
  await database.close();
});
