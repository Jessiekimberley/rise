import { createHash } from 'node:crypto';
import { type DocTarget } from './coach-doc';
import { restDisplay } from './insights';
import type { TrainingData } from './model';
import { dayTitle, plans, type Exercise } from './programme';
import { type CoachWeek } from './weeks';

export type ProgrammeChange = { week: number; exercise: string; day?: number; before?: string; after?: string };
export type ProgrammeReview = { fingerprint: string; changes: ProgrammeChange[] };

function description(exercise: Exercise) {
  return [
    `${exercise.sets} sets · ${exercise.target} · rest ${restDisplay(exercise.rest)}${exercise.restNote ? ` ${exercise.restNote}` : ''}`,
    exercise.coachWeight ?? (exercise.coachKg == null ? (exercise.metric === 'bodyweight' ? 'Bodyweight' : 'No weight set') : `${exercise.coachKg} kg`),
    exercise.cue,
  ].filter(Boolean).join('\n');
}

export function reviewProgramme(weeks: CoachWeek[], data: TrainingData, target: DocTarget): ProgrammeReview {
  const changes: ProgrammeChange[] = [];
  const accepted = { ...data.weeks };
  for (const week of [...weeks].sort((a, b) => a.number - b.number)) {
    const previous = accepted[week.number] ?? Object.values(accepted).filter((item) => item.number < week.number).sort((a, b) => b.number - a.number)[0];
    for (const plan of week.plans) {
      const original = (previous?.plans ?? plans).find((item) => item.id === plan.id);
      const ids = [...new Set([...plan.exercises, ...original?.exercises ?? []].map((item) => item.id))];
      for (const id of ids) {
        const before = original?.exercises.find((item) => item.id === id);
        const after = plan.exercises.find((item) => item.id === id);
        const oldText = before && description(before);
        const newText = after && description(after);
        if (oldText !== newText || before?.name !== after?.name) {
          changes.push({ week: week.number, day: plan.day, exercise: after?.name ?? before!.name, before: oldText, after: newText });
        }
      }
      if (original && ids.length && original.exercises.length === plan.exercises.length &&
        original.exercises.every((item) => plan.exercises.some((other) => other.id === item.id)) &&
        original.exercises.some((item, index) => plan.exercises[index]?.id !== item.id)) {
        changes.push({ week: week.number, day: plan.day, exercise: `${dayTitle(plan)} exercise order`,
          before: original.exercises.map((item) => item.name).join(' → '), after: plan.exercises.map((item) => item.name).join(' → ') });
      }
    }
    const before = (previous?.notes ?? []).join('\n');
    const after = (week.notes ?? []).join('\n');
    if (before !== after) changes.push({ week: week.number, exercise: 'Brenna’s notes', before, after });
    accepted[week.number] = week;
  }
  const serialized = JSON.stringify({ target, changes, weeks: weeks.map(({ number, plans, notes }) => ({ number, plans, notes })) });
  return { fingerprint: createHash('sha256').update(serialized).digest('hex'), changes };
}
