import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const html = readFileSync(join(tmpdir(), 'rise-prod.html'), 'utf8');
console.log('leg-press', html.includes('leg-press'));
console.log('lower-1', html.includes('lower-1'));
const keys = [...html.matchAll(/2026-11-2[0-9]:[a-z0-9-]+/g)].map((match) => match[0]);
console.log('keys', [...new Set(keys)].join(', ') || 'none');
const start = html.indexOf('sessions');
console.log('sessions index', start);
if (start >= 0) console.log(html.slice(start, start + 500).replace(/\\n/g, ' ').replace(/\\"/g, '"'));
