import { z } from 'zod';
import type { Exercise, Plan } from './programme';
import { mondayOf, programmeExercises, weekPlans, workoutPlan, type CoachWeek } from './weeks';
import type { DocTarget } from './coach-doc';

const blankableNumber = (max: number, integer = false) => {
  const number = z.number().finite().min(0).max(max);
  return (integer ? number.int() : number).nullable();
};
const date = z.iso.date();
const key = z.string().min(1).max(64);
const variation = z.string().max(80);
const text = z.string().max(2_000);

export const habitsSchema = z.object({
  steps: blankableNumber(200_000, true),
  water: blankableNumber(30),
  sleep: blankableNumber(24),
  nutrition: text,
  recovery: text,
});

const setSchema = z.object({
  exerciseId: key, variant: variation,
  weight: blankableNumber(5_000),
  reps: blankableNumber(1_000, true),
  seconds: blankableNumber(86_400, true),
  effort: z.number().int().min(1).max(10).nullable(),
});

export const checkInSchema = z.object({
  id: z.uuid(), kind: z.enum(['midweek', 'weekly']), start: date, end: date,
  text: z.string().trim().min(1).max(24_000),
}).refine(({ start, end }) => start <= end, 'Report dates are invalid.');

const session = { date, planId: key };
const slot = { ...session, slotId: key };
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), ...session }),
  z.object({ type: z.literal('finish'), ...session }),
  z.object({ type: z.literal('putSet'), ...slot, index: z.number().int().min(0).max(19), set: setSchema }),
  z.object({ type: z.literal('removeSet'), ...slot, index: z.number().int().min(0).max(19) }),
  z.object({ type: z.literal('substitute'), ...slot, exerciseId: key, variant: variation }),
  z.object({ type: z.literal('note'), ...slot, text }),
  z.object({ type: z.literal('habits'), date, data: habitsSchema }),
  z.object({ type: z.literal('programmeStart'), date }),
  z.object({ type: z.literal('checkIn'), data: checkInSchema }),
  z.object({ type: z.literal('preparePublish'), id: z.uuid(), target: z.object({ documentId: z.string(), tabId: z.string() }) }),
  z.object({ type: z.literal('markPublished'), id: z.uuid(), text: z.string().trim().min(1).max(24_000) }),
]);

export type Command = z.infer<typeof commandSchema> | { type: 'syncProgramme'; date: string; weeks: CoachWeek[] } |
  { type: 'docsTarget'; mode: 'programme' | 'checkIns'; target: DocTarget; update?: { date: string; weeks: CoachWeek[] } };
export type HabitLog = z.infer<typeof habitsSchema>;
export type SetLog = z.infer<typeof setSchema> & { exerciseName?: string; perSide?: Exercise['perSide'] };
export type CheckIn = z.infer<typeof checkInSchema> & { publishedAt?: string; publishingAt?: string; publishTarget?: DocTarget };
export type SlotLog = {
  exerciseId: string;
  variant: string;
  sets: Record<number, SetLog>;
  note: string;
};
export type Session = {
  date: string;
  planId: string;
  startedAt: string;
  finishedAt?: string;
  plan?: Plan;
  slots: Record<string, SlotLog>;
};
export type TrainingData = {
  sessions: Record<string, Session>;
  habits: Record<string, HabitLog>;
  checkIns: Record<string, CheckIn>;
  startedOn?: string;
  weeks?: Record<number, CoachWeek>;
  docs?: Partial<Record<'programme' | 'checkIns', DocTarget>>;
};
export type TrainingSnapshot = { revision: number; data: TrainingData };

export const createData = (): TrainingData => ({ sessions: {}, habits: {}, checkIns: {} });
export const emptyHabits: HabitLog = { steps: null, water: null, sleep: null, nutrition: '', recovery: '' };
export const sessionKey = (date: string, planId: string) => `${date}:${planId}`;

export class TrainingValidationError extends Error {}

function checkSelection(data: TrainingData, date: string, exerciseId: string, variant: string, workout: Plan) {
  const exercise = programmeExercises(data, [workout, ...weekPlans(data, date)]).find((item) => item.id === exerciseId);
  if (!exercise || (variant && !exercise.variants?.includes(variant))) {
    throw new TrainingValidationError('Choose an exercise and equipment from the programme.');
  }
  return exercise;
}

export function applyCommand(data: TrainingData, command: Command, now: string) {
  if ('date' in command) data.startedOn ??= mondayOf(command.date);
  switch (command.type) {
    case 'programmeStart':
      data.startedOn = command.date;
      return;
    case 'syncProgramme': {
      const saved = data.weeks ??= {};
      for (const week of command.weeks) saved[week.number] = week;
      return;
    }
    case 'docsTarget': {
      (data.docs ??= {})[command.mode] = command.target;
      if (command.update) {
        data.startedOn ??= mondayOf(command.update.date);
        const saved = data.weeks ??= {};
        for (const week of command.update.weeks) saved[week.number] = week;
      }
      return;
    }
    case 'habits':
      data.habits[command.date] = command.data;
      return;
    case 'checkIn': {
      const existing = data.checkIns[command.data.id];
      if (existing?.publishedAt || existing?.publishingAt) throw new TrainingValidationError('This check-in is locked for Google Docs.');
      data.checkIns[command.data.id] = command.data;
      return;
    }
    case 'preparePublish': {
      const previous = data.checkIns[command.id];
      if (!previous) throw new TrainingValidationError('Save your check-in before sending it to the Doc.');
      if (!previous.publishedAt) previous.publishingAt ??= now;
      previous.publishTarget ??= command.target;
      return;
    }
    case 'markPublished': {
      const previous = data.checkIns[command.id];
      if (!previous || previous.text !== command.text) throw new TrainingValidationError('The saved check-in changed. Open it again before syncing.');
      previous.publishedAt ??= now;
      delete previous.publishingAt;
      return;
    }
  }

  const plan = workoutPlan(data, command.date, command.planId);
  if (!plan) throw new TrainingValidationError('This workout is not in the programme.');
  const sessionId = sessionKey(command.date, plan.id);
  const active = data.sessions[sessionId] ??= { date: command.date, planId: plan.id, plan, startedAt: now, slots: {} };
  if (command.type === 'finish') {
    if (!Object.values(active.slots).some((item) => Object.keys(item.sets).length)) {
      throw new TrainingValidationError('Log a set before finishing this workout.');
    }
    active.finishedAt ??= now;
  }
  if (command.type === 'start' || command.type === 'finish') return;

  const original = plan.exercises.find((item) => item.id === command.slotId);
  if (!original) throw new TrainingValidationError('This exercise is not in the workout.');
  const log = active.slots[original.id] ??= { exerciseId: original.id, variant: '', sets: {}, note: '' };
  switch (command.type) {
    case 'putSet': {
      const selection = checkSelection(data, command.date, command.set.exerciseId, command.set.variant, plan);
      const oldSet = log.sets[command.index];
      const expected = oldSet ?? log;
      if (expected.exerciseId !== command.set.exerciseId || expected.variant !== command.set.variant) {
        throw new TrainingValidationError('The exercise selection changed. Reopen this set.');
      }
      if (selection.metric === 'seconds' ? !command.set.seconds || command.set.reps !== null || command.set.weight !== null :
        !command.set.reps || command.set.seconds !== null || (selection.metric === 'bodyweight' && command.set.weight !== null)) {
        throw new TrainingValidationError('Enter the reps or duration you completed.');
      }
      log.sets[command.index] = { ...command.set, exerciseName: selection.name, perSide: selection.perSide };
      break;
    }
    case 'removeSet':
      delete log.sets[command.index];
      if (!Object.values(active.slots).some((item) => Object.keys(item.sets).length)) delete active.finishedAt;
      break;
    case 'substitute':
      checkSelection(data, command.date, command.exerciseId, command.variant, plan);
      log.exerciseId = command.exerciseId;
      log.variant = command.variant;
      break;
    case 'note':
      log.note = command.text;
      break;
  }
}
