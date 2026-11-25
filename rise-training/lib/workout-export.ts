import { displayDate, setWork, type ReportDay } from './insights';
import type { SetLog, TrainingData } from './model';
import { programmeExercises, workoutPlan } from './weeks';

type Cell = string | number | null | undefined;

function csvCell(value: Cell) {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  // Keep spreadsheet apps from evaluating notes or programme text as formulas.
  const safe = /^[\t\r\n]|^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function workoutCsv(data: TrainingData) {
  const columns = [
    'Workout date', 'Workout', 'Programme day', 'Status', 'Started at (UTC)', 'Finished at (UTC)',
    'Planned exercise', 'Exercise', 'Variation', 'Entry', 'Set', 'Weight (kg)', 'Reps', 'Reps per',
    'Duration (seconds)', 'Effort (RPE)', 'Note', 'Exercise completed at (UTC)', 'Final reps in reserve',
  ];
  const rows: Cell[][] = [columns];
  const sessions = Object.values(data.sessions).sort((a, b) =>
    a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt) || a.planId.localeCompare(b.planId));

  for (const session of sessions) {
    const plan = workoutPlan(data, session.date, session.planId);
    const exercises = programmeExercises(data, plan ? [plan] : []);
    const exercise = (id: string) => exercises.find((item) => item.id === id);
    const workout = [
      session.date, plan?.name ?? session.planId, plan?.day, session.finishedAt ? 'Finished' : 'In progress',
      session.startedAt, session.finishedAt,
    ];
    const firstRow = rows.length;
    for (const [slotId, slot] of Object.entries(session.slots)) {
      const planned = plan?.exercises.find((item) => item.id === slotId)?.name ?? exercise(slotId)?.name ?? slotId;
      function addSet(set: SetLog, entry: string, index?: number) {
        const lift = exercise(set.exerciseId);
        rows.push([
          ...workout, planned, set.exerciseName ?? lift?.name ?? set.exerciseId, set.variant, entry, index,
          set.weight, set.reps, set.reps == null ? undefined : set.perSide ?? lift?.perSide, set.seconds, set.effort,
        ]);
      }
      if (slot.warmup) addSet(slot.warmup, 'Warm-up');
      if (slot.upper) addSet(slot.upper, 'Upper');
      if (slot.lower) addSet(slot.lower, 'Lower');
      for (const [index, set] of Object.entries(slot.sets)) addSet(set, 'Working set', Number(index) + 1);
      const slotDetails = [...workout, planned, exercise(slot.exerciseId)?.name ?? slot.exerciseId, slot.variant];
      if (slot.note) rows.push([...slotDetails, 'Note', null, null, null, null, null, null, slot.note]);
      if (slot.completion) rows.push([
        ...slotDetails, 'Exercise completed', null, null, null, null, null, null, null,
        slot.completion.completedAt, slot.completion.rir === 3 ? '3+' : slot.completion.rir,
      ]);
    }
    if (rows.length === firstRow) rows.push(workout);
  }

  const csv = rows.map((row) => columns.map((_, index) => csvCell(row[index])).join(',')).join('\r\n');
  return `\uFEFF${csv}\r\n`;
}

export function setsCsv(days: ReportDay[]) {
  const columns = ['Day', 'Workout', 'Status', 'Exercise', 'Set', 'Weight (kg)', 'Reps', 'RIR', 'Notes'];
  const rows: Cell[][] = [columns];
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  for (const day of ordered) {
    const label = `${day.weekday}, ${displayDate(day.date, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const status = day.workout ? (day.inProgress ? 'In progress' : 'Finished') : '';
    if (!day.sets.length && !day.lines.length) {
      rows.push([label, '', '', '', '', '', '', '', 'No sets logged']);
      continue;
    }
    for (const set of day.sets) rows.push([label, day.workout, status, set.exercise, set.set, set.weight, setWork(set), set.rir, '']);
    for (const line of day.lines) rows.push([label, day.workout, status, '', '', '', '', '', line]);
  }
  if (rows.length === 1) rows.push(['No days selected']);
  const csv = rows.map((row) => columns.map((_, index) => csvCell(row[index])).join(',')).join('\r\n');
  return `\uFEFF${csv}\r\n`;
}
