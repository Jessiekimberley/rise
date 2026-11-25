import type { TrainingData } from './model';
import { plansForRevision, revisionCovering, type ProgrammeSnapshot } from './prescription';
import { exercises, plans, type Exercise, type Plan } from './programme';

export type CoachWeek = { number: number; plans: Plan[]; refreshedAt: string; notes?: string[] };
const dayMs = 86_400_000;

export function programmeWeek(date: string, startedOn: string) {
  return Math.max(1, 1 + Math.floor((Date.parse(date) - Date.parse(startedOn)) / (7 * dayMs)));
}

export function mondayOf(date: string) {
  const start = new Date(`${date}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  return start.toISOString().slice(0, 10);
}

export function weekPlans(data: TrainingData, date: string, fallbackStart = mondayOf(date), prescription?: ProgrammeSnapshot | null): Plan[] {
  const saved = prescription && plansForRevision(revisionCovering(prescription.state, date));
  if (saved) return saved;
  return availableWeek(data, date, fallbackStart)?.plans ?? plans;
}

export function availableWeek(data: TrainingData, date: string, fallbackStart = mondayOf(date)) {
  const number = programmeWeek(date, data.startedOn ?? fallbackStart);
  return Object.values(data.weeks ?? {}).filter((week) => week.number <= number)
    .sort((a, b) => b.number - a.number)[0];
}

export function workoutPlan(data: TrainingData, date: string, planId: string, prescription?: ProgrammeSnapshot | null) {
  return data.sessions[`${date}:${planId}`]?.plan ?? weekPlans(data, date, mondayOf(date), prescription).find((plan) => plan.id === planId);
}

export function programmeExercises(data: TrainingData, active: Plan[] = []): Exercise[] {
  const items = [...active, ...Object.values(data.weeks ?? {}).sort((a, b) => b.number - a.number).flatMap((week) => week.plans)].flatMap((plan) => plan.exercises);
  const unique = new Set<string>();
  return [...items, ...exercises].filter(({ id }) => { if (unique.has(id)) return false; unique.add(id); return true; });
}
