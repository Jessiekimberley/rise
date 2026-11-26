import { loadEnvFile } from 'node:process';
import { neon } from '@neondatabase/serverless';

loadEnvFile('.env.local');

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('missing database');

const sql = neon(url);
const rows = await sql.query('SELECT user_id, revision, updated_at, state FROM rise_training_logs');

function summarise(state: { sessions?: Record<string, unknown>; habits?: Record<string, unknown>; startedOn?: string; completions?: unknown[] }) {
  const sessions = state.sessions ?? {};
  const days = Object.entries(sessions).map(([key, value]) => {
    const session = value as {
      date: string; planId: string; startedAt: string; finishedAt?: string; slotOrder?: string[];
      plan?: { name?: string };
      slots: Record<string, { variant?: string; note?: string; completion?: { rir: number | null }; sets: Record<string, { weight: number | null; reps: number | null; seconds: number | null; effort: number | null; exerciseName?: string; perSide?: string; variant?: string }> }>;
    };
    const sets = Object.entries(session.slots ?? {}).map(([slotId, slot]) => ({
      slotId,
      variant: slot.variant ?? '',
      note: slot.note ?? '',
      rir: slot.completion?.rir ?? null,
      working: Object.keys(slot.sets ?? {}).sort((a, b) => Number(a) - Number(b)).map((index) => {
        const set = slot.sets[index];
        return { i: Number(index) + 1, w: set.weight, r: set.reps, s: set.seconds, e: set.effort, name: set.exerciseName, side: set.perSide, v: set.variant };
      }),
    }));
    return { key, date: session.date, planId: session.planId, startedAt: session.startedAt, finishedAt: session.finishedAt ?? null, order: session.slotOrder ?? null, planName: session.plan?.name, sets };
  }).sort((a, b) => a.date.localeCompare(b.date));
  return { startedOn: state.startedOn ?? null, sessionCount: days.length, days, habitDates: Object.keys(state.habits ?? {}), completionCount: (state.completions ?? []).length };
}

console.log('rows', rows.length);
for (const row of rows) {
  console.log('USER', row.user_id, 'REV', row.revision, 'UPDATED', row.updated_at);
  console.log(JSON.stringify(summarise(row.state as never), null, 2));
}
