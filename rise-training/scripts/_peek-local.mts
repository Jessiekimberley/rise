import { PGlite } from '@electric-sql/pglite';

const database = new PGlite('.rise-local');
const tables = await database.query<{ tablename: string }>(
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
);
console.log('tables', tables.rows.map((row) => row.tablename).join(', ') || '(none)');
if (tables.rows.some((row) => row.tablename === 'rise_training_logs')) {
  const rows = await database.query<{ user_id: string; revision: number; state: { sessions?: Record<string, { date: string; planId: string; finishedAt?: string; slots: Record<string, { sets: Record<string, { weight: number | null; reps: number | null; seconds: number | null; exerciseName?: string }> }> }> } }>(
    'SELECT user_id, revision, state FROM rise_training_logs',
  );
  for (const row of rows.rows) {
    console.log('USER', row.user_id, 'REV', row.revision);
    for (const [key, session] of Object.entries(row.state.sessions ?? {})) {
      console.log(key, session.finishedAt ? 'finished' : 'open');
      for (const [slotId, slot] of Object.entries(session.slots ?? {})) {
        const sets = Object.keys(slot.sets ?? {}).sort((a, b) => Number(a) - Number(b)).map((index) => {
          const set = slot.sets[index];
          return `${Number(index) + 1}:${set.exerciseName ?? slotId} ${set.weight ?? '—'}kg ${set.reps ?? ''}${set.seconds != null ? `${set.seconds}s` : ''}`;
        });
        console.log(' ', slotId, sets.join(' | ') || '(empty)');
      }
    }
  }
}
await database.close();
