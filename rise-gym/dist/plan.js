export const habits = [
  { key: 'steps', label: 'Steps', step: '1', unit: 'steps' },
  { key: 'water', label: 'Water', step: '0.1', unit: 'L' },
  { key: 'sleep', label: 'Sleep', step: '0.1', unit: 'h' },
];

export function documentTab(document, tabId) {
  const pending = [...(document.tabs ?? [])];
  while (pending.length) {
    const tab = pending.shift();
    if (tab.tabProperties?.tabId === tabId && tab.documentTab?.body) return tab.documentTab.body;
    pending.push(...(tab.childTabs ?? []));
  }
  throw new Error('The workout tab could not be found in the shared Doc.');
}

export function paragraphText(item) {
  return (item.paragraph?.elements ?? []).map((element) => element.textRun?.content ?? '').join('');
}

function cellText(cell) {
  return (cell.content ?? []).map(paragraphText).join('').trim();
}

function parseExercise(cells) {
  const [name, count, target, rest, weight, cue] = cells;
  const sets = Number(count);
  if (!name || !Number.isInteger(sets) || sets < 1 || sets > 50 || !target) return null;
  const duration = rest?.match(/^(\d+):(\d{2})\s*(.*)$/);
  const side = target.match(/per\s+(leg|side|arm)/i);
  const metric = /\b(sec|min)/i.test(target) ? 'seconds' : /bodyweight/i.test(weight) ? 'bodyweight' : undefined;
  return {
    name, sets, target, cue: cue ?? '', metric,
    perSide: side?.[1].toLowerCase(),
    rest: duration ? Number(duration[1]) * 60 + Number(duration[2]) : 0,
    restNote: duration?.[3] ?? rest ?? '',
  };
}

export function parseWorkoutPlan(body) {
  const days = [];
  for (const item of body.content ?? []) {
    const rows = item.table?.tableRows?.map((row) => row.tableCells.map(cellText));
    if (!rows?.length) continue;
    const heading = rows[0].filter(Boolean).join(' ');
    const match = heading.match(/^DAY\s+(\d+)\s+(.+)$/i);
    if (!match) continue;
    const number = Number(match[1]);
    const headingText = match[2].split('(')[0].trim().toLowerCase().replace(/ day$/, '');
    const name = headingText[0].toUpperCase() + headingText.slice(1);
    const exercises = rows.slice(1).map(parseExercise).filter(Boolean);
    const activity = rows.slice(1).flat().filter(Boolean).join('\n');
    days.push({ number, name, ...(exercises.length ? { exercises } : { activity }) });
  }
  days.sort((a, b) => a.number - b.number);
  if (days.length !== 7 || days.some((day, index) => day.number !== index + 1)) {
    throw new Error('The Doc’s seven workout day tables could not be read.');
  }

  const paragraphs = (body.content ?? []).map(paragraphText).join('');
  const goals = {
    steps: paragraphs.match(/^Step Goal:\s*([\d,]+\s*[–-]\s*[\d,]+)/im)?.[1],
    water: paragraphs.match(/^Hydration Goal:\s*([\d.]+\s*[–-]\s*[\d.]+\s*L)/im)?.[1],
    sleep: paragraphs.match(/^Sleep Goal:\s*([\d.]+\s*[–-]\s*[\d.]+\s*hours)/im)?.[1],
  };
  return { days, goals };
}
