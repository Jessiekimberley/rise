'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { displayDate } from '@/lib/insights';
import type { TrainingData } from '@/lib/model';
import {
  blankExercise, contentBefore, duplicateDay, fromDraft, moveItem, programmeChanges, toDraft,
  type CoachAuthor, type DayDraft, type ExerciseDraft, type ProgrammeContent, type ProgrammeHabits, type ProgrammeSnapshot,
} from '@/lib/prescription';
import { availableWeek } from '@/lib/weeks';
import { ChipGroup, HeadingSentence, Pill, PrimaryButton, RoundButton, RowStack } from './ui';

type View = 'edit' | 'history' | 'messages';
type Draft = {
  effectiveFrom: string;
  deload: boolean;
  weekNote: string;
  stepsMin: string;
  stepsMax: string;
  days: DayDraft[];
  habits: ProgrammeHabits;
};

const authors = [
  { value: 'jessie', label: 'Jessie' },
  { value: 'brenna', label: 'Brenna' },
] as const;
const dayKinds = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'active-rest', label: 'Rest' },
] as const;
const modes = [
  { value: 'reps', label: 'Reps' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'time', label: 'Time' },
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

function Field({ label, value, onChange, wide, multiline, inputMode }: {
  label: string; value: string; onChange: (value: string) => void; wide?: boolean; multiline?: boolean; inputMode?: 'numeric' | 'decimal';
}) {
  return <label className={`input-group${wide ? ' span-2' : ''}`}>
    <span>{label}</span>
    {multiline
      ? <textarea rows={2} value={value} maxLength={2_000} onChange={(event) => onChange(event.target.value)} />
      : <input value={value} inputMode={inputMode} maxLength={80} onChange={(event) => onChange(event.target.value)} />}
  </label>;
}

function ExerciseEditor({ exercise, onChange, onMove, onRemove, onReplace }: {
  exercise: ExerciseDraft;
  onChange: (patch: Partial<ExerciseDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onReplace: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reps = exercise.mode === 'time' ? exercise.target : `${exercise.repMin || '—'}${exercise.repMax && exercise.repMax !== exercise.repMin ? `–${exercise.repMax}` : ''}`;
  return <article className="programme-exercise">
    <div className="programme-exercise-head">
      <button type="button" className="programme-exercise-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>{exercise.name || 'Exercise'}</span>
        <small>{exercise.sets || '—'} × {reps}{exercise.per ? ` / ${exercise.per}` : ''}</small>
      </button>
      <span className="programme-actions">
        <RoundButton className="round-muted" aria-label={`Move ${exercise.name} up`} onClick={() => onMove(-1)}><ChevronUp size={16} /></RoundButton>
        <RoundButton className="round-muted" aria-label={`Move ${exercise.name} down`} onClick={() => onMove(1)}><ChevronDown size={16} /></RoundButton>
      </span>
    </div>
    {open && <div className="programme-grid">
      <Field wide label="Exercise" value={exercise.name} onChange={(name) => onChange({ name })} />
      <ChipGroup className="span-2" label="How to log" value={exercise.mode} options={[...modes]} onChange={(mode) => onChange({ mode: mode as ExerciseDraft['mode'] })} />
      <Field label="Warm-up sets" inputMode="numeric" value={exercise.warmupSets} onChange={(warmupSets) => onChange({ warmupSets })} />
      <Field label="Working sets" inputMode="numeric" value={exercise.sets} onChange={(sets) => onChange({ sets })} />
      {exercise.mode === 'time'
        ? <Field wide label="Time" value={exercise.target} onChange={(target) => onChange({ target })} />
        : <>
          <Field label="Reps from" inputMode="numeric" value={exercise.repMin} onChange={(repMin) => onChange({ repMin })} />
          <Field label="Reps to" inputMode="numeric" value={exercise.repMax} onChange={(repMax) => onChange({ repMax })} />
          <label className="input-group"><span>Each side</span>
            <select value={exercise.per} onChange={(event) => onChange({ per: event.target.value as ExerciseDraft['per'] })}>
              <option value="">Together</option>
              <option value="leg">Per leg</option>
              <option value="side">Per side</option>
            </select>
          </label>
        </>}
      {exercise.mode !== 'bodyweight' && <Field label="Weight (kg)" inputMode="decimal" value={exercise.weight} onChange={(weight) => onChange({ weight })} />}
      <Field label="Rest" value={exercise.rest} onChange={(rest) => onChange({ rest })} />
      <Field label="Rest note" value={exercise.restNote} onChange={(restNote) => onChange({ restNote })} />
      <Field label="RIR" inputMode="numeric" value={exercise.rir} onChange={(rir) => onChange({ rir })} />
      <Field label="RPE" inputMode="numeric" value={exercise.rpe} onChange={(rpe) => onChange({ rpe })} />
      <Field wide label="Equipment options" value={exercise.variants} onChange={(variants) => onChange({ variants })} />
      <Field wide multiline label="Technique" value={exercise.cue} onChange={(cue) => onChange({ cue })} />
      <Field wide multiline label="Coaching note" value={exercise.coachNote} onChange={(coachNote) => onChange({ coachNote })} />
      <Field wide multiline label="Progression" value={exercise.progression} onChange={(progression) => onChange({ progression })} />
      <span className="programme-actions span-2">
        <Pill onClick={onReplace}>Replace</Pill>
        <Pill onClick={onRemove}>Remove</Pill>
      </span>
    </div>}
  </article>;
}

export function ProgrammeEditor({ today, data, programme, onSave }: {
  today: string; data: TrainingData; programme: ProgrammeSnapshot;
  onSave: (body: unknown) => Promise<void>;
}) {
  const source = currentContent(data, programme, today);
  const [draft, setDraft] = useState(() => draftFrom(source, today));
  const [seen, setSeen] = useState(programme.revision);
  const [view, setView] = useState<View>('edit');
  const [openDay, setOpenDay] = useState<string>();
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

  function updateDay(index: number, patch: Partial<DayDraft>) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day, dayIndex) => {
        if (dayIndex !== index) return day;
        const next = { ...day, ...patch };
        if (next.type === 'strength' && !next.exercises.length) next.exercises = [blankExercise([])];
        return next;
      }),
    }));
  }

  function updateExercise(dayIndex: number, exerciseIndex: number, patch: Partial<ExerciseDraft>) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day, index) => index === dayIndex ? {
        ...day, exercises: day.exercises.map((exercise, position) => position === exerciseIndex ? { ...exercise, ...patch } : exercise),
      } : day),
    }));
  }

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
  const openIndex = draft.days.findIndex((day) => day.id === openDay);
  const open = openIndex >= 0 ? draft.days[openIndex] : undefined;
  return <section className="screen screen-nav screen-programme">
    <HeadingSentence className="heading-small" lead="Programme." follow="Shared with Brenna." />
    <ChipGroup label="Programme section" value={view} onChange={(value) => setView(value as View)} options={[
      { value: 'edit', label: 'Edit' },
      { value: 'history', label: 'History' },
      { value: 'messages', label: `Notes${programme.state.messages.length ? ` ${programme.state.messages.length}` : ''}` },
    ]} />
    {newer && <p className="notice">A newer programme was saved on another device. Your unsaved edits are still here.</p>}
    {view === 'history' && <History programme={programme} onEdit={(content) => { setDraft(draftFrom(content, today)); setView('edit'); }} />}
    {view === 'messages' && <Messages programme={programme} author={author} message={message} busy={busy}
      onAuthor={(value) => { setAuthor(value); try { localStorage.setItem('rise-programme-author', value); } catch { /* The choice still applies to this note. */ } }}
      onMessage={setMessage} onSend={() => void send()} />}
    {view === 'edit' && <>
      <div className="programme-grid">
        <label className="input-group"><span>Applies from</span>
          <input type="date" value={draft.effectiveFrom} onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })} />
        </label>
        <label className="programme-check"><input type="checkbox" checked={draft.deload} onChange={(event) => setDraft({ ...draft, deload: event.target.checked })} /><span>Deload week</span></label>
        <Field label="Steps from" inputMode="numeric" value={draft.stepsMin} onChange={(stepsMin) => setDraft({ ...draft, stepsMin })} />
        <Field label="Steps to" inputMode="numeric" value={draft.stepsMax} onChange={(stepsMax) => setDraft({ ...draft, stepsMax })} />
        <Field wide multiline label="Week note" value={draft.weekNote} onChange={(weekNote) => setDraft({ ...draft, weekNote })} />
      </div>
      <div className="programme-split">
        <div className="programme-days">
          {draft.days.map((day, index) => <article key={day.id} className="programme-day">
            <button type="button" className="programme-day-toggle" style={{ order: index * 2 }} aria-expanded={openDay === day.id} onClick={() => setOpenDay(openDay === day.id ? undefined : day.id)}>
              <span>Day {index + 1}</span>
              <strong>{day.title || 'Untitled'}</strong>
              <small>{day.type === 'strength' ? `${day.exercises.length} exercises` : day.type === 'cardio' ? 'Cardio' : 'Rest'}</small>
            </button>
          </article>)}
        </div>
        <div className="programme-stage" style={{ order: openIndex >= 0 ? openIndex * 2 + 1 : draft.days.length * 2 }}>
          {open ? <div className="programme-day-body">
            <Field wide label="Day name" value={open.title} onChange={(title) => updateDay(openIndex, { title })} />
            <ChipGroup label={`Day ${openIndex + 1} type`} value={open.type} options={[...dayKinds]} onChange={(type) => updateDay(openIndex, { type: type as DayDraft['type'] })} />
            <span className="programme-actions">
              <Pill onClick={() => setDraft((current) => ({ ...current, days: moveItem(current.days, openIndex, -1) }))}>Move up</Pill>
              <Pill onClick={() => setDraft((current) => ({ ...current, days: moveItem(current.days, openIndex, 1) }))}>Move down</Pill>
              <Pill onClick={() => setDraft((current) => ({ ...current, days: duplicateDay(current.days, openIndex) }))} disabled={openIndex === draft.days.length - 1}>Copy to next day</Pill>
            </span>
            {open.type === 'strength' && <>
              {open.exercises.map((exercise, exerciseIndex) => <ExerciseEditor key={exercise.id} exercise={exercise}
                onChange={(patch) => updateExercise(openIndex, exerciseIndex, patch)}
                onMove={(direction) => updateDay(openIndex, { exercises: moveItem(open.exercises, exerciseIndex, direction) })}
                onRemove={() => updateDay(openIndex, { exercises: open.exercises.filter((_, position) => position !== exerciseIndex) })}
                onReplace={() => updateDay(openIndex, { exercises: open.exercises.map((item, position) => position === exerciseIndex ? { ...blankExercise(open.exercises.map((entry) => entry.id)), sets: item.sets, warmupSets: item.warmupSets, rest: item.rest, mode: item.mode, repMin: item.repMin, repMax: item.repMax, per: item.per } : item) })} />)}
              <Pill onClick={() => updateDay(openIndex, { exercises: [...open.exercises, blankExercise(open.exercises.map((exercise) => exercise.id))] })}>Add exercise</Pill>
            </>}
            {open.type === 'cardio' && <>
              <Field wide label="Cardio note" value={open.note} onChange={(note) => updateDay(openIndex, { note })} />
              <Field wide multiline label="Options, one per line" value={open.options} onChange={(options) => updateDay(openIndex, { options })} />
            </>}
            {open.type === 'active-rest' && <>
              <Field wide label="Rest note" value={open.note} onChange={(note) => updateDay(openIndex, { note })} />
              <Field wide multiline label="Guidance, one per line" value={open.guidance} onChange={(guidance) => updateDay(openIndex, { guidance })} />
            </>}
          </div> : <p className="programme-day-empty">Choose a day to edit.</p>}
        </div>
      </div>
      {!parsed.ok && <p className="notice" role="alert">{parsed.error}</p>}
      {!!changes.length && <details className="programme-review" open={changes.length <= 8}>
        <summary>Review {changes.length} {changes.length === 1 ? 'change' : 'changes'}</summary>
        <ul>{changes.map((change) => <li key={change}>{change}</li>)}</ul>
      </details>}
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="screen-actions">
        <PrimaryButton onClick={() => void save()} disabled={busy || !parsed.ok || !changes.length}>{busy ? 'Saving…' : 'Save programme'}</PrimaryButton>
        <p className="fine">Applies from {draft.effectiveFrom ? displayDate(draft.effectiveFrom) : 'the date above'}. Logged workouts keep the plan and the numbers they were saved with.</p>
      </div>
    </>}
    {view !== 'edit' && error && <p className="notice" role="alert">{error}</p>}
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
