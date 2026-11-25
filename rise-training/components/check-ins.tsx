'use client';

import { Check, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { addDays, buildReport, displayDate, reportStats, sleepDuration, trainingWeekStart } from '@/lib/insights';
import type { CheckIn, TrainingData, TrainingSnapshot } from '@/lib/model';
import { docUrl, type DocTarget } from '@/lib/coach-doc';
import { programmeDays } from '@/lib/programme';
import { ChipGroup, HeadingSentence, Pill, PrimaryButton, Row, RowStack } from './ui';
import type { Mutate } from './training-app';

const dateWords = { weekday: 'long', day: 'numeric', month: 'long' } as const;
const kinds = [{ value: 'midweek', label: 'Midweek' }, { value: 'weekly', label: 'Weekly' }] as const;
const prompts = [
  { label: 'Wins', placeholder: 'What went well this week?' },
  { label: 'What’s been hard', placeholder: 'Training, food, sleep, motivation' },
  { label: 'Questions for Brenna', placeholder: 'Anything you want feedback on' },
];
const emptyAnswers = ['', '', ''];
const number = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 1 });
const noLogs = 'No training or habits logged for these dates.';

function summaryValues(data: TrainingData, start: string, end: string, days: number) {
  const summary = reportStats(data, start, end);
  const expected = programmeDays.slice(0, days).filter((day) => day.type === 'strength').length;
  return [
    { label: 'Strength sessions', value: `${summary.sessions} of ${expected}` },
    { label: 'Avg steps', value: summary.steps == null ? '—' : String(Math.round(summary.steps).toLocaleString('en-NZ')) },
    { label: 'Avg water', value: summary.water == null ? '—' : `${number.format(summary.water)} L` },
    { label: 'Avg sleep', value: summary.sleep == null ? '—' : sleepDuration(summary.sleep) },
  ];
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
      <span className="fine">Preview of the text added to the doc</span>
    </section>
    {previous.length ? <section aria-label="Earlier check-ins">
      <RowStack>{previous.map((item) => <Row key={item.id} label={displayDate(item.end)} value={item.kind === 'weekly' ? 'Weekly check-in' : 'Midweek check-in'}
        onClick={() => open(item)} end={<ChevronRight size={18} />} />)}</RowStack>
    </section> : <p className="fine">No earlier check-ins yet.</p>}
    <div className="screen-actions"><PrimaryButton onClick={done}>Done</PrimaryButton></div>
  </section>;
}

export function CheckIns({ date, data, mutate, publish, destination, canManageDocs, docsReady, setFocused, done }: {
  date: string; data: TrainingData; mutate: Mutate; publish: (id: string) => Promise<TrainingSnapshot>;
  destination?: DocTarget; canManageDocs: boolean; docsReady: boolean; setFocused: (focused: boolean) => void; done: () => void;
}) {
  const [id, setId] = useState<string>();
  const [kind, setKind] = useState<CheckIn['kind']>('weekly');
  const [answers, setAnswers] = useState(emptyAnswers);
  const [draftText, setDraftText] = useState<string>();
  const [receipt, setReceipt] = useState<CheckIn>();
  const [busy, setBusy] = useState<'save' | 'send'>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [retrySending, setRetrySending] = useState(false);
  const selected = id ? data.checkIns[id] : undefined;
  const start = selected?.start ?? trainingWeekStart(date, data.startedOn);
  const days = kind === 'midweek' ? 3 : 7;
  const intendedEnd = addDays(start, days - 1);
  const end = selected?.end ?? (date < intendedEnd ? date : intendedEnd);
  const covered = Math.min(days, 1 + Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000));
  const stats = summaryValues(data, start, end, days);
  const report = buildReport(data, kind, start, end);
  const canPublish = docsReady && !!(selected?.publishTarget ?? destination);
  const locked = !!selected?.publishingAt || retrySending;
  const body = draftText ?? [
    `From your logs · ${displayDate(start)}–${displayDate(end)}\n${stats.map(({ label, value }) => `${label}: ${value}`).join('\n')}`,
    ...prompts.flatMap(({ label }, index) => answers[index].trim() ? [`${label}\n${answers[index].trim()}`] : []),
    report.text || noLogs,
  ].join('\n\n');
  const checkInHistory = Object.values(data.checkIns).sort((a, b) => b.end.localeCompare(a.end));

  function viewReceipt(entry: CheckIn) {
    setReceipt(entry);
    setFocused(true);
    window.scrollTo(0, 0);
  }

  function open(entry?: CheckIn) {
    if (entry?.publishedAt) { viewReceipt(entry); return; }
    setId(entry?.id);
    setKind(entry?.kind ?? 'weekly');
    setAnswers(emptyAnswers);
    setDraftText(entry?.text);
    setRetrySending(false);
    setStatus('');
    setError('');
  }

  async function save(send: boolean) {
    if (busy || !body.trim()) return;
    setBusy(send ? 'send' : 'save');
    setStatus('');
    setError('');
    let startedSend = false;
    try {
      const idToSave = id ?? crypto.randomUUID();
      if (!locked && selected?.text !== body) {
        await mutate({ type: 'checkIn', data: { id: idToSave, kind, start, end, text: body } });
        setId(idToSave);
        setDraftText(body);
      }
      if (send) {
        startedSend = true;
        const result = await publish(idToSave);
        const published = result.data.checkIns[idToSave];
        if (!published?.publishedAt) throw new Error('Google Docs has yet to confirm the append. Try again.');
        setRetrySending(false);
        viewReceipt(published);
      } else setStatus('Draft saved.');
    } catch (reason) {
      if (startedSend) setRetrySending(true);
      setError(reason instanceof Error ? reason.message : 'Could not save the check-in. Try again.');
    } finally { setBusy(undefined); }
  }

  if (receipt) return <CheckInSent entry={receipt} data={data} done={done} open={viewReceipt} />;

  return <section className="screen screen-nav screen-check-in">
    <header className="check-in-heading">
      <p className="fine">{displayDate(date, dateWords)}</p>
      <HeadingSentence className="heading-32" lead="Check-in." follow="For Brenna." />
    </header>
    <ChipGroup className="check-in-kinds" label="Check-in period" value={kind} disabled={!!id || !!busy}
      options={[...kinds]} onChange={(value) => setKind(value === 'midweek' ? 'midweek' : 'weekly')} />
    <section className="check-in-summary" aria-label="Check-in summary">
      <h2 className="fine">From your logs · {covered === 1 ? 'Day 1' : `Days 1–${covered}`}</h2>
      <dl>{stats.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
    {draftText === undefined ? <RowStack>
      {prompts.map(({ label, placeholder }, index) => <label className="check-in-answer" key={label}><span>{label}</span>
        <textarea rows={2} maxLength={2_000} placeholder={placeholder} value={answers[index]} disabled={!!busy}
          onChange={(event) => setAnswers((previous) => previous.map((answer, i) => i === index ? event.target.value : answer))} />
      </label>)}
    </RowStack> : <label className="check-in-answer saved-check-in">
      <span>{locked ? 'Saved check-in' : 'Edit saved draft'}</span>
      <textarea rows={7} maxLength={24_000} value={draftText} readOnly={locked} disabled={!!busy}
        onChange={(event) => setDraftText(event.target.value)} />
    </label>}
    {error && <p className="notice" role="alert">{error}</p>}
    {status && <p className="fine" role="status">{status}</p>}
    {canManageDocs && !canPublish && <p className="fine">Connect a check-in Doc in Programme settings to send.</p>}
    {canManageDocs ? <div className="screen-actions">
      <PrimaryButton onClick={() => void save(true)} disabled={!!busy || !canPublish || !body.trim()}>
        {busy === 'send' ? 'Sending…' : locked ? 'Retry sending to the coaching doc' : 'Send to coaching doc'}
      </PrimaryButton>
    </div> : !locked && <div className="screen-actions">
      <PrimaryButton onClick={() => void save(false)} disabled={!!busy || !body.trim()}>{busy === 'save' ? 'Saving…' : 'Save draft'}</PrimaryButton>
    </div>}
    <details className="disclosure supplementary">
      <summary>Drafts and previous check-ins</summary>
      <div className="check-in-extras">
        {canManageDocs && !locked && <Pill onClick={() => void save(false)} disabled={!!busy || !body.trim()}>{busy === 'save' ? 'Saving…' : 'Save draft'}</Pill>}
        {id && <Pill onClick={() => open()} disabled={!!busy}>Start a new check-in</Pill>}
        {destination && <Pill href={docUrl(destination)}>Open coaching Doc</Pill>}
      </div>
      {checkInHistory.length ? <RowStack>{checkInHistory.map((entry) => <Row key={entry.id} label={`${displayDate(entry.end)} · ${entry.publishedAt ? 'Sent' : entry.publishingAt ? 'Ready to retry' : 'Draft'}`}
        value={entry.kind === 'weekly' ? 'Weekly check-in' : 'Midweek check-in'} onClick={() => { if (!busy) open(entry); }} end={<ChevronRight size={18} />} />)}</RowStack>
        : <p className="fine">No previous check-ins yet.</p>}
    </details>
    <Pill href="/api/training/export">Download workout history (CSV)</Pill>
  </section>;
}
