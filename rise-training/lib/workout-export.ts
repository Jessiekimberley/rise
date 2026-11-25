import { displayDate, setWork, type ReportDay, type ReportSet } from './insights';
import { orderedSlots, type SetLog, type TrainingData } from './model';
import { PdfWriter, pdfPage, textWidth, wrapText, type Rgb } from './plain-pdf';
import { cellStyle, packageXlsx, xmlText } from './plain-xlsx';
import { programmeExercises, workoutPlan } from './weeks';

type Cell = string | number | null | undefined;

function csvCell(value: Cell) {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  // Keep spreadsheet apps from evaluating notes or programme text as formulas.
  const safe = /^[\t\r\n]|^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function workoutCsv(data: TrainingData) {
  const columns = [
    'Workout date', 'Workout', 'Programme day', 'Status', 'Started at (UTC)', 'Finished at (UTC)',
    'Planned exercise', 'Exercise', 'Variation', 'Entry', 'Set', 'Weight (kg)', 'Reps', 'Reps per',
    'Duration (seconds)', 'Effort (RPE)', 'Note', 'Exercise completed at (UTC)', 'Final reps in reserve',
  ];
  const rows: Cell[][] = [columns];
  const sessions = Object.values(data.sessions).sort((a, b) =>
    a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt) || a.planId.localeCompare(b.planId));

  for (const session of sessions) {
    const plan = workoutPlan(data, session.date, session.planId);
    const exercises = programmeExercises(data, plan ? [plan] : []);
    const exercise = (id: string) => exercises.find((item) => item.id === id);
    const workout = [
      session.date, plan?.name ?? session.planId, plan?.day, session.finishedAt ? 'Finished' : 'In progress',
      session.startedAt, session.finishedAt,
    ];
    const firstRow = rows.length;
    for (const [slotId, slot] of orderedSlots(session)) {
      const planned = plan?.exercises.find((item) => item.id === slotId)?.name ?? exercise(slotId)?.name ?? slotId;
      function addSet(set: SetLog, entry: string, index?: number) {
        const lift = exercise(set.exerciseId);
        rows.push([
          ...workout, planned, set.exerciseName ?? lift?.name ?? set.exerciseId, set.variant, entry, index,
          set.weight, set.reps, set.reps == null ? undefined : set.perSide ?? lift?.perSide, set.seconds, set.effort,
        ]);
      }
      if (slot.warmup) addSet(slot.warmup, 'Warm-up');
      if (slot.upper) addSet(slot.upper, 'Upper');
      if (slot.lower) addSet(slot.lower, 'Lower');
      for (const [index, set] of Object.entries(slot.sets)) addSet(set, 'Working set', Number(index) + 1);
      const slotDetails = [...workout, planned, exercise(slot.exerciseId)?.name ?? slot.exerciseId, slot.variant];
      if (slot.note) rows.push([...slotDetails, 'Note', null, null, null, null, null, null, slot.note]);
      if (slot.completion) rows.push([
        ...slotDetails, 'Exercise completed', null, null, null, null, null, null, null,
        slot.completion.completedAt, slot.completion.rir === 3 ? '3+' : slot.completion.rir,
      ]);
    }
    if (rows.length === firstRow) rows.push(workout);
  }

  const csv = rows.map((row) => columns.map((_, index) => csvCell(row[index])).join(',')).join('\r\n');
  return `\uFEFF${csv}\r\n`;
}

function orderDays(days: ReportDay[]) {
  return [...days].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
}

export function exportRange(days: ReportDay[]) {
  const dates = [...new Set(days.map((day) => day.date))].sort();
  if (!dates.length) return 'No days selected';
  const end = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  const last = dates[dates.length - 1];
  if (dates.length === 1) return displayDate(dates[0], end);
  const sameMonth = dates[0].slice(0, 7) === last.slice(0, 7);
  const sameYear = dates[0].slice(0, 4) === last.slice(0, 4);
  const start = displayDate(dates[0], sameMonth ? { day: 'numeric' } : sameYear ? { day: 'numeric', month: 'short' } : end);
  return `${start}–${displayDate(last, end)}`;
}

export function exportBaseName(chosen: string[], week: string[]) {
  const sorted = [...chosen].sort();
  const days = [...week].sort();
  if (!sorted.length) return 'rise-log';
  if (sorted.length === 1) return `rise-log-${sorted[0]}`;
  if (sorted.length === days.length && sorted.every((date, index) => date === days[index])) return `rise-log-week-${sorted[0]}`;
  return `rise-log-${sorted[0]}-to-${sorted[sorted.length - 1]}`;
}

function daySummary(day: ReportDay) {
  const count = day.sets.length;
  return [
    day.workout,
    day.inProgress ? 'In progress' : day.workout ? 'Finished' : '',
    count ? `${count} ${count === 1 ? 'set' : 'sets'}` : '',
  ].filter(Boolean).join(' · ');
}

function dayBand(day: ReportDay) {
  const date = `${day.weekday}, ${displayDate(day.date, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return [date, daySummary(day)].filter(Boolean).join(' · ');
}

const margin = 56;
const pageBottom = 58;
const left = margin;
const right = pdfPage.width - margin;
const contentWidth = right - left;
const ink: Rgb = [0.11, 0.11, 0.12];
const muted: Rgb = [0.43, 0.43, 0.45];
const hairline: Rgb = [0.85, 0.84, 0.82];
const accent: Rgb = [0.9, 0.56, 0.4];

export function setsPdf(days: ReportDay[]) {
  const ordered = orderDays(days);
  const range = exportRange(ordered);
  const pdf = new PdfWriter();
  const cursor = { page: pdf.addPage(), y: pdfPage.height - 64 };
  let continuation = '';
  let headerOnPage = false;
  let showRir = false;
  let workLabel = 'Reps';

  const place = (value: string, x: number, size: number, color: Rgb, bold = false) => {
    pdf.text(cursor.page, value, x, cursor.y, size, color, bold);
  };
  const alignRight = (value: string, edge: number, size: number, color: Rgb, bold = false) => {
    place(value, edge - textWidth(value, size, bold), size, color, bold);
  };
  const nextPage = () => {
    cursor.page = pdf.addPage();
    cursor.y = pdfPage.height - 50;
    place('Rise', left, 10, ink, true);
    alignRight(range, right, 10, muted);
    cursor.y -= 8;
    pdf.line(cursor.page, left, right, cursor.y, accent, 1.25);
    cursor.y -= 18;
    headerOnPage = false;
    for (const line of wrapText(continuation, 9, contentWidth, true)) {
      place(line, left, 9, muted, true);
      cursor.y -= 12;
    }
    if (continuation) cursor.y -= 4;
  };
  const columns = () => {
    const rirWidth = showRir ? 42 : 0;
    const repsWidth = 68;
    const kgWidth = 52;
    const setWidth = 36;
    const repsEdge = right - rirWidth;
    const kgEdge = repsEdge - repsWidth;
    const setEdge = kgEdge - kgWidth;
    return { exerciseWidth: contentWidth - rirWidth - repsWidth - kgWidth - setWidth, setEdge, kgEdge, repsEdge, rirEdge: right };
  };
  const drawHeader = () => {
    if (headerOnPage) return;
    const column = columns();
    place('Exercise', left, 8, muted, true);
    alignRight('Set', column.setEdge, 8, muted, true);
    alignRight('kg', column.kgEdge, 8, muted, true);
    alignRight(workLabel, column.repsEdge, 8, muted, true);
    if (showRir) alignRight('RIR', column.rirEdge, 8, muted, true);
    cursor.y -= 6;
    pdf.line(cursor.page, left, right, cursor.y, hairline, 0.8);
    cursor.y -= 13;
    headerOnPage = true;
  };
  const drawSet = (set: ReportSet) => {
    const column = columns();
    const lines = wrapText(set.exercise, 10, column.exerciseWidth - 10);
    const shown = lines.length ? lines : [set.exercise];
    shown.forEach((line, lineIndex) => {
      if (cursor.y - (headerOnPage ? 16 : 34) < pageBottom) nextPage();
      drawHeader();
      if (lineIndex === 0) {
        alignRight(String(set.set), column.setEdge, 10, ink);
        alignRight(set.weight == null ? '—' : String(set.weight), column.kgEdge, 10, ink);
        alignRight(setWork(set) || '—', column.repsEdge, 10, ink);
        if (showRir) alignRight(set.rir || '—', column.rirEdge, 10, ink);
      }
      place(line, left, 10, ink);
      cursor.y -= 13;
    });
    cursor.y -= 1;
    pdf.line(cursor.page, left, right, cursor.y, hairline, 0.6);
    cursor.y -= 8;
  };

  place('Rise', left, 20, ink, true);
  alignRight('Training log', right, 11, muted);
  cursor.y -= 16;
  pdf.line(cursor.page, left, right, cursor.y, accent, 1.5);
  cursor.y -= 20;
  place(range, left, 11, muted);
  cursor.y -= 26;

  if (!ordered.length) place('No days selected', left, 11, muted);

  ordered.forEach((day, index) => {
    const summary = daySummary(day);
    const lead = 18 + (summary ? 16 : 0) + (day.sets.length ? 36 : 16);
    if (cursor.y - lead < pageBottom) nextPage();
    else if (index > 0) cursor.y -= 14;
    place(day.heading, left, 13, ink, true);
    cursor.y -= 16;
    if (summary) {
      place(summary, left, 9, muted);
      cursor.y -= 15;
    } else cursor.y -= 4;
    continuation = day.workout ? `${day.heading} · ${day.workout}` : day.heading;

    if (!day.sets.length && !day.lines.length) {
      place('No sets logged', left, 10, muted);
      cursor.y -= 16;
      continuation = '';
      return;
    }
    if (day.sets.length) {
      showRir = day.sets.some((set) => set.rir);
      workLabel = day.sets.every((set) => set.seconds != null) ? 'Time' : 'Reps';
      headerOnPage = false;
      for (const set of day.sets) drawSet(set);
    }
    if (day.lines.length) cursor.y -= 4;
    for (const note of day.lines) {
      const paragraphs = note.split('\n').flatMap((part) => wrapText(part, 9, contentWidth));
      for (const line of paragraphs) {
        if (cursor.y - 14 < pageBottom) nextPage();
        place(line, left, 9, muted);
        cursor.y -= 12;
      }
    }
    continuation = '';
    cursor.y -= 4;
  });

  pdf.footer('Rise Training', muted);
  return pdf.toBytes();
}

const sheetColumns = 5;

type SheetCell = { style: number; text?: string; value?: number };

function columnName(column: number) {
  let current = column;
  let letters = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    current = Math.floor((current - 1) / 26);
  }
  return letters;
}

function sheetCell(column: number, row: number, cell: SheetCell) {
  const ref = `${columnName(column)}${row}`;
  if (cell.value != null && Number.isFinite(cell.value)) {
    return `<c r="${ref}" s="${cell.style}"><v>${Math.round(cell.value * 1000) / 1000}</v></c>`;
  }
  if (cell.text != null) {
    const clean = cell.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const preserve = /[\n\r]|^ | $/.test(clean) ? ' xml:space="preserve"' : '';
    return `<c r="${ref}" t="inlineStr" s="${cell.style}"><is><t${preserve}>${xmlText(clean)}</t></is></c>`;
  }
  return `<c r="${ref}" s="${cell.style}"/>`;
}

function sheetRow(row: number, cells: SheetCell[], height: number) {
  return `<row r="${row}" ht="${height}" customHeight="1">${cells.map((cell, index) => sheetCell(index + 1, row, cell)).join('')}</row>`;
}

function across(text: string, style: number) {
  return Array.from({ length: sheetColumns }, (_, index): SheetCell => index === 0 ? { style, text } : { style });
}

function noteHeight(value: string) {
  const lines = value.split('\n').reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / 80)), 0);
  return Math.min(72, Math.max(18, lines * 16));
}

export function setsWorkbook(days: ReportDay[]) {
  const ordered = orderDays(days);
  const range = exportRange(ordered);
  const sets = ordered.flatMap((day) => day.sets);
  const workHeader = sets.length > 0 && sets.every((set) => set.seconds != null) ? 'Time' : 'Reps';
  const rows: { cells: SheetCell[]; height: number; merge: boolean }[] = [
    { height: 26, merge: false, cells: [{ style: cellStyle.title, text: 'Rise training log' }] },
    { height: 18, merge: false, cells: [{ style: cellStyle.subtitle, text: range }] },
    { height: 8, merge: false, cells: [] },
    {
      height: 20, merge: false, cells: [
        { style: cellStyle.header, text: 'Exercise' },
        { style: cellStyle.headerRight, text: 'Set' },
        { style: cellStyle.headerRight, text: 'kg' },
        { style: cellStyle.headerRight, text: workHeader },
        { style: cellStyle.headerRight, text: 'RIR' },
      ],
    },
  ];
  for (const day of ordered) {
    rows.push({ height: 22, merge: true, cells: across(dayBand(day), cellStyle.band) });
    if (!day.sets.length && !day.lines.length) {
      rows.push({ height: 18, merge: true, cells: across('No sets logged', cellStyle.note) });
      continue;
    }
    for (const set of day.sets) {
      rows.push({
        height: 20, merge: false, cells: [
          { style: cellStyle.text, text: set.exercise },
          { style: cellStyle.number, value: set.set },
          { style: cellStyle.number, ...(set.weight == null ? {} : { value: set.weight }) },
          { style: cellStyle.number, text: setWork(set) || '—' },
          { style: cellStyle.number, ...(set.rir ? { text: set.rir } : {}) },
        ],
      });
    }
    for (const line of day.lines) rows.push({ height: noteHeight(line), merge: true, cells: across(line, cellStyle.note) });
  }
  const merges = rows.flatMap((row, index) => row.merge ? [`A${index + 1}:E${index + 1}`] : []);
  const mergeXml = merges.length ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>` : '';
  const view = rows.length > 4
    ? '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:E${rows.length}"/>
  ${view}
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="36" customWidth="1"/><col min="2" max="2" width="8" customWidth="1"/><col min="3" max="3" width="10" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/><col min="5" max="5" width="10" customWidth="1"/></cols>
  <sheetData>${rows.map((row, index) => sheetRow(index + 1, row.cells, row.height)).join('')}</sheetData>
  ${mergeXml}
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.6" right="0.6" top="0.7" bottom="0.6" header="0.28" footer="0.28"/>
  <pageSetup paperSize="9" fitToWidth="1" fitToHeight="0"/>
  <headerFooter><oddHeader>&amp;LRise&amp;RTraining log</oddHeader><oddFooter>&amp;L${xmlText(range)}&amp;RPage &amp;P</oddFooter></headerFooter>
</worksheet>`;
  return packageXlsx(sheet);
}
