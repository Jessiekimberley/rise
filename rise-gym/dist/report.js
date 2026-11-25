import { habits } from './plan.js';

export function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

const displayDate = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short' });

export function restTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const entered = (value) => value !== undefined && value !== '';

function setSummary(set, exercise) {
  const parts = [];
  if (entered(set.weight)) parts.push(`${set.weight} kg`);
  if (entered(set.reps)) parts.push(`${set.reps} reps${exercise.perSide ? `/${exercise.perSide}` : ''}`);
  if (entered(set.seconds)) parts.push(`${set.seconds}s`);
  return parts.join(' × ') || 'done';
}

export function makeReport(records, endKey) {
  const end = dateFromKey(endKey);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const startKey = dateKey(start);
  const entries = [];

  for (const key of Object.keys(records).sort()) {
    if (key < startKey || key > endKey) continue;
    const entry = records[key];
    const details = [];

    for (const workout of Object.values(entry.workouts ?? {})) {
      const day = workout.day;
      if (!day) continue;
      const lines = [];
      if (workout.activityDone) lines.push('Completed');
      day.exercises?.forEach((exercise, exerciseIndex) => {
        const sets = workout.exercises?.[exerciseIndex] ?? {};
        const logged = Object.entries(sets)
          .filter(([, set]) => set.done)
          .map(([index, set]) => `set ${Number(index) + 1} ${setSummary(set, exercise)}`);
        if (logged.length) lines.push(`${exercise.name}: ${logged.join(', ')}`);
      });
      if (workout.note?.trim()) lines.push(`Workout notes: ${workout.note.trim()}`);
      if (lines.length) details.push(`Day ${day.number} · ${day.name}`, ...lines);
    }

    const loggedHabits = habits
      .filter(({ key: field }) => entered(entry.habits?.[field]))
      .map(({ key: field, label, unit }) => `${label} ${entry.habits[field]} ${unit}`);
    if (loggedHabits.length) details.push(loggedHabits.join(' · '));
    if (entry.habits?.note?.trim()) details.push(`Habit notes: ${entry.habits.note.trim()}`);
    if (details.length) entries.push(`${displayDate.format(dateFromKey(key))}\n${details.join('\n')}`);
  }

  return {
    title: `Gym check-in · ${displayDate.format(start)}–${displayDate.format(end)} ${end.getFullYear()}`,
    text: entries.join('\n\n'),
  };
}
