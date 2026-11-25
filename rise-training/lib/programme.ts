import programme from './programme-data.generated.json';

export type Exercise = {
  id: string;
  name: string;
  target: string;
  sets: number;
  rest: number;
  restNote?: string;
  cue: string;
  metric?: 'seconds' | 'bodyweight';
  perSide?: 'leg' | 'side';
  variants?: string[];
  coachWeight?: string;
  coachKg?: number;
  warmupSets?: number;
  rirTarget?: number | null;
  rpeTarget?: number | null;
  coachNote?: string;
  progression?: string;
  video?: string;
};

export type Plan = { id: string; day: number; name: string; exercises: Exercise[] };

const planIds: Record<number, string> = { 1: 'lower-1', 2: 'upper-1', 4: 'lower-2', 5: 'upper-2' };
// Keep the identifiers used by saved sessions and Google Docs imports.
const savedIds: Record<string, string> = {
  'leg-extensions': 'leg-extension',
  'walking-lunges': 'walking-lunge',
  'forearm-plank': 'plank',
  'seated-cable-row': 'cable-row',
  'lateral-raises': 'lateral-raise',
  'back-squat': 'squat',
  'bulgarian-split-squat': 'split-squat',
  'standing-calf-raises': 'calf-raise',
  'cable-crunches': 'cable-crunch',
  'lying-leg-raises': 'leg-raise',
  'overhead-tricep-extensions': 'overhead-tricep',
  'russian-twists': 'russian-twist',
};

export const programmeDays = programme.days;

export function dayKind(type: string) {
  if (type === 'cardio') return 'cardio';
  if (type === 'active-rest') return 'rest';
  return 'strength';
}
export const habitTargets = programme.habits;

export const plans: Plan[] = programmeDays.flatMap((day) => {
  if (!day.exercises) return [];
  return [{
    id: planIds[day.day], day: day.day, name: day.title,
    exercises: day.exercises.map((exercise): Exercise => {
      const [minutes, seconds, ...note] = exercise.rest.split(/[: ]/);
      const reps = exercise.reps.replace(/(\d)-(\d)/g, '$1–$2');
      const side = reps.match(/ per (leg|side)$/)?.[1];
      const weight = exercise.weight;
      const duration = 'logAs' in exercise && exercise.logAs === 'duration';
      return {
        id: savedIds[exercise.id] ?? exercise.id,
        name: exercise.name,
        sets: exercise.sets,
        target: duration ? reps : side ? reps.replace(' per ', ' reps per ') : `${reps} reps`,
        rest: Number(minutes) * 60 + Number(seconds),
        restNote: note.join(' ') || undefined,
        cue: exercise.cues,
        variants: exercise.options.length ? exercise.options : undefined,
        metric: duration ? 'seconds' : weight === 'Bodyweight' ? 'bodyweight' : undefined,
        perSide: side === 'leg' || side === 'side' ? side : undefined,
        coachWeight: typeof weight === 'string' && weight !== 'Bodyweight' ? weight : undefined,
        coachKg: typeof weight === 'number' ? weight : undefined,
        video: 'video' in exercise && typeof exercise.video === 'string' ? exercise.video : undefined,
      };
    }),
  }];
});

const exercises = plans.flatMap((plan) => plan.exercises);
export { exercises };
export const findPlan = (id: string) => plans.find((plan) => plan.id === id);
export const findExercise = (id: string) => exercises.find((exercise) => exercise.id === id);
export const dayTitle = (plan: Plan) => findPlan(plan.id)?.name ?? plan.name;

export function prescribedReps(exercise: Exercise) {
  if (exercise.metric === 'seconds') return;
  const match = exercise.target.trim().match(/^(\d+)(?:\s*(?:[-–—]|\bto\b)\s*(\d+))?(?:\s+reps?)?(?:\s+per\s+(?:leg|side))?$/i);
  if (!match) return;
  const minimum = Number(match[1]);
  const maximum = Number(match[2] ?? match[1]);
  return minimum >= 1 && minimum <= maximum && maximum <= 1_000 ? minimum : undefined;
}

export function canonicalVariant(exerciseId: string, variant: string) {
  if (exerciseId !== 'calf-raise') return variant;
  if (variant === 'Dumbbells') return 'Holding dumbbells';
  if (variant === 'Smith machine') return 'On smith machine';
  return variant;
}

export const exerciseOptions = (id: string) => findExercise(id)?.variants ?? [];
