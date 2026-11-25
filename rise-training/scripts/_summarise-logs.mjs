import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

function hostOf(url) {
  try { return new URL(url).host; } catch { return 'unparseable'; }
}

function readUrl(file, key) {
  const text = readFileSync(file, 'utf8');
  const match = text.match(new RegExp(`^${key}=["']?([^"'\\n]+)`, 'm'));
  return match ? match[1].trim() : '';
}

function summarise(label, rows) {
  console.log('---', label, 'rows', rows.length);
  for (const row of rows) {
    const state = row.state || {};
    const sessions = state.sessions || {};
    console.log('user', row.user_id, 'rev', row.revision, 'updated', row.updated_at, 'sessions', Object.keys(sessions).length);
    for (const [key, session] of Object.entries(sessions)) {
      const slots = session?.slots || {};
      const bits = [];
      for (const [slotId, slot] of Object.entries(slots)) {
        const sets = slot?.sets || {};
        const indexes = Object.keys(sets);
        if (!indexes.length && !slot?.warmup && !slot?.upper && !slot?.lower) continue;
        const detail = indexes.sort((a, b) => Number(a) - Number(b)).map((index) => {
          const set = sets[index];
          return `#${index} ${set.weight ?? '-'}x${set.reps ?? set.seconds ?? '-'} ${set.variant || ''}`.trim();
        });
        bits.push(`${slot.exerciseId || slotId} [${detail.join('; ')}]`);
      }
      console.log(' ', key, 'finished=' + Boolean(session?.finishedAt), 'started=' + (session?.startedAt || ''), bits.join(' || ') || 'no sets');
    }
    const habits = state.habits || {};
    for (const [date, habit] of Object.entries(habits)) {
      console.log('  habit', date, JSON.stringify(habit));
    }
    const completions = state.completions || [];
    const yesterday = completions.filter((item) => String(item.completedAt || '').startsWith('2026-11-25') || String(item.completedAt || '').includes('2026-11-25'));
    console.log('  completions', completions.length, 'yesterdayish', yesterday.length);
    const notes = state.dayNotes || {};
    console.log('  dayNotes', Object.keys(notes).join(',') || 'none');
  }
}

async function inspect(label, url) {
  if (!url) {
    console.log('---', label, 'missing');
    return;
  }
  console.log('HOST', label, hostOf(url));
  const sql = neon(url);
  try {
    const tables = await sql.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    console.log('tables', tables.map((row) => row.tablename).join(', ') || 'none');
    if (tables.some((row) => row.tablename === 'rise_training_logs')) {
      const logs = await sql.query('SELECT user_id, revision, updated_at, state FROM rise_training_logs');
      summarise(label, logs);
    }
  } catch (error) {
    console.log(label, 'failed', error instanceof Error ? error.message.split('\n')[0] : String(error));
  }
}

const root = new URL('..', import.meta.url);
await inspect('training-local-env', readUrl(new URL('../.env.local', import.meta.url), 'DATABASE_URL_UNPOOLED') || readUrl(new URL('../.env.local', import.meta.url), 'DATABASE_URL'));
await inspect('gym-env', readUrl(new URL('../../rise-gym/.env', import.meta.url), 'DATABASE_URL_UNPOOLED') || readUrl(new URL('../../rise-gym/.env', import.meta.url), 'DATABASE_URL'));
await inspect('neon-preview', readUrl(new URL('../.env.neon-preview', import.meta.url), 'DATABASE_URL_UNPOOLED') || readUrl(new URL('../.env.neon-preview', import.meta.url), 'DATABASE_URL'));
void root;
