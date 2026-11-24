export type Exercise = {
  id: string;
  name: string;
  target: string;
  sets: number;
  rest: number;
  cue: string;
  metric?: 'seconds' | 'bodyweight';
  perSide?: 'leg' | 'side';
  variants?: string[];
  coachWeight?: string;
  coachKg?: number;
};

export const plans = [
  { id: 'lower-1', day: 1, name: 'Lower Body I', exercises: [
    { id: 'leg-press', name: 'Leg Press', sets: 4, target: '8 reps', rest: 120, cue: 'Slow and controlled 3-sec negatives with 1-sec pause at contraction.' },
    { id: 'rdl', name: 'RDL', variants: ['Barbell', 'Dumbbells'], sets: 3, target: '8–10 reps', rest: 120, cue: 'Slow and controlled with a neutral spine. Keep the weights close to your legs and stop around your kneecaps. Check your form in the mirror, and send Brenna a video if concerned.' },
    { id: 'leg-extension', name: 'Leg Extensions', sets: 3, target: '12 reps', rest: 90, cue: '3-sec negative and 2-sec pause at the top.' },
    { id: 'walking-lunge', name: 'Dumbbell Walking Lunges', sets: 3, target: '10 reps per leg', rest: 120, perSide: 'leg', cue: 'Take big steps through a full range with controlled movement. Hold dumbbells at your sides.' },
    { id: 'plank', name: 'Forearm Plank', sets: 3, target: '30–60 sec', rest: 60, metric: 'seconds', cue: 'Keep your back straight and your hips level. Brace your core.' },
  ] },
  { id: 'upper-1', day: 2, name: 'Upper Body I', exercises: [
    { id: 'lat-pulldown', name: 'Lat Pulldown', variants: ['Wide grip', 'Neutral grip'], sets: 4, target: '8 reps', rest: 120, cue: 'Lean back and engage your core. Squeeze your armpits, pull the bar down to your chest and get a full stretch at the top.' },
    { id: 'cable-row', name: 'Seated Cable Row', sets: 3, target: '10–12 reps', rest: 90, cue: 'Get a full stretch forward. Drive elbows back down near your hips and squeeze your shoulder blades together at contraction.' },
    { id: 'hammer-curl', name: 'Dumbbell Hammer Curl', sets: 3, target: '10 reps', rest: 90, cue: 'Move slowly and keep your elbows at your sides. Avoid swinging your arms.' },
    { id: 'tricep-pushdown', name: 'Cable Tricep Pushdown', sets: 3, target: '10 reps', rest: 90, cue: 'Move slowly and keep your elbows fixed at your sides.' },
    { id: 'lateral-raise', name: 'Dumbbell Lateral Raises', sets: 3, target: '12–15 reps', rest: 90, cue: 'Use a light weight and move slowly without swinging. Raise at a 45-degree angle and think of lifting from your elbows.' },
  ] },
  { id: 'lower-2', day: 4, name: 'Lower Body II', exercises: [
    { id: 'squat', name: 'Back Squat', variants: ['Barbell', 'Smith machine'], sets: 4, target: '8 reps', rest: 120, cue: 'Heavy but controlled. Only elevate your heels if it helps your form.' },
    { id: 'hamstring-curl', name: 'Hamstring Curl', variants: ['Seated', 'Lying'], sets: 3, target: '10 reps', rest: 90, cue: 'Big squeeze at contraction with a 3-sec negative.' },
    { id: 'split-squat', name: 'Dumbbell Bulgarian Split Squat', sets: 3, target: '8 reps per leg', rest: 90, perSide: 'leg', cue: 'Lower slowly and bring your knee toward the floor without resting it. Rest after both legs.' },
    { id: 'calf-raise', name: 'Standing Calf Raises', variants: ['Dumbbells', 'Smith machine'], sets: 3, target: '12–15 reps', rest: 75, cue: 'Use a controlled 3-sec descent and get a full stretch.' },
    { id: 'leg-raise', name: 'Lying Leg Raises', sets: 3, target: '12–15 reps', rest: 60, metric: 'bodyweight', cue: 'Move slowly and keep your feet from touching the ground between reps.' },
  ] },
  { id: 'upper-2', day: 5, name: 'Upper Body II', exercises: [
    { id: 'shoulder-press', name: 'Shoulder Press', variants: ['Machine', 'Dumbbells'], sets: 4, target: '8 reps', rest: 120, cue: 'Elbows at 45 degrees. Lower slowly to just past shoulder height.' },
    { id: 'chest-press', name: 'Chest Press', variants: ['Machine', 'Barbell bench press'], sets: 3, target: '8–10 reps', rest: 120, cue: 'Slow and controlled.' },
    { id: 'overhead-tricep', name: 'Overhead Tricep Extensions', sets: 3, target: '10–12 reps', rest: 90, cue: 'Set the cable halfway up. Step away, keep your ears tucked between your arms and pull forward above your head.' },
    { id: 'reverse-pec-deck', name: 'Reverse Pec Deck', sets: 3, target: '12 reps', rest: 90, cue: 'Focus on squeezing your shoulder blades together without taking your arms all the way behind you.' },
    { id: 'russian-twist', name: 'Russian Twists', sets: 3, target: '10 reps per side', rest: 60, perSide: 'side', cue: 'Slow and controlled with a tight core.' },
  ] },
] satisfies Array<{ id: string; day: number; name: string; exercises: Exercise[] }>;

export type Plan = { id: string; day: number; name: string; exercises: Exercise[] };
export const exercises: Exercise[] = plans.flatMap((plan) => [...plan.exercises] as Exercise[]);
export const findPlan = (id: string): Plan | undefined => plans.find((plan) => plan.id === id);
export const findExercise = (id: string) => exercises.find((exercise) => exercise.id === id);

export const restDay = 'Build toward your step goal with walks. For tightness or soreness, Brenna suggests light stretching, foam rolling or yoga.';
export const cardioDay = 'Brenna suggests a 45–60 minute outdoor walk, hike or cycle. Swimming, sport, yoga or Pilates are also options.';
