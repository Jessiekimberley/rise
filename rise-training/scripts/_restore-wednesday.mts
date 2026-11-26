import { loadEnvFile } from 'node:process';
import { neon } from '@neondatabase/serverless';

loadEnvFile('.env.local');

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('missing database');

const sql = neon(url);
const userId = 'rise-owner';
const sessionKey = '2026-11-25:lower-1';

type SetLog = {
  exerciseId: string;
  variant: string;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  effort: null;
  exerciseName: string;
  perSide?: 'leg';
};

function working(exerciseId: string, exerciseName: string, values: { weight: number | null; reps: number | null; seconds: number | null; perSide?: 'leg' }[]): Record<string, SetLog> {
  return Object.fromEntries(values.map((value, index) => [index, {
    exerciseId,
    variant: '',
    weight: value.weight,
    reps: value.reps,
    seconds: value.seconds,
    effort: null,
    exerciseName,
    ...(value.perSide ? { perSide: value.perSide } : {}),
  }]));
}

function slot(exerciseId: string, exerciseName: string, values: { weight: number | null; reps: number | null; seconds: number | null; perSide?: 'leg' }[]) {
  return { exerciseId, variant: '', sets: working(exerciseId, exerciseName, values), note: '' };
}

const reps = (weight: number | null, count: number) => ({ weight, reps: count, seconds: null as number | null });
const hold = (seconds: number) => ({ weight: null, reps: null, seconds });

const slots = {
  rdl: slot('rdl', 'RDL', [reps(22, 8), reps(22, 8), reps(22, 8)]),
  'forearm-plank': slot('forearm-plank', 'Forearm Plank', [hold(60), hold(55), hold(45)]),
  'leg-press': slot('leg-press', 'Leg Press', [reps(45, 8), reps(65, 8), reps(67.5, 8), reps(75, 8)]),
  'leg-extensions': slot('leg-extensions', 'Leg extensions', [reps(33, 12), reps(33, 12), reps(33, 12)]),
  'walking-lunges': slot('walking-lunges', 'Walking Lunges with dumbbells', [
    { weight: 6, reps: 10, seconds: null, perSide: 'leg' as const },
    { weight: 6, reps: 10, seconds: null, perSide: 'leg' as const },
    { weight: 6, reps: 10, seconds: null, perSide: 'leg' as const },
  ]),
};
const slotOrder = ['rdl', 'forearm-plank', 'leg-press', 'leg-extensions', 'walking-lunges'];

for (let attempt = 0; attempt < 5; attempt += 1) {
  const [row] = await sql.query('SELECT revision, state FROM rise_training_logs WHERE user_id = $1', [userId]);
  const state = row.state as { sessions: Record<string, { date: string; planId: string; finishedAt?: string; slots: unknown }> };
  const current = state.sessions[sessionKey];
  if (!current?.finishedAt) throw new Error('Wednesday session is missing or not finished');
  const upper = state.sessions['2026-11-26:upper-1'];
  const next = { ...current, slots, slotOrder };
  const saved = await sql.query(`
    UPDATE rise_training_logs
    SET state = jsonb_set(state, $4::text[], $2::jsonb), revision = revision + 1, updated_at = now()
    WHERE user_id = $1 AND revision = $3
    RETURNING revision, state
  `, [userId, JSON.stringify(next), row.revision, ['sessions', sessionKey]]);
  const written = saved[0];
  if (!written) continue;
  const after = written.state as typeof state;
  const restored = after.sessions[sessionKey];
  const upperAfter = after.sessions['2026-11-26:upper-1'];
  if (JSON.stringify(upperAfter) !== JSON.stringify(upper)) throw new Error('Thursday session changed');
  const count = Object.values(restored.slots as typeof slots).reduce((sum, item) => sum + Object.keys(item.sets).length, 0);
  console.log(JSON.stringify({
    revision: written.revision,
    finished: Boolean(restored.finishedAt),
    sets: count,
    order: (restored as { slotOrder?: string[] }).slotOrder,
    upperUntouched: upperAfter?.planId === 'upper-1' && !upperAfter.finishedAt,
  }));
  process.exit(0);
}

throw new Error('Could not save Wednesday. The log changed while updating.');
