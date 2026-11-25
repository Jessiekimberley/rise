import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

function readUrl(file, key) {
  const text = readFileSync(file, 'utf8');
  const match = text.match(new RegExp(`^${key}=["']?([^"'\\n]+)`, 'm'));
  return match ? match[1].trim() : '';
}

function brief(rows) {
  if (!rows?.length) return 'no rows';
  return rows.map((row) => {
    const sessions = row.state?.sessions || {};
    const parts = Object.entries(sessions).map(([key, session]) => {
      const slots = session?.slots || {};
      let sets = 0;
      const names = [];
      for (const [id, slot] of Object.entries(slots)) {
        const count = Object.keys(slot?.sets || {}).length + (slot?.warmup ? 1 : 0) + (slot?.upper ? 1 : 0) + (slot?.lower ? 1 : 0);
        sets += count;
        if (count) names.push(`${slot?.exerciseId || id}:${count}`);
      }
      return `${key} sets=${sets} finished=${Boolean(session?.finishedAt)} ${names.join(',')}`;
    });
    return `rev=${row.revision} updated=${row.updated_at} ${parts.join(' | ') || 'empty'}`;
  }).join('\n');
}

const url = readUrl(new URL('../.env.local', import.meta.url), 'DATABASE_URL_UNPOOLED')
  || readUrl(new URL('../.env.local', import.meta.url), 'DATABASE_URL');
const sql = neon(url);
const times = [
  '2026-11-25 04:00:00+00',
  '2026-11-25 06:00:00+00',
  '2026-11-25 12:00:00+00',
  '2026-11-25 18:00:00+00',
  '2026-11-25 20:50:00+00',
  '2026-11-25 20:54:00+00',
];
for (const time of times) {
  try {
    const rows = await sql.query(
      `SELECT user_id, revision, updated_at, state FROM rise_training_logs AT TIMESTAMP '${time}'`,
    );
    console.log('AT', time);
    console.log(brief(rows));
  } catch (error) {
    console.log('AT', time, 'failed', error instanceof Error ? error.message.split('\n')[0] : String(error));
  }
}
