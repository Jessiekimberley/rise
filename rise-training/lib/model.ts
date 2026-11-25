import { z } from 'zod';
import { canonicalVariant, exerciseOptions, type Exercise, type Plan } from './programme';
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
const stepCount = z.number().int().min(0).max(200_000);

export const habitsSchema = z.object({
  steps: stepCount.nullable(),
  water: blankableNumber(30),
  sleep: blankableNumber(24),
  nutrition: text,
  recovery: text,
  sleepQuality: z.enum(['Deep', 'OK', 'Broken']).optional(),
  fuelling: z.array(z.string().min(1).max(100)).max(5).optional(),
});

export const stepSyncSchema = z.strictObject({ date, steps: stepCount });

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
  z.object({ type: z.literal('completeExercise'), ...slot, rir: blankableNumber(3, true) }),
  z.object({ type: z.literal('saveWarmup'), ...slot, set: setSchema.nullable() }),
  z.object({ type: z.literal('substitute'), ...slot, exerciseId: key, variant: variation, recurring: z.boolean().optional() }),
  z.object({ type: z.literal('note'), ...slot, text }),
  z.object({ type: z.literal('habits'), date, data: habitsSchema }),
  z.object({ type: z.literal('patchHabits'), date, data: habitsSchema.partial() }),
  z.object({ type: z.literal('bottleSize'), litres: z.number().finite().min(0.05).max(5) }),
  z.object({ type: z.literal('programmeStart'), date }),
  z.object({ type: z.literal('checkIn'), data: checkInSchema }),
  z.object({ type: z.literal('preparePublish'), id: z.uuid(), target: z.object({ documentId: z.string(), tabId: z.string() }) }),
  z.object({ type: z.literal('markPublished'), id: z.uuid(), text: z.string().trim().min(1).max(24_000) }),
]);

export type Command = z.infer<typeof commandSchema> | { type: 'syncProgramme'; date: string; weeks: CoachWeek[] } |
  ({ type: 'syncSteps' } & z.infer<typeof stepSyncSchema>) |
  { type: 'saveSchedule'; days: Readonly<Record<string, number>> } |
  { type: 'docsTarget'; mode: 'programme' | 'checkIns'; target: DocTarget; update?: { date: string; weeks: CoachWeek[] } };
export type HabitLog = z.infer<typeof habitsSchema>;
export type SetLog = z.infer<typeof setSchema> & { exerciseName?: string; perSide?: Exercise['perSide'] };
export type CheckIn = z.infer<typeof checkInSchema> & { publishedAt?: string; publishingAt?: string; publishTarget?: DocTarget };
export type SlotLog = {
  exerciseId: string;
  variant: string;
  sets: Record<number, SetLog>;
  completion?: { completedAt: string; rir: number | null };
  warmup?: SetLog;
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
  recurringSwaps?: Record<string, { exerciseId: string; variant: string; from: string }>;
  bottleLitres?: number;
  scheduledDays?: Record<string, number>;
};
export type TrainingSnapshot = { revision: number; data: TrainingData };

export const createData = (): TrainingData => ({ sessions: {}, habits: {}, checkIns: {} });
export const emptyHabits: HabitLog = { steps: null, water: null, sleep: null, nutrition: '', recovery: '' };
export const sessionKey = (date: string, planId: string) => `${date}:${planId}`;

export function firstOpenSet(exercise: Exercise, sets: SlotLog['sets']) {
  return Array.from({ length: exercise.sets }, (_, index) => index).find((index) => !sets[index]);
}

const swapKey = (planId: string, exerciseId: string) => `${planId}:${exerciseId}`;

export function effectiveSlot(data: TrainingData, date: string, planId: string, exercise: Exercise): SlotLog {
  const saved = data.sessions[sessionKey(date, planId)]?.slots[exercise.id];
  if (saved) return saved;
  const recurring = data.recurringSwaps?.[swapKey(planId, exercise.id)];
  const variant = recurring && recurring.from <= date && recurring.exerciseId === exercise.id && exerciseOptions(exercise.id).includes(recurring.variant)
    ? recurring.variant : '';
  return { exerciseId: exercise.id, variant, sets: {}, note: '' };
}

export class TrainingValidationError extends Error {}

function checkSelection(data: TrainingData, date: string, exerciseId: string, variant: string, workout: Plan) {
  const exercise = programmeExercises(data, [workout, ...weekPlans(data, date)]).find((item) => item.id === exerciseId);
  if (!exercise || (variant && !exercise.variants?.includes(variant) && !exerciseOptions(exercise.id).includes(canonicalVariant(exercise.id, variant)))) {
    throw new TrainingValidationError('Choose an exercise and equipment from the programme.');
  }
  return exercise;
}

export function applyCommand(data: TrainingData, command: Command, now: string) {
  if ('date' in command && command.type !== 'syncSteps') data.startedOn ??= mondayOf(command.date);
  switch (command.type) {
    case 'programmeStart':
      data.startedOn = command.date;
      return;
    case 'saveSchedule':
      data.scheduledDays = { ...command.days, ...data.scheduledDays };
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
    case 'patchHabits':
      data.habits[command.date] = { ...emptyHabits, ...data.habits[command.date], ...command.data };
      return;
    case 'syncSteps':
      data.habits[command.date] = { ...emptyHabits, ...data.habits[command.date], steps: command.steps };
      return;
    case 'bottleSize':
      data.bottleLitres = command.litres;
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
  const log = active.slots[original.id] ??= effectiveSlot(data, command.date, plan.id, original);
  switch (command.type) {
    case 'saveWarmup':
    case 'putSet': {
      const warmup = command.type === 'saveWarmup';
      const set = command.set;
      if (set === null) {
        delete log.warmup;
        break;
      }
      const selection = checkSelection(data, command.date, set.exerciseId, set.variant, plan);
      const oldSet = warmup ? log.warmup : log.sets[command.index];
      const expected = oldSet ?? log;
      if (expected.exerciseId !== set.exerciseId || expected.variant !== set.variant) {
        throw new TrainingValidationError('The exercise selection changed. Reopen this set.');
      }
      if (selection.metric === 'seconds' ? !set.seconds || set.reps !== null || set.weight !== null :
        !set.reps || set.seconds !== null || (selection.metric === 'bodyweight' && set.weight !== null)) {
        throw new TrainingValidationError('Enter the reps or duration you completed.');
      }
      const entry = { ...set, exerciseName: selection.name, perSide: selection.perSide };
      if (warmup) log.warmup = entry;
      else log.sets[command.index] = entry;
      break;
    }
    case 'removeSet':
      delete log.sets[command.index];
      if (firstOpenSet(original, log.sets) !== undefined) delete log.completion;
      if (!Object.values(active.slots).some((item) => Object.keys(item.sets).length)) delete active.finishedAt;
      break;
    case 'completeExercise':
      if (firstOpenSet(original, log.sets) !== undefined) {
        throw new TrainingValidationError('Log every working set before marking this exercise done.');
      }
      log.completion = { completedAt: log.completion?.completedAt ?? now, rir: command.rir };
      break;
    case 'substitute':
      checkSelection(data, command.date, command.exerciseId, command.variant, plan);
      if (command.recurring) {
        if (command.exerciseId !== original.id || !exerciseOptions(original.id).includes(command.variant)) {
          throw new TrainingValidationError('Choose a recurring option from this exercise.');
        }
        (data.recurringSwaps ??= {})[swapKey(plan.id, original.id)] = { exerciseId: command.exerciseId, variant: command.variant, from: command.date };
      }
      log.exerciseId = command.exerciseId;
      log.variant = command.variant;
      break;
    case 'note':
      log.note = command.text;
      break;
  }
}
