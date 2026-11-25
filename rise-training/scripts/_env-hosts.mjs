import { readFileSync } from 'node:fs';

function hosts(file) {
  const text = readFileSync(file, 'utf8');
  console.log('FILE', file);
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) continue;
    const raw = line.slice(match[1].length + 1).trim().replace(/^["']|["']$/g, '');
    let host = '';
    if (raw.startsWith('postgres')) {
      try { host = new URL(raw).host; } catch { host = 'bad-url'; }
    }
    console.log(match[1], host || (raw ? 'set' : 'empty'));
  }
}

hosts(new URL('../.env.local', import.meta.url));
hosts(new URL('../.env.neon-preview', import.meta.url));
