import { loadEnvFile } from 'node:process';
import { neon } from '@neondatabase/serverless';
import { orderedSlots } from '../lib/model';
import { setLabel } from '../lib/insights';
import { trainingStore, type Query } from '../lib/storage';

loadEnvFile('.env.local');
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('missing database');
const sql = neon(url);
const query = (async (text, values) => sql.query(text, values)) as Query;
const { data } = await trainingStore(query).load('rise-owner');
const session = data.sessions['2026-11-25:lower-1'];
if (!session?.finishedAt) throw new Error('Wednesday is not a finished session');
const lines: string[] = [];
for (const [slotId, slot] of orderedSlots(session)) {
  for (const index of Object.keys(slot.sets).map(Number).sort((a, b) => a - b)) {
    lines.push(`${slot.sets[index].exerciseName ?? slotId} ${index + 1}: ${setLabel(slot.sets[index])}`);
  }
}
const upper = data.sessions['2026-11-26:upper-1'];
console.log(lines.join('\n'));
console.log('COUNT', lines.length);
console.log('UPPER', upper ? `${upper.planId} sets=${Object.values(upper.slots).reduce((sum, slot) => sum + Object.keys(slot.sets).length, 0)} finished=${Boolean(upper.finishedAt)}` : 'missing');
