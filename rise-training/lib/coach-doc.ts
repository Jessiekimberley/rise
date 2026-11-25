import { plans, type Exercise, type Plan } from './programme';
import type { CoachWeek } from './weeks';

export type DocContent = {
  paragraph?: { elements?: { textRun?: { content?: string } }[] };
  table?: { tableRows?: { tableCells: { content?: DocContent[] }[] }[] };
};

export const paragraphText = (item: DocContent) => (item.paragraph?.elements ?? []).map((row) => row.textRun?.content ?? '').join('');

export type DocTarget = { documentId: string; tabId: string };

export function docTarget(value: string): DocTarget {
  const url = new URL(value);
  const documentId = url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{16,160})(?:\/|$)/)?.[1];
  const tabId = url.searchParams.get('tab') ?? 't.0';
  if (url.origin !== 'https://docs.google.com' || !documentId || !/^[a-zA-Z0-9._-]{1,96}$/.test(tabId)) throw new Error('Enter a Google Docs link.');
  return { documentId, tabId };
}

export const docUrl = ({ documentId, tabId }: DocTarget) => `https://docs.google.com/document/d/${encodeURIComponent(documentId)}/edit?tab=${encodeURIComponent(tabId)}`;

const identity = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const knownNames: Record<string, string> = {
  'rdl-bar-or-dumbbells': 'rdl', 'walking-lunges-with-dumbbells': 'walking-lunge',
  'lat-pulldown-wide-grip-or-neutral-grip': 'lat-pulldown', 'hammer-curl-with-dumbbells': 'hammer-curl',
  'tricep-pushdown-on-cable': 'tricep-pushdown', 'barbell-or-smith-machine-back-squat': 'squat',
  'seated-or-lying-hamstring-curl': 'hamstring-curl', 'bulgarian-split-squat-with-dumbbells': 'split-squat',
  'standing-calf-raises-holding-dumbbells-or-on-smith-machine': 'calf-raise',
  'cable-crunches': 'cable-crunch',
  'shoulder-press-machine-or-dumbbells': 'shoulder-press', 'chest-press-machine-or-barbell-bench-press': 'chest-press',
  'reverse-pec-deck-rear-delts': 'reverse-pec-deck',
};

function parseRow(row: string[], baseline: Plan): Exercise | undefined {
  const [name, setsText, target, restText, coachWeight, cue] = row;
  const sets = Number(setsText);
  if (!name || !Number.isInteger(sets) || sets < 1 || sets > 20 || !target) return;
  const key = identity(name);
  const known = baseline.exercises.find((exercise) => exercise.id === knownNames[key] || key === identity(exercise.name));
  const rest = restText?.match(/^(\d+):(\d{2})(?:\s+(.*))?$/);
  const metric = /\b(?:sec|min)/i.test(target) ? 'seconds' : /\bbodyweight\b/i.test(coachWeight ?? '') ? 'bodyweight' : known?.metric;
  const side = target.match(/\bper\s+(leg|side)\b/i)?.[1]?.toLowerCase();
  const number = coachWeight?.match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  return {
    id: known?.id ?? key.slice(0, 64), name: known?.name ?? name, sets,
    target: /reps?|sec|min|per/i.test(target) ? target : `${target} reps`,
    rest: rest ? Number(rest[1]) * 60 + Number(rest[2]) : known?.rest ?? 0,
    cue: cue || known?.cue || '',
    restNote: rest?.[3] ?? known?.restNote,
    metric, perSide: side === 'leg' || side === 'side' ? side : undefined, variants: known?.variants,
    coachWeight: !coachWeight || /^(?:bodyweight|\(.*\))$/i.test(coachWeight) ? undefined : coachWeight,
    coachKg: number ? Number(number[1]) : undefined,
    ...(known?.video ? { video: known.video } : {}),
  };
}

export function readWeeks(content: DocContent[], fallbackWeek: number, refreshedAt: string): CoachWeek[] {
  const buckets = new Map<number, Map<number, Plan>>();
  const notes = new Map<number, string[]>();
  let number = fallbackWeek;
  let captureParagraph = false;
  let inCheckIn = false;
  for (const item of content) {
    const content = paragraphText(item).trim();
    const heading = content.match(/^(?:training\s+)?week\s+(\d{1,3})\b/i);
    if (heading && Number(heading[1]) > 0) {
      number = Number(heading[1]); captureParagraph = true; inCheckIn = false;
    } else if (/^(?:midweek|weekly|gym)(?: training)? check-in\b/i.test(content)) {
      inCheckIn = true;
    } else if (content && !inCheckIn) {
      const labeled = content.match(/^(?:coach(?:ing|['’]s)?\s+notes?|brenna['’]s\s+notes?|notes?|feedback|updates?)\s*[:–-]?\s*(.*)$/i);
      if (labeled) captureParagraph = true;
      const note = labeled ? labeled[1] : content;
      if (captureParagraph && note && !/^(?:day\s+\d+|weekly workout program)/i.test(note)) {
        const group = notes.get(number) ?? [];
        group.push(note.slice(0, 2_000));
        notes.set(number, group);
      }
    }

    const rows = item.table?.tableRows?.map((row) => row.tableCells.map((cell) => (cell.content ?? []).map(paragraphText).join('').trim()));
    if (!rows?.length) continue;
    const dayNumber = Number(rows[0].join(' ').match(/^\s*day\s+(\d+)\b/i)?.[1]);
    const base = plans.find((item) => item.day === dayNumber);
    if (!base) continue;
    const prescriptions = rows.slice(1).map((row) => parseRow(row, base)).filter((exercise) => exercise !== undefined);
    if (!prescriptions.length) continue;
    const bucket = buckets.get(number) ?? new Map();
    bucket.set(dayNumber, { ...base, exercises: prescriptions });
    buckets.set(number, bucket);
  }

  const weeks = Array.from(buckets, ([number, entries]) => ({
    number, refreshedAt, notes: notes.get(number),
    plans: [...entries.values()].sort((a, b) => a.day - b.day),
  })).filter((week) => week.plans.length === plans.length);
  if (!weeks.length) throw new Error('Could not find four strength workout tables in the coaching Doc. Your saved programme is still available.');
  return weeks;
}
