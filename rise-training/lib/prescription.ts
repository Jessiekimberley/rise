import { z } from 'zod';
import { restDisplay } from './insights';
import { habitTargets, plans, programmeDays, type Exercise, type Plan } from './programme';

export class ProgrammeValidationError extends Error {}

export type ProgrammeDay = {
  id: string;
  day: number;
  type: 'strength' | 'cardio' | 'active-rest';
  title: string;
  note?: string;
  guidance?: string[];
  options?: string[];
  exercises: Exercise[];
};

export type ProgrammeHabits = {
  steps: { min: number; max: number };
  hydrationLitres: { min: number; max: number };
  sleepHours: { min: number; max: number };
};

export type ProgrammeContent = {
  deload: boolean;
  weekNote: string;
  days: ProgrammeDay[];
  habits: ProgrammeHabits;
};

export type ProgrammeRevision = ProgrammeContent & {
  id: string;
  savedAt: string;
  effectiveFrom: string;
  summary: string[];
};

export type CoachAuthor = 'jessie' | 'brenna';
export type CoachMessage = { id: string; at: string; author: CoachAuthor; text: string };
export type ProgrammeState = { revisions: ProgrammeRevision[]; messages: CoachMessage[] };
export type ProgrammeSnapshot = { revision: number; state: ProgrammeState };

const dayTypes = ['strength', 'cardio', 'active-rest'] as const;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const exerciseSchema = z.object({
  id: z.string().regex(idPattern).max(64),
  name: z.string().trim().min(1).max(80),
  target: z.string().trim().min(1).max(80),
  sets: z.number().int().min(1).max(20),
  rest: z.number().int().min(0).max(1_800),
  cue: z.string().max(2_000),
  warmupSets: z.number().int().min(0).max(8).optional(),
  restNote: z.string().max(80).optional(),
  metric: z.enum(['seconds', 'bodyweight']).optional(),
  perSide: z.enum(['leg', 'side']).optional(),
  variants: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  coachWeight: z.string().max(40).optional(),
  coachKg: z.number().finite().min(0).max(500).optional(),
  rirTarget: z.number().int().min(0).max(3).nullable().optional(),
  rpeTarget: z.number().int().min(1).max(10).nullable().optional(),
  coachNote: z.string().max(2_000).optional(),
  progression: z.string().max(2_000).optional(),
  video: z.string().trim().max(300).regex(/^https:\/\/\S+$/).optional(),
});

const daySchema = z.object({
  id: z.string().regex(idPattern).max(64),
  day: z.number().int().min(1).max(7),
  type: z.enum(dayTypes),
  title: z.string().trim().min(1).max(40),
  note: z.string().max(500).optional(),
  guidance: z.array(z.string().trim().min(1).max(400)).max(8).optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  exercises: z.array(exerciseSchema).max(12),
});

const range = z.object({ min: z.number().finite().min(0), max: z.number().finite().min(0) });
const habitsSchema = z.object({
  steps: range,
  hydrationLitres: range,
  sleepHours: range,
}).superRefine((habits, context) => {
  for (const [key, limit] of [['steps', 200_000], ['hydrationLitres', 30], ['sleepHours', 24]] as const) {
    const value = habits[key];
    if (value.min > value.max || value.max > limit) {
      context.addIssue({ code: 'custom', message: 'Check the habit ranges.' });
    }
  }
});

export const programmeCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('save'),
    id: z.uuid(),
    effectiveFrom: z.iso.date(),
    deload: z.boolean(),
    weekNote: z.string().max(2_000),
    days: z.array(daySchema).length(7),
    habits: habitsSchema,
  }),
  z.object({
    type: z.literal('message'),
    id: z.uuid(),
    author: z.enum(['jessie', 'brenna']),
    text: z.string().trim().min(1).max(4_000),
  }),
]);

export type ProgrammeCommand = z.infer<typeof programmeCommandSchema>;
export type ExerciseDraft = {
  id: string;
  name: string;
  sets: string;
  warmupSets: string;
  mode: 'reps' | 'time' | 'bodyweight';
  repMin: string;
  repMax: string;
  per: '' | 'leg' | 'side';
  target: string;
  weight: string;
  rest: string;
  restNote: string;
  rir: string;
  rpe: string;
  cue: string;
  coachNote: string;
  progression: string;
  variants: string;
  video?: string;
};
export type DayDraft = {
  id: string;
  type: ProgrammeDay['type'];
  title: string;
  note: string;
  guidance: string;
  options: string;
  exercises: ExerciseDraft[];
};

export const emptyProgramme = (): ProgrammeState => ({ revisions: [], messages: [] });

export function staticHabits(): ProgrammeHabits {
  return {
    steps: { min: habitTargets.steps.min, max: habitTargets.steps.max },
    hydrationLitres: { min: habitTargets.hydrationLitres.min, max: habitTargets.hydrationLitres.max },
    sleepHours: { min: habitTargets.sleepHours.min, max: habitTargets.sleepHours.max },
  };
}

export function revisionCovering(state: ProgrammeState, date: string) {
  return state.revisions.filter((revision) => revision.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.savedAt.localeCompare(a.savedAt))[0];
}

export function latestRevision(state: ProgrammeState) {
  return [...state.revisions].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
}

export function habitGoals(state: ProgrammeState, date: string) {
  return revisionCovering(state, date)?.habits ?? staticHabits();
}

export function plansForRevision(revision: ProgrammeRevision | undefined): Plan[] | undefined {
  if (!revision) return;
  return revision.days.filter((day) => day.type === 'strength' && day.exercises.length)
    .map((day) => ({ id: day.id, day: day.day, name: day.title, exercises: day.exercises }));
}

function dayType(value: string): ProgrammeDay['type'] {
  if (value === 'cardio' || value === 'active-rest') return value;
  return 'strength';
}

export function baselineDays(livePlans?: readonly Plan[]): ProgrammeDay[] {
  const live = livePlans ?? plans;
  return programmeDays.map((day) => {
    const type = dayType(day.type);
    const plan = type === 'strength' ? live.find((item) => item.day === day.day) ?? plans.find((item) => item.day === day.day) : undefined;
    return cleanDay({
      id: plan?.id ?? `day-${day.day}`,
      day: day.day,
      type,
      title: plan?.name ?? day.title,
      note: 'note' in day ? day.note : undefined,
      guidance: 'guidance' in day ? day.guidance : undefined,
      options: 'options' in day ? day.options : undefined,
      exercises: plan ? structuredClone(plan.exercises) : [],
    });
  });
}

export function contentBefore(state: ProgrammeState, effectiveFrom: string, livePlans?: readonly Plan[]): ProgrammeContent {
  const covered = revisionCovering(state, effectiveFrom);
  if (covered) return covered;
  return { deload: false, weekNote: '', days: baselineDays(livePlans), habits: staticHabits() };
}

export function nextId(prefix: string, taken: Iterable<string>) {
  const base = prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item';
  const used = new Set(taken);
  let id = base;
  let count = 2;
  while (used.has(id)) {
    id = `${base}-${count}`.slice(0, 64);
    count += 1;
  }
  return id;
}

export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function listed(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

export function toDraft(days: readonly ProgrammeDay[]): DayDraft[] {
  return days.map((day) => ({
    id: day.id,
    type: day.type,
    title: day.title,
    note: day.note ?? '',
    guidance: (day.guidance ?? []).join('\n'),
    options: (day.options ?? []).join('\n'),
    exercises: day.exercises.map(toExerciseDraft),
  }));
}

function toExerciseDraft(exercise: Exercise): ExerciseDraft {
  const duration = exercise.metric === 'seconds';
  const match = !duration ? exercise.target.match(/^(\d+)(?:\s*(?:[–—-]|to)\s*(\d+))?\s+reps(?:\s+per\s+(leg|side))?$/i) : undefined;
  return {
    id: exercise.id,
    name: exercise.name,
    sets: String(exercise.sets),
    warmupSets: exercise.warmupSets ? String(exercise.warmupSets) : '',
    mode: duration ? 'time' : exercise.metric === 'bodyweight' ? 'bodyweight' : 'reps',
    repMin: match?.[1] ?? '',
    repMax: match?.[2] ?? match?.[1] ?? '',
    per: match?.[3]?.toLowerCase() === 'side' ? 'side' : match?.[3] ? 'leg' : '',
    target: exercise.target,
    weight: exercise.coachKg != null ? String(exercise.coachKg) : exercise.coachWeight ?? '',
    rest: restDisplay(exercise.rest),
    restNote: exercise.restNote ?? '',
    rir: exercise.rirTarget != null ? String(exercise.rirTarget) : '',
    rpe: exercise.rpeTarget != null ? String(exercise.rpeTarget) : '',
    cue: exercise.cue,
    coachNote: exercise.coachNote ?? '',
    progression: exercise.progression ?? '',
    variants: exercise.variants?.join(', ') ?? '',
    video: exercise.video,
  };
}

export function blankExercise(taken: Iterable<string>): ExerciseDraft {
  return {
    id: nextId('exercise', taken),
    name: 'New exercise',
    sets: '3', warmupSets: '', mode: 'reps', repMin: '8', repMax: '10', per: '',
    target: '8–10 reps', weight: '', rest: '1:30', restNote: '', rir: '', rpe: '',
    cue: '', coachNote: '', progression: '', variants: '',
  };
}

export function duplicateDay(days: readonly DayDraft[], index: number) {
  const target = index + 1;
  if (target >= days.length) return [...days];
  const source = structuredClone(days[index]);
  source.id = days[target].id;
  return days.map((day, dayIndex) => dayIndex === target ? source : day);
}

function cleanText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function cleanExercise(exercise: Exercise): Exercise {
  const next: Exercise = {
    id: exercise.id, name: exercise.name.trim(), target: exercise.target.trim(),
    sets: exercise.sets, rest: exercise.rest, cue: exercise.cue.trim(),
  };
  if (exercise.warmupSets) next.warmupSets = exercise.warmupSets;
  if (cleanText(exercise.restNote)) next.restNote = cleanText(exercise.restNote);
  if (exercise.metric) next.metric = exercise.metric;
  if (exercise.perSide) next.perSide = exercise.perSide;
  if (exercise.variants?.length) next.variants = exercise.variants;
  if (cleanText(exercise.coachWeight)) next.coachWeight = cleanText(exercise.coachWeight);
  if (exercise.coachKg != null) next.coachKg = exercise.coachKg;
  if (exercise.rirTarget != null) next.rirTarget = exercise.rirTarget;
  if (exercise.rpeTarget != null) next.rpeTarget = exercise.rpeTarget;
  if (cleanText(exercise.coachNote)) next.coachNote = cleanText(exercise.coachNote);
  if (cleanText(exercise.progression)) next.progression = cleanText(exercise.progression);
  const video = httpsLink(exercise.video);
  if (video) next.video = video;
  return next;
}

function httpsLink(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 300 && /^https:\/\/\S+$/.test(trimmed) ? trimmed : undefined;
}

function cleanDay(day: ProgrammeDay): ProgrammeDay {
  const strength = day.type === 'strength';
  return {
    id: day.id,
    day: day.day,
    type: day.type,
    title: day.title.trim(),
    note: cleanText(day.note),
    guidance: !strength && day.guidance?.length ? day.guidance : undefined,
    options: !strength && day.options?.length ? day.options : undefined,
    exercises: strength ? day.exercises.map(cleanExercise) : [],
  };
}

export function cleanDays(days: readonly ProgrammeDay[]) {
  return days.map((day, index) => cleanDay({ ...day, day: index + 1 }));
}

function whole(value: string, max: number) {
  if (!/^\d{1,6}$/.test(value)) return;
  const number = Number(value);
  return number <= max ? number : undefined;
}

export function fromDraft(days: readonly DayDraft[], stepsMin: string, stepsMax: string, habits: ProgrammeHabits):
  { ok: true; days: ProgrammeDay[]; habits: ProgrammeHabits } | { ok: false; error: string } {
  const minimum = whole(stepsMin, 200_000);
  const maximum = whole(stepsMax, 200_000);
  if (minimum == null || maximum == null || minimum > maximum) return { ok: false, error: 'Enter a step range, lowest to highest.' };
  const stored: ProgrammeDay[] = [];
  const dayIds = new Set<string>();
  for (const [index, day] of days.entries()) {
    if (!day.title.trim()) return { ok: false, error: `Day ${index + 1} needs a name.` };
    if (dayIds.has(day.id)) return { ok: false, error: 'Each day needs its own id.' };
    dayIds.add(day.id);
    const exercises: Exercise[] = [];
    if (day.type === 'strength') {
      if (!day.exercises.length) return { ok: false, error: `${day.title} needs an exercise, or change the day to rest or cardio.` };
      const seen = new Set<string>();
      for (const exercise of day.exercises) {
        const parsed = exerciseFromDraft(day.title, exercise);
        if ('error' in parsed) return parsed;
        if (seen.has(parsed.id)) return { ok: false, error: `${day.title} lists ${parsed.name} twice.` };
        seen.add(parsed.id);
        exercises.push(parsed);
      }
    }
    stored.push({
      id: day.id, day: index + 1, type: day.type, title: day.title.trim(),
      note: cleanText(day.note),
      guidance: day.type === 'active-rest' ? listed(day.guidance) : undefined,
      options: day.type === 'cardio' ? listed(day.options) : undefined,
      exercises,
    });
  }
  if (stored.length !== 7) return { ok: false, error: 'A programme week has seven days.' };
  return { ok: true, days: cleanDays(stored), habits: { ...habits, steps: { min: minimum, max: maximum } } };
}

function exerciseFromDraft(day: string, exercise: ExerciseDraft): Exercise | { ok: false; error: string } {
  const where = `${day} · ${exercise.name.trim() || 'exercise'}`;
  const sets = whole(exercise.sets, 20);
  if (!exercise.name.trim()) return { ok: false, error: `${day} has an exercise without a name.` };
  if (!sets) return { ok: false, error: `${where}: enter the working sets.` };
  const warmup = exercise.warmupSets.trim() ? whole(exercise.warmupSets, 8) : 0;
  if (warmup == null) return { ok: false, error: `${where}: warm-up sets should be 0 to 8.` };
  const rest = exercise.rest.match(/^(\d{1,2}):([0-5]\d)$/);
  const seconds = rest ? Number(rest[1]) * 60 + Number(rest[2]) : undefined;
  if (seconds == null || seconds > 1_800) return { ok: false, error: `${where}: enter rest as minutes and seconds, like 1:30.` };
  const rir = exercise.rir.trim() ? whole(exercise.rir, 3) : undefined;
  const rpe = exercise.rpe.trim() ? whole(exercise.rpe, 10) : undefined;
  if (exercise.rir.trim() && rir == null) return { ok: false, error: `${where}: RIR is 0 to 3.` };
  if (exercise.rpe.trim() && (rpe == null || rpe < 1)) return { ok: false, error: `${where}: RPE is 1 to 10.` };
  let target = exercise.target.trim();
  let metric: Exercise['metric'];
  let perSide: Exercise['perSide'];
  if (exercise.mode === 'time') {
    if (!target) return { ok: false, error: `${where}: enter the time to hold or complete.` };
    metric = 'seconds';
  } else {
    const minimum = whole(exercise.repMin, 1_000);
    const upper = whole(exercise.repMax || exercise.repMin, 1_000);
    if (!minimum || !upper || upper < minimum) return { ok: false, error: `${where}: enter the rep range, lowest to highest.` };
    target = `${minimum === upper ? minimum : `${minimum}–${upper}`} reps${exercise.per ? ` per ${exercise.per}` : ''}`;
    if (exercise.mode === 'bodyweight') metric = 'bodyweight';
    if (exercise.per) perSide = exercise.per;
  }
  const weight = exercise.mode === 'bodyweight' ? '' : exercise.weight.trim();
  const kilograms = /^\d+(?:\.\d+)?$/.test(weight) ? Number(weight) : undefined;
  if (weight && kilograms == null && weight.length > 40) return { ok: false, error: `${where}: shorten the weight note.` };
  if (kilograms != null && kilograms > 500) return { ok: false, error: `${where}: weight looks too high.` };
  const variants = exercise.variants.split(',').map((item) => item.trim()).filter(Boolean);
  return cleanExercise({
    id: exercise.id, name: exercise.name, target, sets, rest: seconds, cue: exercise.cue,
    warmupSets: warmup, restNote: exercise.restNote, metric, perSide,
    variants, coachWeight: kilograms == null ? weight : undefined, coachKg: kilograms,
    rirTarget: rir, rpeTarget: rpe, coachNote: exercise.coachNote, progression: exercise.progression,
    video: exercise.video,
  });
}

function weightText(exercise: Exercise) {
  if (exercise.coachKg != null) return `${exercise.coachKg} kg`;
  if (exercise.coachWeight) return exercise.coachWeight;
  if (exercise.metric === 'bodyweight') return 'Bodyweight';
  return 'No weight';
}

function exerciseDetail(before: Exercise, after: Exercise) {
  const bits: string[] = [];
  if (before.name !== after.name) bits.push(`${before.name} → ${after.name}`);
  if (before.sets !== after.sets) bits.push(`${before.sets} → ${after.sets} working sets`);
  if ((before.warmupSets ?? 0) !== (after.warmupSets ?? 0)) bits.push(`${before.warmupSets ?? 0} → ${after.warmupSets ?? 0} warm-up sets`);
  if (before.target !== after.target) bits.push(`${before.target} → ${after.target}`);
  if (weightText(before) !== weightText(after)) bits.push(`${weightText(before)} → ${weightText(after)}`);
  if (before.rest !== after.rest || (before.restNote ?? '') !== (after.restNote ?? '')) {
    bits.push(`rest ${restDisplay(before.rest)} → ${restDisplay(after.rest)}${after.restNote ? ` ${after.restNote}` : ''}`);
  }
  if ((before.rirTarget ?? null) !== (after.rirTarget ?? null)) bits.push(`RIR ${before.rirTarget ?? '—'} → ${after.rirTarget ?? '—'}`);
  if ((before.rpeTarget ?? null) !== (after.rpeTarget ?? null)) bits.push(`RPE ${before.rpeTarget ?? '—'} → ${after.rpeTarget ?? '—'}`);
  if (before.cue !== after.cue) bits.push('technique updated');
  if ((before.coachNote ?? '') !== (after.coachNote ?? '')) bits.push('coaching note updated');
  if ((before.progression ?? '') !== (after.progression ?? '')) bits.push('progression updated');
  if ((before.variants ?? []).join('|') !== (after.variants ?? []).join('|')) bits.push('equipment options updated');
  if ((before.video ?? '') !== (after.video ?? '')) bits.push('form video updated');
  return bits;
}

export function programmeChanges(before: ProgrammeContent, after: ProgrammeContent) {
  const changes: string[] = [];
  const previous = new Map(before.days.map((day) => [day.id, day]));
  const nextIds = after.days.map((day) => day.id);
  if (before.days.map((day) => day.id).join('|') !== nextIds.join('|')) {
    changes.push(`Order: ${after.days.map((day) => day.title).join(' → ')}`);
  }
  for (const day of after.days) {
    const original = previous.get(day.id);
    if (!original) {
      changes.push(`Added ${day.title}`);
      continue;
    }
    if (original.type !== day.type || original.title !== day.title) changes.push(`Day ${day.day}: ${original.title} → ${day.title}`);
    if ((original.note ?? '') !== (day.note ?? '')) changes.push(`${day.title}: note updated`);
    if ((original.guidance ?? []).join('\n') !== (day.guidance ?? []).join('\n')) changes.push(`${day.title}: rest-day guidance updated`);
    if ((original.options ?? []).join('\n') !== (day.options ?? []).join('\n')) changes.push(`${day.title}: cardio updated`);
    const beforeExercises = new Map(original.exercises.map((exercise) => [exercise.id, exercise]));
    for (const exercise of day.exercises) {
      const earlier = beforeExercises.get(exercise.id);
      if (!earlier) {
        changes.push(`${day.title}: added ${exercise.name}`);
        continue;
      }
      const bits = exerciseDetail(earlier, exercise);
      if (bits.length) changes.push(`${day.title} · ${exercise.name}: ${bits.join(', ')}`);
    }
    for (const exercise of original.exercises) {
      if (!day.exercises.some((item) => item.id === exercise.id)) changes.push(`${day.title}: removed ${exercise.name}`);
    }
    if (original.exercises.length === day.exercises.length &&
      original.exercises.every((exercise) => day.exercises.some((item) => item.id === exercise.id)) &&
      original.exercises.some((exercise, index) => day.exercises[index]?.id !== exercise.id)) {
      changes.push(`${day.title} order: ${day.exercises.map((exercise) => exercise.name).join(' → ')}`);
    }
  }
  for (const day of before.days) {
    if (!nextIds.includes(day.id)) changes.push(`Removed ${day.title}`);
  }
  if (before.habits.steps.min !== after.habits.steps.min || before.habits.steps.max !== after.habits.steps.max) {
    changes.push(`Steps: ${before.habits.steps.min}–${before.habits.steps.max} → ${after.habits.steps.min}–${after.habits.steps.max}`);
  }
  if (before.deload !== after.deload) changes.push(after.deload ? 'Marked as a deload week.' : 'Deload week cleared.');
  if (before.weekNote.trim() !== after.weekNote.trim()) changes.push(after.weekNote.trim() ? 'Week note updated.' : 'Week note cleared.');
  return changes.slice(0, 40);
}

export function applyProgramme(state: ProgrammeState, command: ProgrammeCommand, now: string, livePlans?: readonly Plan[]) {
  if (command.type === 'message') {
    if (state.messages.some((message) => message.id === command.id)) return state;
    return { ...state, messages: [...state.messages, { id: command.id, at: now, author: command.author, text: command.text }] };
  }
  if (state.revisions.some((revision) => revision.id === command.id)) return state;
  const days = cleanDays(command.days);
  for (const day of days) {
    if (day.type === 'strength' && !day.exercises.length) throw new ProgrammeValidationError(`${day.title} needs an exercise.`);
    const exerciseIds = new Set(day.exercises.map((exercise) => exercise.id));
    if (exerciseIds.size !== day.exercises.length) throw new ProgrammeValidationError(`${day.title} lists the same exercise twice.`);
  }
  const ids = new Set(days.map((day) => day.id));
  if (ids.size !== days.length) throw new ProgrammeValidationError('Each training day needs its own id.');
  const content = { deload: command.deload, weekNote: command.weekNote.trim(), days, habits: command.habits };
  const summary = programmeChanges(contentBefore(state, command.effectiveFrom, livePlans), content);
  if (!summary.length) throw new ProgrammeValidationError('Nothing has changed from the programme already saved for that date.');
  const revision: ProgrammeRevision = { ...content, id: command.id, savedAt: now, effectiveFrom: command.effectiveFrom, summary };
  return { ...state, revisions: [...state.revisions, revision] };
}
