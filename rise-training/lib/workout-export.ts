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
