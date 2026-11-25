import { orderedSlots, type HabitLog, type Session, type SetLog, type TrainingData } from './model';
import { canonicalVariant, findExercise, findPlan, habitTargets, type Exercise } from './programme';

const trainingCalendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Pacific/Auckland' });
export const todayKey = (now = new Date()) => trainingCalendar.format(now);
const utcDate = (date: string) => new Date(`${date}T12:00:00Z`);
export const displayDate = (key: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('en-NZ', { ...options, timeZone: 'UTC' }).format(utcDate(key));

export function addDays(key: string, number: number) {
  const date = utcDate(key);
  date.setUTCDate(date.getUTCDate() + number);
  return date.toISOString().slice(0, 10);
}

export const programmeDay = (date: string, startedOn?: string) => startedOn && date >= startedOn
  ? Math.floor((Date.parse(date) - Date.parse(startedOn)) / 86_400_000) % 7 + 1
  : ((utcDate(date).getUTCDay() + 6) % 7) + 1;
export const weekStart = (date: string) => addDays(date, 1 - programmeDay(date));
export const trainingWeekStart = (date: string, startedOn?: string) => addDays(date, 1 - programmeDay(date, startedOn));

// Jessie's temporary schedule for the week of 23 November, in Auckland dates.
export const temporarySchedule: Readonly<Record<string, number>> = {
  '2026-11-25': 1,
  '2026-11-28': 6,
  '2026-11-29': 7,
};

export function scheduledProgrammeDay(date: string, data: Pick<TrainingData, 'startedOn' | 'scheduledDays'>) {
  return data.scheduledDays?.[date] ?? temporarySchedule[date] ?? programmeDay(date, data.startedOn);
}

export const restDisplay = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function workoutElapsedMs(session: Pick<Session, 'startedAt' | 'finishedAt' | 'pausedAt' | 'pausedMs'>, now: number) {
  const end = session.finishedAt ? Date.parse(session.finishedAt) : session.pausedAt ? Date.parse(session.pausedAt) : now;
  return Math.max(0, end - Date.parse(session.startedAt) - (session.pausedMs ?? 0));
}

// Stored effort uses the existing RPE scale where 10 is zero reps in reserve.
export const rirDisplay = (rir: number) => rir >= 3 ? '3+' : String(rir);
export const effortLabel = (effort: number) => `RIR ${rirDisplay(10 - effort)}`;

export function setLabel(set: SetLog) {
  const exercise = findExercise(set.exerciseId);
  const side = set.perSide ?? exercise?.perSide;
  const values = set.seconds !== null ? [`${set.seconds}s`] : [`${set.reps} reps${side ? `/${side}` : ''}`];
  if (set.weight !== null) values.unshift(`${set.weight} kg`);
  if (set.effort != null) values.push(effortLabel(set.effort));
  return values.join(' · ');
}

export function matchingSets(session: Session, exerciseId: string, variant: string) {
  return Object.values(session.slots).flatMap((slot) => Object.values(slot.sets))
    .filter((set) => set.exerciseId === exerciseId && canonicalVariant(exerciseId, set.variant) === canonicalVariant(exerciseId, variant));
}

export function compactSet(set: SetLog) {
  if (set.seconds != null) return `${set.seconds} s`;
  const reps = `${set.reps ?? '—'}${set.perSide ? `/${set.perSide}` : ''}`;
  return set.weight == null ? `${reps} reps` : `${set.weight} kg × ${reps}`;
}

export function pastSessions(data: TrainingData, before: string) {
  return Object.values(data.sessions).filter(({ date }) => date < before)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));
}

export function lastPerformance(data: TrainingData, before: string, exerciseId: string, variant: string) {
  for (const session of pastSessions(data, before)) {
    const sets = matchingSets(session, exerciseId, variant);
    if (sets.length) return { date: session.date, sets };
  }
}

export function ordinal(value: number) {
  const teen = value % 100;
  if (teen >= 11 && teen <= 13) return `${value}th`;
  return `${value}${['th', 'st', 'nd', 'rd'][value % 10] ?? 'th'}`;
}

export function workoutsDoneThisWeek(data: TrainingData, today: string) {
  const start = weekStart(today);
  const end = addDays(start, 7);
  const events: { workoutNumber: number; completedAt: string }[] = [];
  const seen = new Set<string>();
  function add(workoutNumber: number, completedAt: string) {
    const day = todayKey(new Date(completedAt));
    if (day < start || day >= end || workoutNumber < 1 || workoutNumber > 7) return;
    const id = `${workoutNumber}:${completedAt}`;
    if (seen.has(id)) return;
    seen.add(id);
    events.push({ workoutNumber, completedAt });
  }
  for (const item of data.completions ?? []) add(item.workoutNumber, item.completedAt);
  for (const session of Object.values(data.sessions)) {
    if (!session.finishedAt) continue;
    const workoutNumber = session.plan?.day ?? findPlan(session.planId)?.day;
    if (workoutNumber) add(workoutNumber, session.finishedAt);
  }
  const done = new Map<number, { weekday: string; weekdayLong: string }>();
  for (const event of events.sort((a, b) => a.completedAt.localeCompare(b.completedAt))) {
    if (done.has(event.workoutNumber)) continue;
    const day = todayKey(new Date(event.completedAt));
    done.set(event.workoutNumber, {
      weekday: displayDate(day, { weekday: 'short' }),
      weekdayLong: displayDate(day, { weekday: 'long' }),
    });
  }
  let upNext: number | null = null;
  for (let number = 1; number <= 7; number += 1) {
    if (!done.has(number)) { upNext = number; break; }
  }
  return { done, count: done.size, upNext };
}

export function workoutsThisWeek(data: TrainingData, date: string) {
  const start = weekStart(date);
  const end = addDays(start, 6);
  return Object.values(data.sessions).filter((session) => session.finishedAt && session.date >= start && session.date <= end).length;
}

export function reportStats(data: TrainingData, start: string, end: string) {
  const habits = Object.entries(data.habits).filter(([date]) => date >= start && date <= end).map(([, value]) => value);
  function average(key: 'steps' | 'water' | 'sleep') {
    const values = habits.flatMap((habit) => habit[key] == null ? [] : [habit[key]]);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }
  const sessions = Object.values(data.sessions).filter((session) => session.finishedAt && session.date >= start && session.date <= end).length;
  return { sessions, steps: average('steps'), water: average('water'), sleep: average('sleep') };
}

export function sleepDuration(value: number) {
  const minutes = Math.round(value * 60);
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
}

export function progressPoints(data: TrainingData, exerciseId: string, variant: string, metric: 'weight' | 'reps' | 'seconds') {
  const dates = new Map<string, number>();
  for (const session of Object.values(data.sessions)) {
    const numbers = matchingSets(session, exerciseId, variant).map((entry) => entry[metric]).filter((value) => value !== null);
    if (numbers.length) dates.set(session.date, Math.max(dates.get(session.date) ?? 0, ...numbers));
  }
  return Array.from(dates, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

const countFormat = new Intl.NumberFormat('en-NZ');
export const formatCount = (value: number) => countFormat.format(value);
export const goalSpan = (min: number, max: number) => `${formatCount(min)}–${formatCount(max)}`;
export const formatHours = (value: number) => String(Math.round(value * 100) / 100);

export type HabitGoals = {
  steps: { min: number; max: number };
  hydrationLitres: { min: number; max: number };
  sleepHours: { min: number; max: number };
};

export function habitReport(habit: HabitLog | undefined, goals?: HabitGoals) {
  if (!habit) return '';
  const steps = goals?.steps ?? habitTargets.steps;
  const water = goals?.hydrationLitres ?? habitTargets.hydrationLitres;
  const sleep = goals?.sleepHours ?? habitTargets.sleepHours;
  const lines: string[] = [];
  if (habit.steps != null) lines.push(`Steps: ${formatCount(habit.steps)} (goal ${goalSpan(steps.min, steps.max)})`);
  if (typeof habit.waterHitTarget === 'boolean') {
    lines.push(`Water ${goalSpan(water.min, water.max)} L: ${habit.waterHitTarget ? 'Yes' : 'No'}`);
  }
  const sleepNote = habit.sleepNote?.trim();
  if (habit.sleep != null || sleepNote) {
    const hours = habit.sleep == null ? '' : `${formatHours(habit.sleep)} h (goal ${goalSpan(sleep.min, sleep.max)} h).`;
    lines.push(`Sleep: ${[hours, sleepNote].filter(Boolean).join(' ')}`);
  }
  const fuel = habit.fuellingNote?.trim();
  if (fuel) lines.push(`Fuelling: ${fuel}`);
  return lines.length ? `Habits\n${lines.join('\n')}` : '';
}

export type ReportSet = {
  exercise: string;
  set: number;
  weight: number | null;
  reps: number | null;
  perSide?: Exercise['perSide'];
  seconds: number | null;
  rir: string;
};

export type ReportDay = {
  date: string;
  order: number;
  weekday: string;
  heading: string;
  workout: string;
  inProgress: boolean;
  sets: ReportSet[];
  lines: string[];
  dayNote?: string;
  text: string;
};

export const dayNoteLine = (note: string) => `Notes: ${note}`;
export const weekdayName = (date: string) => displayDate(date, { weekday: 'long' });
export const dayHeading = (date: string) => `${weekdayName(date)}, ${displayDate(date)}`;

export function setWork(set: ReportSet) {
  if (set.seconds != null) return `${set.seconds}s`;
  if (set.reps == null) return '';
  return set.perSide ? `${set.reps}/${set.perSide}` : String(set.reps);
}

function namedExercise(set: SetLog) {
  const exercise = findExercise(set.exerciseId);
  const name = set.exerciseName ?? exercise?.name ?? set.exerciseId;
  return { exercise, name: set.variant ? `${name} (${set.variant})` : name };
}

function reportSet(set: SetLog, index: number): ReportSet {
  const { exercise, name } = namedExercise(set);
  return {
    exercise: name, set: index + 1, weight: set.weight, reps: set.reps, seconds: set.seconds,
    perSide: set.seconds == null ? set.perSide ?? exercise?.perSide : undefined,
    rir: set.effort != null ? rirDisplay(10 - set.effort) : '',
  };
}

function collectDays(data: TrainingData, start: string, end: string, goalsFor?: (date: string) => HabitGoals): ReportDay[] {
  const sessions = Object.values(data.sessions).filter((session) => session.date >= start && session.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt));
  const blocks: ReportDay[] = [];
  for (const session of sessions) {
    const sets: ReportSet[] = [];
    const lines: string[] = [];
    const details: string[] = [];
    for (const [slotId, slot] of orderedSlots(session)) {
      const slotName = session.plan?.exercises.find((exercise) => exercise.id === slotId)?.name ?? findExercise(slotId)?.name ?? slotId;
      for (const [label, set] of [['warm-up', slot.warmup], ['upper', slot.upper], ['lower', slot.lower]] as const) {
        if (!set) continue;
        details.push(`${namedExercise(set).name}, ${label}: ${setLabel(set)}`);
      }
      for (const index of Object.keys(slot.sets).map(Number).sort((a, b) => a - b)) {
        const row = reportSet(slot.sets[index], index);
        sets.push(row);
        details.push(`${row.exercise}, set ${row.set}: ${setLabel(slot.sets[index])}`);
      }
      if (slot.completion?.rir != null) {
        const line = `${slotName} · final set RIR ${rirDisplay(slot.completion.rir)}`;
        lines.push(line);
        details.push(line);
      }
      const note = slot.note?.trim() ?? '';
      if (note) {
        const line = `${slotName} notes: ${note}`;
        lines.push(line);
        details.push(line);
      }
    }
    if (!details.length) continue;
    const workout = session.plan?.name ?? findPlan(session.planId)?.name ?? session.planId;
    const inProgress = !session.finishedAt;
    const heading = dayHeading(session.date);
    blocks.push({
      date: session.date, order: blocks.length, weekday: weekdayName(session.date), heading, workout, inProgress, sets, lines,
      text: `${heading} · ${workout}${inProgress ? ' (in progress)' : ''}\n${details.join('\n')}`,
    });
  }
  const lastOfDay = new Map<string, number>();
  blocks.forEach((block, index) => lastOfDay.set(block.date, index));
  const chunks = blocks.map((block, index) => {
    if (lastOfDay.get(block.date) !== index) return block;
    const habits = habitReport(data.habits[block.date], goalsFor?.(block.date));
    if (!habits) return block;
    return { ...block, lines: [...block.lines, ...habits.split('\n')], text: `${block.text}\n${habits}` };
  });
  for (const [date, habit] of Object.entries(data.habits)) {
    if (date < start || date > end || lastOfDay.has(date)) continue;
    const habits = habitReport(habit, goalsFor?.(date));
    if (!habits) continue;
    chunks.push({
      ...blankDay(date, chunks.length), lines: habits.split('\n'), text: `${dayHeading(date)}\n${habits}`,
    });
  }
  const noted = attachDayNotes(chunks, data, start, end);
  noted.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  return noted;
}

function attachDayNotes(chunks: ReportDay[], data: TrainingData, start: string, end: string) {
  const notes = data.dayNotes;
  if (!notes) return chunks;
  const lastOfDay = new Map<string, number>();
  chunks.forEach((block, index) => lastOfDay.set(block.date, index));
  const next = chunks.map((block, index) => lastOfDay.get(block.date) === index ? addDayNote(block, notes[block.date]) : block);
  for (const [date, note] of Object.entries(notes)) {
    const trimmed = note.trim();
    if (!trimmed || date < start || date > end || lastOfDay.has(date)) continue;
    next.push(addDayNote(blankDay(date, next.length), trimmed));
  }
  return next;
}

function addDayNote(block: ReportDay, note: string | undefined): ReportDay {
  const trimmed = note?.trim();
  if (!trimmed) return block;
  const line = dayNoteLine(trimmed);
  return { ...block, dayNote: trimmed, lines: [...block.lines, line], text: `${block.text}\n${line}` };
}

function blankDay(date: string, order = 0): ReportDay {
  return {
    date, order, weekday: weekdayName(date), heading: dayHeading(date),
    workout: '', inProgress: false, sets: [], lines: [], text: dayHeading(date),
  };
}

export function datesThrough(start: string, end: string) {
  if (start > end) return [];
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function blocksForDates(data: TrainingData, dates: string[], goalsFor?: (date: string) => HabitGoals) {
  const sorted = [...new Set(dates)].sort();
  if (!sorted.length) return [];
  const logged = collectDays(data, sorted[0], sorted[sorted.length - 1], goalsFor).filter((day) => sorted.includes(day.date));
  const seen = new Set(logged.map((day) => day.date));
  return [...logged, ...sorted.filter((date) => !seen.has(date)).map((date) => blankDay(date))]
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
}

export function buildReport(data: TrainingData, kind: 'midweek' | 'weekly', start: string, end: string, goalsFor?: (date: string) => HabitGoals) {
  const title = `${kind === 'midweek' ? 'Midweek' : 'Weekly'} training check-in · ${displayDate(start)}–${displayDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const days = collectDays(data, start, end, goalsFor);
  return { title, text: days.map((day) => day.text).join('\n\n'), days };
}
