import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReportDay, ReportSet } from '../lib/insights';
import { pdfPage, textWidth } from '../lib/plain-pdf';
import { readStoredZip } from '../lib/plain-xlsx';
import { exportBaseName, exportRange, setsPdf, setsWorkbook } from '../lib/workout-export';

const winAnsi: Record<number, string> = { 0x85: '\u2026', 0x96: '\u2013', 0x97: '\u2014' };

function day(date: string, extra: Partial<ReportDay> = {}): ReportDay {
  return {
    date, order: 0, weekday: 'Monday', heading: 'Monday, 23 Nov', workout: '', inProgress: false,
    sets: [], lines: [], text: '', ...extra,
  };
}

function set(extra: Partial<ReportSet> = {}): ReportSet {
  return { exercise: 'Leg Press', set: 1, weight: 45, reps: 8, seconds: null, rir: '2', ...extra };
}

function pdfText(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /^%PDF-1.4\n/);
  assert.match(text, /%%EOF\n$/);
  const start = Number(text.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
  assert.equal(text.slice(start, start + 4), 'xref');
  assert.equal(Number(text.match(/xref\n0 (\d+)\n/)?.[1]), Number(text.match(/\/Size (\d+)/)?.[1]));
  return text;
}

function unescapePdf(body: string) {
  let out = '';
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== '\\') {
      out += body[index];
      continue;
    }
    const next = body[index + 1] ?? '';
    if (next >= '0' && next <= '7') {
      let octal = next;
      let taken = 1;
      while (taken < 3 && (body[index + 1 + taken] ?? '') >= '0' && (body[index + 1 + taken] ?? '') <= '7') {
        octal += body[index + 1 + taken];
        taken += 1;
      }
      index += taken;
      const code = Number.parseInt(octal, 8);
      out += winAnsi[code] ?? String.fromCharCode(code);
      continue;
    }
    out += next;
    index += 1;
  }
  return out;
}

function assertLaidOut(pdf: string) {
  let seen = 0;
  for (const match of pdf.matchAll(/BT \/F([12]) ([0-9.]+) Tf 1 0 0 1 ([0-9.]+) ([0-9.]+) Tm \(((?:\\.|[^\\)])*)\) Tj ET/g)) {
    seen += 1;
    const size = Number(match[2]);
    const x = Number(match[3]);
    const y = Number(match[4]);
    const value = unescapePdf(match[5]);
    const end = x + textWidth(value, size, match[1] === '2');
    assert.ok(x >= 55.5, value);
    assert.ok(end <= pdfPage.width - 55.5, `${value} ends at ${end}`);
    assert.ok(y >= 30 && y <= pdfPage.height - 36, value);
  }
  assert.ok(seen > 3);
  for (const line of pdf.matchAll(/[0-9.]+ w ([0-9.]+) ([0-9.]+) m ([0-9.]+) ([0-9.]+) l S/g)) {
    assert.ok(Number(line[1]) >= 55.5 && Number(line[3]) <= pdfPage.width - 55.5);
    assert.equal(line[2], line[4]);
  }
}

test('export names and date ranges stay short', () => {
  const week = ['2026-11-23', '2026-11-24', '2026-11-29'];
  assert.equal(exportBaseName(['2026-11-24'], week), 'rise-log-2026-11-24');
  assert.equal(exportBaseName(week, week), 'rise-log-week-2026-11-23');
  assert.equal(exportBaseName(['2026-11-24', '2026-11-23'], week), 'rise-log-2026-11-23-to-2026-11-24');
  assert.equal(exportRange([day('2026-11-23'), day('2026-11-29')]), '23–29 Nov 2026');
  assert.equal(exportRange([day('2026-11-23')]), '23 Nov 2026');
  assert.equal(exportRange([]), 'No days selected');
});

test('the PDF is a single tidy page and the spreadsheet keeps text as text', () => {
  const days = [
    day('2026-11-23', {
      weekday: 'Monday', heading: 'Monday, 23 Nov', workout: 'Lower body',
      sets: [set({ set: 2, weight: 47.5, exercise: 'Leg Press & curl' }), set({ exercise: 'Back squat (Barbell)', set: 3, perSide: 'side' })],
      lines: ['Leg Press notes: a < b & c\nthen reset'],
    }),
    day('2026-11-24', { weekday: 'Tuesday', heading: 'Tuesday, 24 Nov' }),
    day('2026-11-25', { weekday: 'Wednesday', heading: 'Wednesday, 25 Nov', workout: 'Upper body', inProgress: true, sets: [set({ rir: '' })] }),
  ];
  const pdf = pdfText(setsPdf(days));
  assert.match(pdf, /\/Count 1/);
  assert.ok(pdf.includes('(Leg Press & curl)'));
  assert.ok(pdf.includes('(47.5)'));
  assert.ok(pdf.includes('(8/side)'));
  assert.ok(pdf.includes('(No sets logged)'));
  assert.ok(pdf.includes('In progress'));
  assert.doesNotMatch(pdf, /\(RIR\)[\s\S]*\(RIR\)/);
  assertLaidOut(pdf);

  const files = readStoredZip(setsWorkbook(days));
  const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
  assert.ok(files.get('[Content_Types].xml')?.includes('spreadsheetml.sheet.main+xml'));
  assert.match(files.get('xl/workbook.xml') ?? '', /name="Training log"/);
  assert.match(sheet, /Rise training log/);
  assert.match(sheet, /23–25 Nov 2026/);
  assert.match(sheet, /Monday, 23 Nov 2026 · Lower body · Finished · 2 sets/);
  assert.match(sheet, /Leg Press &amp; curl/);
  assert.match(sheet, /a &lt; b &amp; c/);
  assert.match(sheet, /<v>47\.5<\/v>/);
  assert.match(sheet, /8\/side/);
  assert.match(sheet, /Tuesday, 24 Nov 2026/);
  assert.match(sheet, /No sets logged/);
  assert.match(sheet, /Upper body · In progress/);
  assert.doesNotMatch(sheet, /Upper body · Finished/);
  assert.doesNotMatch(sheet, /<f>/);
});

test('a long log continues onto another PDF page inside the margins', () => {
  const sets = Array.from({ length: 42 }, (_, index) => set({
    set: index + 1,
    exercise: index === 3 ? 'Very long exercise name that has to wrap inside the exercise column without crossing the numbers' : 'Leg Press',
    weight: index === 1 ? null : 40 + index,
    rir: '3+',
  }));
  const pdf = pdfText(setsPdf([day('2026-11-23', { workout: 'Lower body', sets, lines: ['Keep the brace.'] })]));
  assert.match(pdf, /\/Count [2-9]/);
  assert.ok(pdf.includes('(Very long exercise name'));
  assert.ok(pdf.includes('(Keep the brace.)'));
  assertLaidOut(pdf);
});

test('timed work uses a Time column', () => {
  const files = readStoredZip(setsWorkbook([day('2026-11-23', { sets: [set({ seconds: 30, reps: null, weight: null, rir: '' })] })]));
  const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
  assert.match(sheet, />Time</);
  assert.match(sheet, />30s</);
  assert.doesNotMatch(sheet, />Reps</);
});
