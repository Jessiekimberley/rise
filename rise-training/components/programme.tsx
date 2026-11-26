'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { displayDate, weekStart } from '@/lib/insights';
import type { TrainingData } from '@/lib/model';
import {
  contentBefore, fromDraft, programmeChanges, toDraft,
  type CoachAuthor, type ProgrammeContent, type ProgrammeSnapshot,
} from '@/lib/prescription';
import { availableWeek } from '@/lib/weeks';
import { PlanEditor, type ProgrammeDraft } from './plan-editor';
import { WeekControls, WeekReport } from './week-report';
import { ChipGroup, Pill, PrimaryButton, RowStack } from './ui';

type View = 'week' | 'edit' | 'history' | 'messages';
type Draft = ProgrammeDraft;

const authors = [
  { value: 'jessie', label: 'Jessie' },
  { value: 'brenna', label: 'Brenna' },
] as const;
const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : 'Could not save the programme. Try again.';

function draftFrom(content: ProgrammeContent, effectiveFrom: string): Draft {
  return {
    effectiveFrom, deload: content.deload, weekNote: content.weekNote,
    stepsMin: String(content.habits.steps.min), stepsMax: String(content.habits.steps.max),
    days: toDraft(content.days), habits: content.habits,
  };
}

function currentContent(data: TrainingData, programme: ProgrammeSnapshot, date: string) {
  return contentBefore(programme.state, date, availableWeek(data, date)?.plans);
}

function storedAuthor(): CoachAuthor {
  if (typeof localStorage === 'undefined') return 'jessie';
  try { return localStorage.getItem('rise-programme-author') === 'brenna' ? 'brenna' : 'jessie'; }
  catch { return 'jessie'; }
}

export function ProgrammeEditor({ today, data, programme, onSave, leaveGuard }: {
  today: string; data: TrainingData; programme: ProgrammeSnapshot;
  onSave: (body: unknown) => Promise<void>;
  leaveGuard?: { current: () => boolean };
}) {
  const source = currentContent(data, programme, today);
  const [draft, setDraft] = useState(() => draftFrom(source, today));
  const [seen, setSeen] = useState(programme.revision);
  const [view, setView] = useState<View>('week');
  const [weekOf, setWeekOf] = useState(() => weekStart(today));
  const [sheetOpen, setSheetOpen] = useState(false);
  const onOverlay = useCallback((open: boolean) => setSheetOpen(open), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [author, setAuthor] = useState<CoachAuthor>(storedAuthor);
  const [message, setMessage] = useState('');
  const saveId = useRef<string | undefined>(undefined);
  const parsed = fromDraft(draft.days, draft.stepsMin, draft.stepsMax, draft.habits);
  const before = contentBefore(programme.state, draft.effectiveFrom, availableWeek(data, draft.effectiveFrom)?.plans);
  const changes = parsed.ok ? programmeChanges(before, { deload: draft.deload, weekNote: draft.weekNote, days: parsed.days, habits: parsed.habits }) : [];
  const dirty = !parsed.ok || changes.length > 0;
  if (programme.revision !== seen && !dirty) {
    setDraft(draftFrom(currentContent(data, programme, today), today));
    setSeen(programme.revision);
  }

  useEffect(() => {
    if (!leaveGuard) return;
    leaveGuard.current = () => !dirty || window.confirm('You have unsaved changes to the programme. Leave without saving?');
    return () => { leaveGuard.current = () => true; };
  }, [dirty, leaveGuard]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    if (busy || !parsed.ok || !changes.length) return;
    setBusy(true);
    setError('');
    const id = saveId.current ??= crypto.randomUUID();
    try {
      await onSave({
        type: 'save', id, effectiveFrom: draft.effectiveFrom, deload: draft.deload,
        weekNote: draft.weekNote, days: parsed.days, habits: parsed.habits,
      });
      saveId.current = undefined;
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = message.trim();
    if (busy || !text) return;
    setBusy(true);
    setError('');
    try {
      await onSave({ type: 'message', id: crypto.randomUUID(), author, text });
      setMessage('');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const newer = programme.revision !== seen && dirty;
  const applies = draft.effectiveFrom ? displayDate(draft.effectiveFrom) : 'the chosen date';
  const saveLabel = `Save · applies ${applies}`;
  const validation = parsed.ok ? '' : parsed.error;
  function discard() {
    setDraft(draftFrom(currentContent(data, programme, today), today));
    setError('');
  }
  const heading = view === 'week'
    ? ['Jessie\'s week.', 'Everything she logged, in one place.']
    : ['Programme.', 'Shared with Brenna.'];
  return <section className="screen screen-nav screen-programme admin-screen">
    <header className="admin-header">
      <div>
        <h1 className="admin-heading">{heading[0]} <span>{heading[1]}</span></h1>
        <nav className="admin-tabs" aria-label="Programme views">
          {([
            ['week', 'Week'],
            ['edit', 'Edit plan'],
            ['history', 'History'],
            ['messages', `Notes${programme.state.messages.length ? ` ${programme.state.messages.length}` : ''}`],
          ] as const).map(([id, label]) => <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}</button>)}
        </nav>
      </div>
      <div className="admin-tools">
        {view === 'week' && <WeekControls start={weekOf} today={today} onStart={setWeekOf} onAdjust={() => setView('edit')} />}
        {(view === 'edit' || dirty) && <div className="admin-save">
          {dirty ? <>
            <span className="admin-save-copy">
              <span className="admin-dirty"><i aria-hidden="true" />{changes.length ? `${changes.length} unsaved ${changes.length === 1 ? 'change' : 'changes'}` : 'Unsaved changes'}</span>
              <span className="admin-save-note">Logged workouts keep the plan they were saved with</span>
            </span>
            <button type="button" className="admin-discard" onClick={discard} disabled={busy}>Discard</button>
            <button type="button" className="admin-commit" onClick={() => void save()} disabled={busy || !parsed.ok || !changes.length}>{busy ? 'Saving…' : saveLabel}</button>
          </> : <span className="admin-clean">All changes saved</span>}
        </div>}
      </div>
    </header>
    {newer && <p className="notice">A newer programme was saved on another device. Your unsaved edits are still here.</p>}
    {view === 'week' && <WeekReport today={today} data={data} programme={programme} start={weekOf} />}
    {view === 'history' && <History programme={programme} onEdit={(content) => { setDraft(draftFrom(content, today)); setView('edit'); }} />}
    {view === 'messages' && <Messages programme={programme} author={author} message={message} busy={busy}
      onAuthor={(value) => { setAuthor(value); try { localStorage.setItem('rise-programme-author', value); } catch { /* The choice still applies to this note. */ } }}
      onMessage={setMessage} onSend={() => void send()} />}
    {view === 'edit' && <PlanEditor draft={draft} onChange={setDraft} changes={changes} error={validation || error} busy={busy}
      canSave={parsed.ok && changes.length > 0} saveLabel={saveLabel} onSave={() => void save()} onDiscard={discard} onOverlay={onOverlay} />}
    {view !== 'edit' && (validation || error) && <p className="notice" role="alert">{validation || error}</p>}
    {dirty && !sheetOpen && <div className="admin-dock">
      <p className="fine">Logged workouts keep the plan they were saved with</p>
      <div className="admin-dock-actions">
        <button type="button" className="admin-discard" onClick={discard} disabled={busy}>Discard</button>
        <button type="button" className="admin-commit" onClick={() => void save()} disabled={busy || !parsed.ok || !changes.length}>{busy ? 'Saving…' : saveLabel}</button>
      </div>
    </div>}
  </section>;
}

function History({ programme, onEdit }: { programme: ProgrammeSnapshot; onEdit: (content: ProgrammeContent) => void }) {
  const revisions = [...programme.state.revisions].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  if (!revisions.length) return <p className="fine">No saved versions yet. Training still uses the original programme until you save one.</p>;
  return <RowStack>
    {revisions.map((revision) => <details key={revision.id} className="programme-history">
      <summary>
        <span>{displayDate(revision.effectiveFrom)}{revision.deload ? ' · Deload' : ''}</span>
        <small>{revision.summary[0] ?? 'Saved'}</small>
      </summary>
      <ul>{revision.summary.map((line) => <li key={line}>{line}</li>)}</ul>
      <Pill onClick={() => onEdit(revision)}>Edit a copy</Pill>
    </details>)}
  </RowStack>;
}

function Messages({ programme, author, message, busy, onAuthor, onMessage, onSend }: {
  programme: ProgrammeSnapshot; author: CoachAuthor; message: string; busy: boolean;
  onAuthor: (author: CoachAuthor) => void; onMessage: (value: string) => void; onSend: () => void;
}) {
  const notes = programme.state.messages;
  return <div className="programme-messages">
    <ChipGroup label="Writing as" value={author} options={[...authors]} onChange={(value) => onAuthor(value as CoachAuthor)} />
    {notes.length ? <ol className="coach-thread">
      {notes.map((note) => <li key={note.id} data-author={note.author}>
        <span>{note.author === 'brenna' ? 'Brenna' : 'Jessie'} · {displayDate(note.at.slice(0, 10))}</span>
        <p>{note.text}</p>
      </li>)}
    </ol> : <p className="fine">Leave a question or a note. Brenna’s replies stay here, on every device.</p>}
    <div className="programme-composer">
      <label className="input-group"><span>Note</span>
        <textarea rows={3} value={message} maxLength={4_000} placeholder={author === 'brenna' ? 'Reply to Jessie' : 'Question or feedback for Brenna'} onChange={(event) => onMessage(event.target.value)} />
      </label>
      <PrimaryButton onClick={onSend} disabled={busy || !message.trim()}>{busy ? 'Sending…' : 'Send note'}</PrimaryButton>
    </div>
  </div>;
}
