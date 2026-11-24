'use client';

import { Check, ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';
import { buildReport, displayDate, programmeDay, trainingWeekStart } from '@/lib/insights';
import type { CheckIn, TrainingData, TrainingSnapshot } from '@/lib/model';
import type { Mutate } from './training-app';
import { docUrl, type DocTarget } from '@/lib/coach-doc';

type Kind = CheckIn['kind'];

export function CheckIns({ date, data, mutate, publish, destination }: {
  date: string; data: TrainingData; mutate: Mutate; publish: (id: string) => Promise<TrainingSnapshot>; destination?: DocTarget;
}) {
  const [kind, setKind] = useState<Kind>(() => programmeDay(date, data.startedOn) <= 4 ? 'midweek' : 'weekly');
  const [id, setId] = useState<string>();
  const [edited, setEdited] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const selected = id ? data.checkIns[id] : undefined;
  const start = selected?.start ?? trainingWeekStart(date, data.startedOn);
  const end = selected?.end ?? date;
  const generated = buildReport(data, kind, start, end);
  const text = edited ?? selected?.text ?? generated.text;
  const locked = !!(selected?.publishingAt || selected?.publishedAt);
  const doc = selected?.publishTarget ?? destination;
  const dirty = selected?.text !== text;

  function clear(next: Kind) { setKind(next); setEdited(undefined); setId(undefined); setStatus(''); }

  async function save(send: boolean) {
    if (busy || !text.trim()) return;
    setBusy(true);
    setStatus('');
    try {
      const idToSave = id ?? crypto.randomUUID();
      if (!locked && (!id || dirty)) {
        await mutate({ type: 'checkIn', data: { id: idToSave, kind, start, end, text } });
        setId(idToSave);
        setEdited(undefined);
      }
      if (send) {
        await publish(idToSave);
        setStatus('Check-in added to the shared Google Doc.');
      } else setStatus('Draft saved.');
    } catch { /* The app shows the error. */ } finally { setBusy(false); }
  }

  const history = Object.values(data.checkIns).sort((a, b) => b.end.localeCompare(a.end));
  return <>
    <h1 className="page-title">Check-ins</h1>
    <div className="segment"><button type="button" disabled={busy} aria-pressed={kind === 'midweek'} onClick={() => clear('midweek')}>Midweek</button><button type="button" disabled={busy} aria-pressed={kind === 'weekly'} onClick={() => clear('weekly')}>Weekly</button></div>
    <section className="check-in-form">
      <div className="section-line"><h2>{generated.title}</h2>{selected?.publishedAt && <span className="success"><Check size={16} /> Saved to Doc</span>}</div>
      {doc && <a className="doc-link" href={docUrl(doc)} target="_blank" rel="noreferrer">Open check-in Doc</a>}
      <label className="input-group"><span>Check-in for Brenna</span><textarea rows={12} maxLength={24_000} value={text} readOnly={locked} disabled={busy}
        placeholder="Log some training or add a note for Brenna." onChange={(event) => setEdited(event.target.value)} /></label>
      {!selected?.publishedAt && <div className="check-in-actions">
        <button type="button" className="primary" disabled={!text.trim() || busy} onClick={() => void save(true)}><FileText size={18} />{busy ? 'Saving…' : selected?.publishingAt ? 'Retry Google Doc save' : 'Save to Google Doc'}</button>
        <button type="button" className="secondary" disabled={busy || !dirty || !text.trim() || locked} onClick={() => void save(false)}>Save draft</button>
      </div>}
      <p className="fine" role="status">{status}</p>
    </section>
    {!!history.length && <section className="training-list"><h2>Previous check-ins</h2>{history.map((entry) => <button type="button" key={entry.id} className="list-row" disabled={busy} onClick={() => { setId(entry.id); setKind(entry.kind); setEdited(undefined); setStatus(''); }}>
      <span><strong>{entry.kind === 'midweek' ? 'Midweek' : 'Weekly'} · {displayDate(entry.end, { day: 'numeric', month: 'short', year: 'numeric' })}</strong><small>{entry.publishedAt ? 'Saved to Google Doc' : entry.publishingAt ? 'Google Doc save pending' : 'Draft'}</small></span><ChevronRight size={19} />
    </button>)}</section>}
  </>;
}
