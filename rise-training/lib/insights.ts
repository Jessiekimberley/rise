import type { Session, SetLog, TrainingData } from './model';
import { findExercise, findPlan } from './programme';

export const todayKey = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Pacific/Auckland' }).format(new Date());
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

export const restDisplay = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function setLabel(set: SetLog) {
  const exercise = findExercise(set.exerciseId);
  const side = set.perSide ?? exercise?.perSide;
  const values = set.seconds !== null ? [`${set.seconds}s`] : [`${set.reps} reps${side ? `/${side}` : ''}`];
  if (set.weight !== null) values.unshift(`${set.weight} kg`);
  if (set.effort !== null) values.push(`RPE ${set.effort}`);
  return values.join(' · ');
}

export function matchingSets(session: Session, exerciseId: string, variant: string) {
  return Object.values(session.slots).flatMap((slot) => Object.values(slot.sets))
    .filter((set) => set.exerciseId === exerciseId && set.variant === variant);
}

export function lastPerformance(data: TrainingData, before: string, exerciseId: string, variant: string) {
  const sessions = Object.values(data.sessions).filter(({ date }) => date < before)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));
  for (const session of sessions) {
    const sets = matchingSets(session, exerciseId, variant);
    if (sets.length) return { date: session.date, sets };
  }
}

export function progressPoints(data: TrainingData, exerciseId: string, variant: string, metric: 'weight' | 'reps' | 'seconds') {
  const dates = new Map<string, number>();
  for (const session of Object.values(data.sessions)) {
    const numbers = matchingSets(session, exerciseId, variant).map((entry) => entry[metric]).filter((value) => value !== null);
    if (numbers.length) dates.set(session.date, Math.max(dates.get(session.date) ?? 0, ...numbers));
  }
  return Array.from(dates, ([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildReport(data: TrainingData, kind: 'midweek' | 'weekly', start: string, end: string) {
  const title = `${kind === 'midweek' ? 'Midweek' : 'Weekly'} training check-in · ${displayDate(start)}–${displayDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const sessions = Object.values(data.sessions).filter((session) => session.date >= start && session.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lines = [];
  for (const session of sessions) {
    const details = [];
    for (const [slotId, slot] of Object.entries(session.slots)) {
      for (const [index, set] of Object.entries(slot.sets)) {
        const exercise = findExercise(set.exerciseId);
        details.push(`${set.exerciseName ?? exercise?.name ?? set.exerciseId}${set.variant ? ` (${set.variant})` : ''}, set ${Number(index) + 1}: ${setLabel(set)}`);
      }
      if (slot.note.trim()) details.push(`${session.plan?.exercises.find((exercise) => exercise.id === slotId)?.name ?? findExercise(slotId)?.name ?? slotId} notes: ${slot.note.trim()}`);
    }
    if (details.length) lines.push(`${displayDate(session.date)} · ${session.plan?.name ?? findPlan(session.planId)?.name ?? session.planId}${session.finishedAt ? '' : ' (in progress)'}\n${details.join('\n')}`);
  }

  const habits = Object.entries(data.habits).filter(([key]) => key >= start && key <= end).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, day] of habits) {
    const entries = [day.steps !== null && `${day.steps.toLocaleString('en-NZ')} steps`, day.water !== null && `${day.water} L water`, day.sleep !== null && `${day.sleep} hr sleep`].filter(Boolean);
    if (day.nutrition.trim()) entries.push(`Nutrition: ${day.nutrition.trim()}`);
    if (day.recovery.trim()) entries.push(`Recovery: ${day.recovery.trim()}`);
    if (entries.length) lines.push(`${displayDate(key)} · Daily habits\n${entries.join('\n')}`);
  }
  return { title, text: lines.join('\n\n') };
}
