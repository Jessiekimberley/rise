'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { addDays, blocksForDates, buildReport, datesThrough, dayHeading, displayDate, setWork, trainingWeekStart, type ReportDay, type ReportSet } from '@/lib/insights';
import type { CheckIn, TrainingData } from '@/lib/model';
import { docUrl, type DocTarget } from '@/lib/coach-doc';
import { exportBaseName, setsPdf, setsWorkbook } from '@/lib/workout-export';
import { WeeklyCheckInLink } from './weekly-check-in';
import { BottomSheet, ChipGroup, HeadingSentence, Pill, PrimaryButton, RoundButton, Row, RowStack } from './ui';
import type { Mutate } from './training-app';

const dateWords = { weekday: 'long', day: 'numeric', month: 'long' } as const;
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : 'Could not update the log. Try again.';

function workCell(set: ReportSet) {
  return setWork(set) || '—';
}

function dayMeta(day: ReportDay) {
  const count = day.sets.length;
  return [day.inProgress ? 'In progress' : '', count ? `${count} ${count === 1 ? 'set' : 'sets'}` : ''].filter(Boolean).join(' · ');
}

function dayTitle(day: ReportDay) {
  if (day.workout) return `${day.heading} · ${day.workout}`;
  if (day.lines.length) return `${day.heading} · Habits`;
  return day.heading;
}

function LogDay({ day }: { day: ReportDay }) {
  const showRir = day.sets.some((set) => set.rir);
  const timed = day.sets.length > 0 && day.sets.every((set) => set.seconds != null);
  const meta = dayMeta(day);
  return <details className="log-day" onToggle={(event) => {
    if (event.currentTarget.open) event.currentTarget.scrollIntoView({ block: 'nearest' });
  }}>
    <summary>
      <span className="log-day-copy">
        <span className="log-day-date">{dayTitle(day)}</span>
        {meta && <span className="log-day-meta">{meta}</span>}
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </summary>
    <div className="log-day-body">
      {day.sets.length > 0 && <table className="log-table" aria-label={dayTitle(day)}>
        <thead>
          <tr>
            <th scope="col">Exercise</th>
            <th className="col-set" scope="col">Set</th>
            <th className="col-kg" scope="col">kg</th>
            <th className="col-reps" scope="col">{timed ? 'Time' : 'Reps'}</th>
            {showRir && <th className="col-rir" scope="col">RIR</th>}
          </tr>
        </thead>
        <tbody>
          {day.sets.map((set, index) => <tr key={`${set.exercise}-${set.set}-${index}`}>
            <th scope="row">{set.exercise}</th>
            <td>{set.set}</td>
            <td>{set.weight == null ? '—' : set.weight}</td>
            <td>{workCell(set)}</td>
            {showRir && <td>{set.rir || '—'}</td>}
          </tr>)}
        </tbody>
      </table>}
      {day.lines.length > 0 && <div className="log-notes">{day.lines.map((line, index) => <p key={index}>{line}</p>)}</div>}
    </div>
  </details>;
}

function exportDetail(date: string, days: ReportDay[]) {
  const mine = days.filter((day) => day.date === date && (day.sets.length || day.lines.length));
  if (!mine.length) return 'No sets logged';
  return mine.map((day) => {
    const name = day.workout || 'Habits';
    const count = day.sets.length ? ` · ${day.sets.length} ${day.sets.length === 1 ? 'set' : 'sets'}` : '';
    return `${name}${day.inProgress ? ' · in progress' : ''}${count}`;
  }).join(', ');
}

function downloadFile(name: string, bytes: Uint8Array, type: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ExportSets({ data, week, onClose }: { data: TrainingData; week: string[]; onClose: () => void }) {
  const titleId = useId();
  const days = blocksForDates(data, week);
  const logged = week.filter((date) => days.some((day) => day.date === date && (day.sets.length || day.lines.length)));
  const [picked, setPicked] = useState(() => new Set(logged));
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');

  function save(dates: string[]) {
    const chosen = [...dates].sort();
    if (!chosen.length) return;
    const log = blocksForDates(data, chosen);
    const base = exportBaseName(chosen, week);
    if (format === 'pdf') downloadFile(`${base}.pdf`, setsPdf(log), 'application/pdf');
    else downloadFile(`${base}.xlsx`, setsWorkbook(log), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    onClose();
  }

  function toggle(date: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return <BottomSheet labelId={titleId} onClose={onClose}>
    <h2 id={titleId} className="heading-sentence heading-small">Export sets</h2>
    <p className="fine">PDF is a tidy log. Excel is a simple sheet.</p>
    <div className="export-days" role="group" aria-label="Days to export">
      {week.map((date) => <label key={date} className="export-day">
        <input type="checkbox" checked={picked.has(date)} onChange={() => toggle(date)} />
        <span className="export-day-copy">
          <span className="export-day-name">{dayHeading(date)}</span>
          <span className="export-day-detail">{exportDetail(date, days)}</span>
        </span>
      </label>)}
    </div>
    <ChipGroup className="chips-two" label="Export format" value={format} onChange={(value) => setFormat(value === 'xlsx' ? 'xlsx' : 'pdf')} options={[
      { value: 'pdf', label: 'PDF' },
      { value: 'xlsx', label: 'Excel' },
    ]} />
    <PrimaryButton onClick={() => save([...picked])} disabled={!picked.size}>Download {format === 'pdf' ? 'PDF' : 'Excel'}</PrimaryButton>
    <PrimaryButton className="button-quiet" onClick={() => save(week)}>Whole week as {format === 'pdf' ? 'PDF' : 'Excel'}</PrimaryButton>
  </BottomSheet>;
}

function LogEditor({ entry, data, onBack, onDone, mutate }: {
  entry: CheckIn; data: TrainingData; onBack: () => void; onDone: () => void; mutate: Mutate;
}) {
  const [text, setText] = useState(entry.text);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = buildReport(data, entry.kind, entry.start, entry.end).title;
  const trimmed = text.trim();
  const unchanged = trimmed === entry.text;
  const locked = Boolean(entry.publishingAt && !entry.publishedAt);

  async function save() {
    if (busy || locked || !trimmed || unchanged) return;
    setBusy(true);
    setError('');
    try {
      await mutate({ type: 'checkIn', data: { id: entry.id, kind: entry.kind, start: entry.start, end: entry.end, text: trimmed } });
      onDone();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await mutate({ type: 'deleteCheckIn', id: entry.id });
      onDone();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  return <section className="screen screen-check-in log-editor">
    <div className="screen-toolbar">
      <RoundButton aria-label="Back to check-in" onClick={onBack} disabled={busy}><ChevronLeft size={20} /></RoundButton>
      <span className="fine">{entry.publishedAt ? 'Sent' : 'Saved'}</span>
    </div>
    <header className="check-in-heading">
      <p className="fine">{displayDate(entry.end, dateWords)}</p>
      <HeadingSentence className="heading-32" lead="Training log." follow="Change the text or delete it." />
    </header>
    <section className="doc-preview">
      <h2 id="saved-log-title">{title}</h2>
      <textarea value={text} maxLength={24_000} aria-labelledby="saved-log-title" disabled={busy || locked} onChange={(event) => { setText(event.target.value); setConfirming(false); }} />
    </section>
    {locked && <p className="fine">This log is still sending to the coaching Doc. You can delete it.</p>}
    {entry.publishedAt && <p className="fine">Saving updates this log in the app. The coaching Doc keeps the version already sent.</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="screen-actions">
      {confirming ? <>
        <p className="fine">{entry.publishedAt ? 'This removes the log from the app. The coaching Doc keeps the copy already sent.' : 'This removes the log from the app.'}</p>
        <PrimaryButton onClick={() => void remove()} disabled={busy}>{busy ? 'Deleting…' : 'Delete this log'}</PrimaryButton>
        <PrimaryButton className="button-quiet" onClick={() => setConfirming(false)} disabled={busy}>Keep log</PrimaryButton>
      </> : <>
        <PrimaryButton onClick={() => void save()} disabled={busy || locked || !trimmed || unchanged}>{busy ? 'Saving…' : 'Save changes'}</PrimaryButton>
        <PrimaryButton className="danger-quiet" onClick={() => setConfirming(true)} disabled={busy}>Delete log</PrimaryButton>
      </>}
    </div>
  </section>;
}

export function CheckIns({ date, data, mutate, destination, setFocused }: {
  date: string; data: TrainingData; mutate: Mutate;
  destination?: DocTarget; setFocused: (focused: boolean) => void;
}) {
  const [editingId, setEditingId] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const start = trainingWeekStart(date, data.startedOn);
  const weekEnd = addDays(start, 6);
  const week = datesThrough(start, weekEnd);
  const end = date < weekEnd ? date : weekEnd;
  const report = buildReport(data, 'weekly', start, end);
  const history = Object.values(data.checkIns).sort((a, b) => b.end.localeCompare(a.end) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const editing = editingId ? data.checkIns[editingId] : undefined;

  useEffect(() => {
    if (!editingId || data.checkIns[editingId]) return;
    setEditingId(undefined);
    setFocused(false);
  }, [editingId, data.checkIns, setFocused]);

  function openLog(entry: CheckIn) {
    setEditingId(entry.id);
    setFocused(true);
    window.scrollTo(0, 0);
  }

  function closeLog() {
    setEditingId(undefined);
    setFocused(false);
    window.scrollTo(0, 0);
  }

  function leaveEditor() {
    setEditingId(undefined);
    setFocused(false);
    window.scrollTo(0, 0);
  }

  if (editing) return <LogEditor key={editing.id} entry={editing} data={data} mutate={mutate} onBack={closeLog} onDone={leaveEditor} />;

  return <section className="screen screen-nav screen-check-in">
    <header className="check-in-heading">
      <p className="fine">{displayDate(date, dateWords)}</p>
      <HeadingSentence className="heading-32" lead="Check-in." follow="Sets and reps for Brenna." />
    </header>
    <section className="log-week" aria-label="Training log">
      <h2 className="log-week-title">{report.title}</h2>
      {report.days.length ? <div className="log-days">{report.days.map((day) => <LogDay key={`${day.date}:${day.order}`} day={day} />)}</div>
        : <p className="fine">No sets logged for this week yet.</p>}
    </section>
    <div className="screen-actions">
      <PrimaryButton onClick={() => setExporting(true)}>Export</PrimaryButton>
      <WeeklyCheckInLink />
    </div>
    {exporting && <ExportSets data={data} week={week} onClose={() => setExporting(false)} />}
    <details className="disclosure supplementary">
      <summary>Previous logs</summary>
      {destination && <div className="check-in-extras"><Pill href={docUrl(destination)}>Open coaching Doc</Pill></div>}
      {history.length ? <RowStack>{history.map((entry) => <Row key={entry.id} label={`${displayDate(entry.end)} · ${entry.publishedAt ? 'Sent' : 'Saved'}`}
        value="Training log" onClick={() => openLog(entry)} end={<ChevronRight size={18} />} />)}</RowStack>
        : <p className="fine">No previous logs yet.</p>}
    </details>
  </section>;
}
