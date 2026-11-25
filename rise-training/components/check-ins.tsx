'use client';

import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { addDays, blocksForDates, buildReport, datesThrough, dayHeading, displayDate, setWork, trainingWeekStart, type ReportDay, type ReportSet } from '@/lib/insights';
import type { CheckIn, TrainingData, TrainingSnapshot } from '@/lib/model';
import { docUrl, type DocTarget } from '@/lib/coach-doc';
import { setsCsv } from '@/lib/workout-export';
import { WeeklyCheckInLink } from './weekly-check-in';
import { BottomSheet, HeadingSentence, Pill, PrimaryButton, RoundButton, Row, RowStack } from './ui';
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

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportName(chosen: string[], week: string[]) {
  const sorted = [...chosen].sort();
  if (sorted.length === 1) return `rise-sets-${sorted[0]}.csv`;
  if (sorted.length === week.length && sorted.every((date, index) => date === week[index])) return `rise-sets-week-${week[0]}.csv`;
  return `rise-sets-${sorted[0]}-to-${sorted[sorted.length - 1]}.csv`;
}

function ExportSets({ data, week, onClose }: { data: TrainingData; week: string[]; onClose: () => void }) {
  const titleId = useId();
  const days = blocksForDates(data, week);
  const logged = week.filter((date) => days.some((day) => day.date === date && (day.sets.length || day.lines.length)));
  const [picked, setPicked] = useState(() => new Set(logged));

  function save(dates: string[]) {
    const chosen = [...dates].sort();
    if (!chosen.length) return;
    downloadCsv(exportName(chosen, week), setsCsv(blocksForDates(data, chosen)));
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
    <p className="fine">Choose days, or export the whole week. This downloads a spreadsheet.</p>
    <div className="export-days" role="group" aria-label="Days to export">
      {week.map((date) => <label key={date} className="export-day">
        <input type="checkbox" checked={picked.has(date)} onChange={() => toggle(date)} />
        <span className="export-day-copy">
          <span className="export-day-name">{dayHeading(date)}</span>
          <span className="export-day-detail">{exportDetail(date, days)}</span>
        </span>
      </label>)}
    </div>
    <PrimaryButton onClick={() => save([...picked])} disabled={!picked.size}>Export selected days</PrimaryButton>
    <PrimaryButton className="button-quiet" onClick={() => save(week)}>Export whole week</PrimaryButton>
  </BottomSheet>;
}

function sentEntries(data: TrainingData) {
  return Object.values(data.checkIns).filter((entry) => entry.publishedAt)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

function CheckInSent({ entry, data, done, open }: { entry: CheckIn; data: TrainingData; done: () => void; open: (entry: CheckIn) => void }) {
  const title = buildReport(data, entry.kind, entry.start, entry.end).title;
  const previous = sentEntries(data).filter((item) => item.id !== entry.id);
  return <section className="screen screen-sent">
    <span className="sent-check" aria-hidden="true"><Check size={23} /></span>
    <HeadingSentence className="heading-32" lead="Added to your coaching doc." follow="Appended to the end of the Google Doc. Nothing above it changed." />
    <section className="doc-preview" aria-label="Appended check-in">
      <div className="document-stub"><span></span><span></span><span>Earlier entries, untouched</span></div>
      <Pill className="pill-new">New</Pill>
      <h2>{title}</h2>
      <p>{entry.text}</p>
    </section>
    {previous.length ? <section aria-label="Earlier check-ins">
      <RowStack>{previous.map((item) => <Row key={item.id} label={displayDate(item.end)} value={item.kind === 'weekly' ? 'Weekly log' : 'Midweek log'}
        onClick={() => open(item)} end={<ChevronRight size={18} />} />)}</RowStack>
    </section> : <p className="fine">No earlier logs yet.</p>}
    <div className="screen-actions">
      <PrimaryButton onClick={done}>Done</PrimaryButton>
      <PrimaryButton className="button-quiet" onClick={() => open(entry)}>Edit this log</PrimaryButton>
    </div>
  </section>;
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

export function CheckIns({ date, data, mutate, publish, destination, docsReady, setFocused, done }: {
  date: string; data: TrainingData; mutate: Mutate; publish: (id: string) => Promise<TrainingSnapshot>;
  destination?: DocTarget; docsReady: boolean; setFocused: (focused: boolean) => void; done: () => void;
}) {
  const [receipt, setReceipt] = useState<CheckIn>();
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = trainingWeekStart(date, data.startedOn);
  const weekEnd = addDays(start, 6);
  const week = datesThrough(start, weekEnd);
  const end = date < weekEnd ? date : weekEnd;
  const report = buildReport(data, 'weekly', start, end);
  const text = draft ?? report.text;
  const canSend = docsReady && !!destination && !!text.trim();
  const history = Object.values(data.checkIns).sort((a, b) => b.end.localeCompare(a.end) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const editing = editingId ? data.checkIns[editingId] : undefined;

  useEffect(() => {
    if (!editingId || data.checkIns[editingId]) return;
    setEditingId(undefined);
    setReceipt((current) => current?.id === editingId ? undefined : current);
    setFocused(false);
  }, [editingId, data.checkIns, setFocused]);

  function viewReceipt(entry: CheckIn) {
    setReceipt(entry);
    setEditingId(undefined);
    setFocused(true);
    window.scrollTo(0, 0);
  }

  function openLog(entry: CheckIn) {
    setEditingId(entry.id);
    setFocused(true);
    window.scrollTo(0, 0);
  }

  function closeLog() {
    setEditingId(undefined);
    if (!receipt) setFocused(false);
    window.scrollTo(0, 0);
  }

  function leaveEditor() {
    setEditingId(undefined);
    setReceipt(undefined);
    setFocused(false);
    window.scrollTo(0, 0);
  }

  async function send() {
    if (busy || !canSend) return;
    setBusy(true);
    setError('');
    const id = crypto.randomUUID();
    try {
      await mutate({ type: 'checkIn', data: { id, kind: 'weekly', start, end, text: text.trim() } });
      const result = await publish(id);
      const published = result.data.checkIns[id];
      if (!published?.publishedAt) throw new Error('Google Docs has yet to confirm the append. Try again.');
      setDraft(null);
      viewReceipt(published);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send the log. Try again.');
    } finally { setBusy(false); }
  }

  if (editing) return <LogEditor key={editing.id} entry={editing} data={data} mutate={mutate} onBack={closeLog} onDone={leaveEditor} />;
  if (receipt) return <CheckInSent entry={receipt} data={data} done={done} open={openLog} />;

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
    <details className="disclosure">
      <summary>Edit the message</summary>
      <section className="doc-preview">
        <span className="fine">Change the text before you send it.</span>
        <textarea className="log-message" value={text} maxLength={24_000} placeholder="No sets logged for this week yet." aria-label="Message for the coaching Doc" disabled={busy}
          onChange={(event) => setDraft(event.target.value)} />
        {draft !== null && draft !== report.text && <Pill onClick={() => setDraft(null)}>Use latest sets</Pill>}
      </section>
    </details>
    {error && <p className="notice" role="alert">{error}</p>}
    {!docsReady && <p className="fine">Google Docs isn’t connected yet. Your sets stay saved in the app.</p>}
    {docsReady && !destination && <p className="fine">The coaching Doc isn’t connected yet. Your sets stay saved in the app.</p>}
    <div className="screen-actions">
      <PrimaryButton onClick={() => void send()} disabled={busy || !canSend}>
        {busy ? 'Sending…' : 'Send to coaching doc'}
      </PrimaryButton>
      <PrimaryButton className="button-quiet" onClick={() => setExporting(true)} disabled={busy}>Export</PrimaryButton>
      <WeeklyCheckInLink />
    </div>
    {exporting && <ExportSets data={data} week={week} onClose={() => setExporting(false)} />}
    <details className="disclosure supplementary">
      <summary>Previous logs</summary>
      {destination && <div className="check-in-extras"><Pill href={docUrl(destination)}>Open coaching Doc</Pill></div>}
      {history.length ? <RowStack>{history.map((entry) => <Row key={entry.id} label={`${displayDate(entry.end)} · ${entry.publishedAt ? 'Sent' : 'Saved'}`}
        value="Training log" onClick={() => { if (!busy) openLog(entry); }} end={<ChevronRight size={18} />} />)}</RowStack>
        : <p className="fine">No previous logs yet.</p>}
    </details>
  </section>;
}
