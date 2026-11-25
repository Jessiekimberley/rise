import { z } from 'zod';
import { revisionCovering, type ProgrammeSnapshot } from './prescription';
import { canonicalVariant, dayKind, exerciseOptions, findPlan, programmeDays, type Exercise, type Plan } from './programme';
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
  waterHitTarget: z.boolean().nullable().optional(),
  sleepNote: text.nullable().optional(),
  fuellingNote: text.nullable().optional(),
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
  z.object({ type: z.literal('discard'), ...session }),
  z.object({ type: z.literal('pauseClock'), ...session }),
  z.object({ type: z.literal('resumeClock'), ...session }),
  z.object({ type: z.literal('resetClock'), ...session }),
  z.object({ type: z.literal('restart'), ...session }),
  z.object({ type: z.literal('putSet'), ...slot, index: z.number().int().min(0).max(19), set: setSchema }),
  z.object({ type: z.literal('removeSet'), ...slot, index: z.number().int().min(0).max(19) }),
  z.object({ type: z.literal('addSet'), ...slot, kind: z.enum(['warmup', 'upper', 'lower']).optional() }),
  z.object({ type: z.literal('dropSet'), ...slot, index: z.number().int().min(0).max(19).optional(), kind: z.enum(['warmup', 'upper', 'lower']).optional() }),
  z.object({ type: z.literal('completeExercise'), ...slot, rir: blankableNumber(3, true) }),
  z.object({ type: z.literal('saveWarmup'), ...slot, kind: z.enum(['warmup', 'upper', 'lower']).optional(), set: setSchema.nullable() }),
  z.object({ type: z.literal('substitute'), ...slot, exerciseId: key, variant: variation, recurring: z.boolean().optional() }),
  z.object({ type: z.literal('note'), ...slot, text }),
  z.object({ type: z.literal('dayNote'), date, text }),
  z.object({ type: z.literal('habits'), date, data: habitsSchema }),
  z.object({ type: z.literal('patchHabits'), date, data: habitsSchema.partial() }),
  z.object({ type: z.literal('bottleSize'), litres: z.number().finite().min(0.05).max(5) }),
  z.object({ type: z.literal('programmeStart'), date }),
  z.object({ type: z.literal('checkIn'), data: checkInSchema }),
  z.object({ type: z.literal('deleteCheckIn'), id: z.uuid() }),
  z.object({ type: z.literal('preparePublish'), id: z.uuid(), target: z.object({ documentId: z.string(), tabId: z.string() }) }),
  z.object({ type: z.literal('markPublished'), id: z.uuid(), text: z.string().trim().min(1).max(24_000) }),
  z.object({ type: z.literal('logWorkout'), workoutNumber: z.number().int().min(1).max(7) }),
]);

export type Command = z.infer<typeof commandSchema> | { type: 'syncProgramme'; date: string; weeks: CoachWeek[] } |
  ({ type: 'syncSteps' } & z.infer<typeof stepSyncSchema>) |
  { type: 'saveSchedule'; days: Readonly<Record<string, number>> } |
  { type: 'docsTarget'; mode: 'programme' | 'checkIns'; target: DocTarget; update?: { date: string; weeks: CoachWeek[] } };
export type HabitLog = z.infer<typeof habitsSchema>;
export type SetLog = z.infer<typeof setSchema> & { exerciseName?: string; perSide?: Exercise['perSide'] };
export type CheckIn = z.infer<typeof checkInSchema> & { publishedAt?: string; publishingAt?: string; publishTarget?: DocTarget };
export const extraKinds = ['warmup', 'upper', 'lower'] as const;
export type ExtraKind = typeof extraKinds[number];
export const extraIndex: Record<ExtraKind, number> = { warmup: -1, upper: -2, lower: -3 };
export const extraLabel: Record<ExtraKind, string> = { warmup: 'Warm-up', upper: 'Upper', lower: 'Lower' };

export type SlotLog = {
  exerciseId: string;
  variant: string;
  sets: Record<number, SetLog>;
  setCount?: number;
  completion?: { completedAt: string; rir: number | null };
  warmup?: SetLog;
  upper?: SetLog;
  lower?: SetLog;
  showWarmup?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  note: string;
};
export type Session = {
  date: string;
  planId: string;
  startedAt: string;
  finishedAt?: string;
  pausedAt?: string;
  pausedMs?: number;
  plan?: Plan;
  slots: Record<string, SlotLog>;
  slotOrder?: string[];
};
export type WorkoutCompletion = {
  workoutNumber: number;
  completedAt: string;
  isRepeat: boolean;
};
export type TrainingData = {
  sessions: Record<string, Session>;
  completions?: WorkoutCompletion[];
  habits: Record<string, HabitLog>;
  checkIns: Record<string, CheckIn>;
  startedOn?: string;
  weeks?: Record<number, CoachWeek>;
  docs?: Partial<Record<'programme' | 'checkIns', DocTarget>>;
  recurringSwaps?: Record<string, { exerciseId: string; variant: string; from: string }>;
  bottleLitres?: number;
  scheduledDays?: Record<string, number>;
  dayNotes?: Record<string, string>;
};
export type TrainingSnapshot = { revision: number; data: TrainingData };

export const createData = (): TrainingData => ({ sessions: {}, habits: {}, checkIns: {} });
export const emptyHabits: HabitLog = { steps: null, water: null, sleep: null, nutrition: '', recovery: '' };
export const sessionKey = (date: string, planId: string) => `${date}:${planId}`;

export function extraKindFor(index: number) {
  return extraKinds.find((kind) => extraIndex[kind] === index);
}

export function workingSetCount(prescribed: number, log: Pick<SlotLog, 'sets' | 'setCount'>) {
  const highest = Object.keys(log.sets).reduce((max, key) => {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 ? Math.max(max, index) : max;
  }, -1);
  return Math.min(20, Math.max(1, log.setCount ?? prescribed, highest + 1));
}

export function firstOpenSet(exercise: Exercise, log: Pick<SlotLog, 'sets' | 'setCount'>) {
  const count = workingSetCount(exercise.sets, log);
  return Array.from({ length: count }, (_, index) => index).find((index) => !log.sets[index]);
}

function slotHasWork(slot: SlotLog) {
  return Object.keys(slot.sets).length > 0 || Boolean(slot.warmup || slot.upper || slot.lower);
}

export function orderedSlots(session: Session): [string, SlotLog][] {
  const ids = Object.keys(session.slots);
  const planIds = (session.plan?.exercises ?? findPlan(session.planId)?.exercises ?? []).map((exercise) => exercise.id);
  const planRank = new Map(planIds.map((id, index) => [id, index]));
  const byPlan = (a: string, b: string) => (planRank.get(a) ?? 1_000) - (planRank.get(b) ?? 1_000) || a.localeCompare(b);
  const recorded = (session.slotOrder ?? []).filter((id) => session.slots[id]);
  if (recorded.length) {
    const seen = new Set(recorded);
    const rest = ids.filter((id) => !seen.has(id)).sort(byPlan);
    return [...recorded, ...rest].map((id) => [id, session.slots[id]]);
  }
  const performed = ids.filter((id) => slotHasWork(session.slots[id]));
  const finished = performed.length > 0 && performed.every((id) => session.slots[id].completion?.completedAt);
  const sorted = finished
    ? [...ids].sort((a, b) => {
      const aTime = session.slots[a].completion?.completedAt;
      const bTime = session.slots[b].completion?.completedAt;
      if (aTime && bTime) return aTime.localeCompare(bTime) || byPlan(a, b);
      if (aTime) return -1;
      if (bTime) return 1;
      return byPlan(a, b);
    })
    : [...ids].sort(byPlan);
  return sorted.map((id) => [id, session.slots[id]]);
}

export function extraShown(log: Pick<SlotLog, ExtraKind | 'showWarmup' | 'showUpper' | 'showLower'>, kind: ExtraKind, barbell = false) {
  if (log[kind]) return true;
  const shown = kind === 'warmup' ? log.showWarmup : kind === 'upper' ? log.showUpper : log.showLower;
  if (shown != null) return shown;
  return kind === 'warmup' && barbell;
}

function showExtra(log: SlotLog, kind: ExtraKind, shown: boolean) {
  if (kind === 'warmup') log.showWarmup = shown;
  else if (kind === 'upper') log.showUpper = shown;
  else log.showLower = shown;
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

const aucklandKey = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Pacific/Auckland' }).format(new Date(iso));

function shiftDateKey(date: string, days: number) {
  const noon = new Date(`${date}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

function mondayKey(date: string) {
  const noon = new Date(`${date}T12:00:00Z`);
  return shiftDateKey(date, -((noon.getUTCDay() + 6) % 7));
}

function inAucklandWeek(iso: string, start: string, end: string) {
  const key = aucklandKey(iso);
  return key >= start && key < end;
}

function recordCompletion(data: TrainingData, workoutNumber: number, completedAt: string) {
  const start = mondayKey(aucklandKey(completedAt));
  const end = shiftDateKey(start, 7);
  const repeat = (data.completions ?? []).some((item) => item.workoutNumber === workoutNumber && inAucklandWeek(item.completedAt, start, end))
    || Object.values(data.sessions).some((session) => {
      if (!session.finishedAt || session.finishedAt === completedAt || !inAucklandWeek(session.finishedAt, start, end)) return false;
      return (session.plan?.day ?? findPlan(session.planId)?.day) === workoutNumber;
    });
  (data.completions ??= []).push({ workoutNumber, completedAt, isRepeat: repeat });
}

function settlePause(session: Session, now: string) {
  if (!session.pausedAt) return;
  const total = (session.pausedMs ?? 0) + Math.max(0, Date.parse(now) - Date.parse(session.pausedAt));
  if (total > 0) session.pausedMs = total;
  else delete session.pausedMs;
  delete session.pausedAt;
}

function checkSelection(data: TrainingData, date: string, exerciseId: string, variant: string, workout: Plan, prescription?: ProgrammeSnapshot | null) {
  const exercise = programmeExercises(data, [workout, ...weekPlans(data, date, undefined, prescription)]).find((item) => item.id === exerciseId);
  if (!exercise || (variant && !exercise.variants?.includes(variant) && !exerciseOptions(exercise.id).includes(canonicalVariant(exercise.id, variant)))) {
    throw new TrainingValidationError('Choose an exercise and equipment from the programme.');
  }
  return exercise;
}

export function applyCommand(data: TrainingData, command: Command, now: string, prescription?: ProgrammeSnapshot | null) {
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
    case 'dayNote': {
      const note = command.text.trim();
      const notes = data.dayNotes ?? {};
      if (note) notes[command.date] = note;
      else delete notes[command.date];
      if (Object.keys(notes).length) data.dayNotes = notes;
      else delete data.dayNotes;
      return;
    }
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
      if (existing?.publishingAt && !existing.publishedAt) throw new TrainingValidationError('This check-in is locked for Google Docs.');
      data.checkIns[command.data.id] = existing?.publishedAt
        ? { ...command.data, publishedAt: existing.publishedAt, publishTarget: existing.publishTarget }
        : command.data;
      return;
    }
    case 'deleteCheckIn':
      delete data.checkIns[command.id];
      return;
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
    case 'logWorkout': {
      const live = prescription ? revisionCovering(prescription.state, aucklandKey(now))?.days.find((item) => item.day === command.workoutNumber) : undefined;
      const day = live ?? programmeDays.find((item) => item.day === command.workoutNumber);
      if (!day || dayKind(day.type) === 'strength') throw new TrainingValidationError('Finish the strength workout to log it.');
      recordCompletion(data, command.workoutNumber, now);
      return;
    }
  }

  const plan = workoutPlan(data, command.date, command.planId, prescription);
  if (!plan) throw new TrainingValidationError('This workout is not in the programme.');
  const sessionId = sessionKey(command.date, plan.id);
  if (command.type === 'discard') {
    if (data.sessions[sessionId]?.finishedAt) throw new TrainingValidationError('This workout is already submitted.');
    delete data.sessions[sessionId];
    return;
  }
  if (command.type === 'pauseClock' || command.type === 'resumeClock' || command.type === 'resetClock' || command.type === 'restart') {
    const existing = data.sessions[sessionId];
    if (!existing) throw new TrainingValidationError('Start the workout before changing the clock.');
    if (existing.finishedAt) throw new TrainingValidationError('This workout is already submitted.');
    if (command.type === 'pauseClock') {
      existing.pausedAt ??= now;
      return;
    }
    if (command.type === 'resumeClock') {
      settlePause(existing, now);
      return;
    }
    existing.startedAt = now;
    delete existing.pausedMs;
    if (command.type === 'resetClock' && existing.pausedAt) existing.pausedAt = now;
    else delete existing.pausedAt;
    if (command.type === 'restart') {
      existing.slots = {};
      delete existing.slotOrder;
    }
    return;
  }
  const active = data.sessions[sessionId] ??= { date: command.date, planId: plan.id, plan: structuredClone(plan), startedAt: now, slots: {} };
  if (command.type === 'finish') {
    if (!Object.values(active.slots).some((item) => Object.keys(item.sets).length)) {
      throw new TrainingValidationError('Log a set before finishing this workout.');
    }
    settlePause(active, now);
    if (!active.finishedAt) recordCompletion(data, plan.day, now);
    active.finishedAt ??= now;
  }
  if (command.type === 'start' || command.type === 'finish') return;

  const original = plan.exercises.find((item) => item.id === command.slotId);
  if (!original) throw new TrainingValidationError('This exercise is not in the workout.');
  const slotExercise = original;
  const log = active.slots[slotExercise.id] ??= effectiveSlot(data, command.date, plan.id, slotExercise);
  const loggedOn = command.date;
  const loggedPlan = plan;
  function loggedSet(set: z.infer<typeof setSchema>, previous: { exerciseId: string; variant: string }) {
    const selection = checkSelection(data, loggedOn, set.exerciseId, set.variant, loggedPlan, prescription);
    if (previous.exerciseId !== set.exerciseId || previous.variant !== set.variant) {
      throw new TrainingValidationError('The exercise selection changed. Reopen this set.');
    }
    if (selection.metric === 'seconds' ? !set.seconds || set.reps !== null || set.weight !== null :
      !set.reps || set.seconds !== null || (selection.metric === 'bodyweight' && set.weight !== null)) {
      throw new TrainingValidationError('Enter the reps or duration you completed.');
    }
    return { ...set, exerciseName: selection.name, perSide: selection.perSide };
  }
  function rememberSlot() {
    if (active.slotOrder?.includes(slotExercise.id)) return;
    active.slotOrder = [...(active.slotOrder ?? []), slotExercise.id];
  }

  switch (command.type) {
    case 'saveWarmup': {
      const kind = command.kind ?? 'warmup';
      if (command.set === null) {
        delete log[kind];
        break;
      }
      log[kind] = loggedSet(command.set, log[kind] ?? log);
      rememberSlot();
      break;
    }
    case 'putSet':
      log.sets[command.index] = loggedSet(command.set, log.sets[command.index] ?? log);
      rememberSlot();
      break;
    case 'addSet':
      if (command.kind) showExtra(log, command.kind, true);
      else {
        const count = workingSetCount(original.sets, log);
        if (count >= 20) throw new TrainingValidationError('Twenty sets is the limit.');
        log.setCount = count + 1;
        delete log.completion;
      }
      break;
    case 'dropSet': {
      if ((command.index == null) === (command.kind == null)) throw new TrainingValidationError('Choose a set to remove.');
      if (command.kind) {
        delete log[command.kind];
        showExtra(log, command.kind, false);
        break;
      }
      const count = workingSetCount(original.sets, log);
      const index = command.index ?? 0;
      if (index >= count) throw new TrainingValidationError('That set is not in this exercise.');
      if (count <= 1) throw new TrainingValidationError('Keep at least one working set.');
      const next: SlotLog['sets'] = {};
      for (let position = 0; position < count; position += 1) {
        if (position === index) continue;
        const set = log.sets[position];
        if (set) next[position > index ? position - 1 : position] = set;
      }
      log.sets = next;
      log.setCount = count - 1;
      if (firstOpenSet(original, log) !== undefined) delete log.completion;
      if (!Object.values(active.slots).some((item) => Object.keys(item.sets).length)) delete active.finishedAt;
      break;
    }
    case 'removeSet':
      delete log.sets[command.index];
      if (firstOpenSet(original, log) !== undefined) delete log.completion;
      if (!Object.values(active.slots).some((item) => Object.keys(item.sets).length)) delete active.finishedAt;
      break;
    case 'completeExercise':
      if (firstOpenSet(original, log) !== undefined) {
        throw new TrainingValidationError('Log every working set before marking this exercise done.');
      }
      log.completion = { completedAt: log.completion?.completedAt ?? now, rir: command.rir };
      break;
    case 'substitute':
      checkSelection(data, command.date, command.exerciseId, command.variant, plan, prescription);
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
