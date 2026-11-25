'use client';

import { ChartNoAxesCombined, Check, ChevronLeft, Play, Plus, StickyNote, Timer } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { compactSet, displayDate, matchingSets, pastSessions, restDisplay } from '@/lib/insights';
import { extraIndex, extraKindFor, extraKinds, extraLabel, type ExtraKind, type SetLog, type TrainingData } from '@/lib/model';
import { canonicalVariant, exerciseOptions, prescribedReps, type Exercise } from '@/lib/programme';
import { PrimaryButton, RoundButton } from './ui';

const plateSizes = [25, 20, 15, 10, 5, 2.5, 1.25];
const barKg = 20;
export const warmupIndex = extraIndex.warmup;
const extraMark: Record<ExtraKind, string> = { warmup: 'W', upper: 'U', lower: 'L' };
const deleteWidth = 84;

export const equipmentLabel = (exercise: Exercise, variant: string) =>
  canonicalVariant(exercise.id, variant) || exerciseOptions(exercise.id)[0] || '';
const isWeighted = (exercise: Exercise) => exercise.metric !== 'bodyweight' && exercise.metric !== 'seconds';
export const usesBarbell = (exercise: Exercise, variant: string) =>
  isWeighted(exercise) && /\bbarbell\b/i.test(equipmentLabel(exercise, variant) || exercise.name);

export type LogSetRow = {
  index: number;
  exercise: Exercise;
  variant: string;
  logged?: SetLog;
  last?: SetLog;
  fallback?: SetLog;
};

type Draft = { count: string; weight: string };
type Panel = 'history' | 'plates';
const asText = (value: number | null | undefined) => value == null ? '' : String(value);

/** The first edit into a prefilled weight replaces it. Later keystrokes append. */
export function overrideWeight(current: string, entered: string) {
  if (entered.length <= current.length) return entered;
  let prefix = 0;
  while (prefix < current.length && current[prefix] === entered[prefix]) prefix++;
  let currentEnd = current.length;
  let enteredEnd = entered.length;
  while (currentEnd > prefix && enteredEnd > prefix && current[currentEnd - 1] === entered[enteredEnd - 1]) {
    currentEnd--;
    enteredEnd--;
  }
  return currentEnd === prefix ? entered.slice(prefix, enteredEnd) : entered;
}

const rowKey = ({ index, exercise, variant }: LogSetRow) => JSON.stringify([index, exercise.id, variant]);
const weightLabel = (exercise: Exercise) => exercise.coachWeight ?? (exercise.coachKg != null
  ? `${exercise.coachKg} kg` : exercise.metric === 'bodyweight' ? 'bodyweight' : 'no weight set');

function defaultDraft({ index, exercise, logged, fallback }: LogSetRow): Draft {
  const count = exercise.metric === 'seconds'
    ? logged ? logged.seconds : fallback?.seconds
    : logged ? logged.reps : prescribedReps(exercise) ?? fallback?.reps;
  const weight = logged ? logged.weight : extraKindFor(index) === 'warmup' ? barKg : fallback?.weight ?? exercise.coachKg;
  return { count: asText(count), weight: asText(weight) };
}

function Trend({ label, value, previous, unit = '' }: { label: string; value: number | null; previous?: number | null; unit?: string }) {
  const change = value == null || previous == null ? null : Math.round((value - previous) * 100) / 100;
  return <span>{label} <b data-up={change != null && change > 0}>{change == null ? '—' : change === 0 ? 'same'
    : `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}${unit}`}</b></span>;
}

function PlateCalculator({ name, weight }: { name: string; weight: number | null }) {
  let remaining = weight == null ? 0 : Math.max(0, Math.round((weight - barKg) * 50));
  const plates = plateSizes.flatMap((plate) => {
    const cents = plate * 100;
    const quantity = Math.floor(remaining / cents);
    remaining -= quantity * cents;
    return Array<number>(quantity).fill(plate);
  });
  const summary = weight == null ? 'Enter a weight to calculate plates.'
    : weight < barKg ? 'Less than an empty bar'
    : weight === barKg ? 'Empty bar, no plates'
    : `Each side: ${plates.length ? plates.map((plate) => `${plate} kg`).join(' + ') : 'no matching plates'}${remaining ? ` (+${remaining / 100} kg unmatched)` : ''}`;

  return <section className="logger-card plate-card" aria-label="Plate calculator">
    <span>{`Plates for ${name.toLowerCase()} · ${weight == null ? '' : `${weight} kg on `}a ${barKg} kg bar`}</span>
    <strong>{summary}</strong>
    <div className="plate-bars" aria-hidden="true">
      {plates.map((plate, index) => <i key={index} style={{
        width: plate >= 10 ? 9 : 6,
        height: Math.max(16, Math.min(40, 14 + plate * 1.1)),
        background: plate >= 15 ? 'var(--color-ink)' : plate >= 5 ? 'var(--color-accent)' : 'var(--color-peach)',
      }} />)}
    </div>
  </section>;
}

function SwipeDelete({ enabled, label, onDelete, onSwiped, children, current, done, weighted }: {
  enabled: boolean; label: string; onDelete: () => void; onSwiped: () => void; children: ReactNode;
  current: boolean; done: boolean; weighted: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ x: 0, y: 0, offset: 0, tracking: false, horizontal: false });

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, offset, tracking: true, horizontal: false };
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state.tracking) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.horizontal) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        state.tracking = false;
        return;
      }
      state.horizontal = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setOffset(Math.max(-(deleteWidth + 56), Math.min(0, state.offset + dx)));
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state.tracking && !state.horizontal) return;
    const dx = event.clientX - state.x;
    const settled = Math.max(-(deleteWidth + 56), Math.min(0, state.offset + dx));
    const swiped = state.horizontal;
    state.tracking = false;
    state.horizontal = false;
    setDragging(false);
    if (swiped) onSwiped();
    if (settled <= -(deleteWidth + 24)) {
      setOffset(0);
      onDelete();
      return;
    }
    setOffset(settled <= -deleteWidth / 2 ? -deleteWidth : 0);
  }

  return <div className="logger-swipe" role="listitem" data-open={offset < 0 || undefined}>
    {enabled && <button type="button" className="logger-swipe-delete" aria-label={label} tabIndex={offset < 0 ? 0 : -1}
      onFocus={() => setOffset(-deleteWidth)} onClick={onDelete}>Delete</button>}
    <div className="logger-set" data-weighted={weighted} data-current={current} data-done={done} data-dragging={dragging || undefined}
      style={offset ? { transform: `translateX(${offset}px)` } : undefined}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      {children}
    </div>
  </div>;
}

export function LogSet({ rows, active, exerciseNumber, exerciseCount, workSetCount, date, data, note, close, choose, cues, rest,
  nextExercise, finishing, review, complete, save, remove, add, drop, saveNote }: {
  rows: LogSetRow[]; active: LogSetRow; exerciseNumber: number; exerciseCount: number; workSetCount: number; date: string; data: TrainingData;
  note: string;
  close: () => void; choose: (index: number) => void; cues: () => void; rest?: () => void;
  nextExercise?: string; finishing: boolean; review?: () => void;
  complete: () => Promise<void>; save: (set: SetLog) => Promise<void>; remove: () => Promise<void>;
  add: (kind?: ExtraKind) => Promise<void>; drop: (target: { index?: number; kind?: ExtraKind }) => Promise<void>;
  saveNote: (text: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [panel, setPanel] = useState<Panel>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState('');
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const replaceWeight = useRef(new Set<string>());
  const weightFromTouch = useRef(false);
  const skipClick = useRef(false);
  const savedNote = note.trim();
  const locked = busy || noteBusy;
  const { exercise, variant, index, logged, last } = active;
  const activeKey = rowKey(active);
  const draftFor = (row: LogSetRow) => drafts[rowKey(row)] ?? defaultDraft(row);
  const draft = draftFor(active);
  const extra = extraKindFor(index);
  const timed = exercise.metric === 'seconds';
  const weighted = isWeighted(exercise);
  const countLabel = timed ? 'Seconds' : exercise.perSide ? `Reps per ${exercise.perSide}` : 'Reps';
  const name = extra ? extraLabel[extra] : `Set ${index + 1}`;
  const shownExtras = new Set(rows.flatMap((row) => {
    const rowKind = extraKindFor(row.index);
    return rowKind ? [rowKind] : [];
  }));
  const barbell = usesBarbell(exercise, variant);
  const history = panel === 'history';
  const plates = barbell && panel === 'plates';
  const sessions = history ? pastSessions(data, date).flatMap((entry) => {
    const sets = matchingSets(entry, exercise.id, variant);
    return sets.length ? [{ entry, sets }] : [];
  }) : [];
  useEffect(() => {
    if (noteOpen) noteInput.current?.focus();
  }, [noteOpen]);

  const weightText = draft.weight.trim();
  const weight = /^[\d]*[.,]?\d+$|^\d+[.,]$/.test(weightText) ? Number(weightText.replace(',', '.')) : null;
  const kg = weight != null && weight <= 5_000 ? weight : null;
  const count = /^\d+$/.test(draft.count.trim()) ? Number(draft.count) : null;

  function select(position: number) {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    if (locked || (!finishing && index === position)) return;
    choose(position);
    setError('');
  }

  function noteSwipe() {
    skipClick.current = true;
    window.setTimeout(() => { skipClick.current = false; }, 400);
  }

  function update(row: LogSetRow, field: keyof Draft, value: string) {
    const key = rowKey(row);
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? defaultDraft(row)), [field]: value } }));
  }

  function armWeight(row: LogSetRow, input: HTMLInputElement) {
    if (locked) return;
    select(row.index);
    if (finishing) return;
    replaceWeight.current.add(rowKey(row));
    const selectAll = () => {
      if (document.activeElement === input) input.setSelectionRange(0, input.value.length);
    };
    selectAll();
    window.setTimeout(selectAll, 0);
  }

  function changeWeight(row: LogSetRow, event: ChangeEvent<HTMLInputElement>) {
    const key = rowKey(row);
    const entered = event.target.value;
    const value = replaceWeight.current.delete(key) ? overrideWeight(draftFor(row).weight, entered) : entered;
    update(row, 'weight', value);
  }

  function editWeight(row: LogSetRow, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' || event.key === 'Delete' || event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
      replaceWeight.current.delete(rowKey(row));
    }
  }

  async function perform(action: () => Promise<void>, drafts: 'active' | 'all' | 'keep' = 'active') {
    if (locked) return;
    setBusy(true);
    setError('');
    try {
      await action();
      if (drafts === 'all') setDrafts({});
      else if (drafts === 'active') setDrafts((current) => {
        const next = { ...current };
        delete next[activeKey];
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save. Try again.');
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (finishing) {
      void perform(() => complete());
      return;
    }
    if (weighted && weightText && kg == null) {
      setError('Enter a weight from 0 to 5,000 kg.');
      return;
    }
    if (count == null || count < 1 || count > (timed ? 86_400 : 1_000)) {
      setError(timed ? 'Enter the whole seconds you held, from 1 to 86,400.' : 'Enter the whole reps you completed, from 1 to 1,000.');
      return;
    }
    void perform(() => save({ exerciseId: exercise.id, variant, weight: weighted ? kg : null,
      reps: timed ? null : count, seconds: timed ? count : null, effort: logged?.effort ?? null }));
  }

  function openNote() {
    setNoteDraft(savedNote);
    setNoteError('');
    setNoteOpen(true);
  }

  const noteAction = noteBusy ? 'Saving…' : noteDraft.trim() || !savedNote ? 'Save to log' : 'Remove from log';

  async function commitNote() {
    if (locked) return;
    const text = noteDraft.trim();
    if (text === savedNote) {
      setNoteOpen(false);
      setNoteError('');
      return;
    }
    setNoteBusy(true);
    setNoteError('');
    try {
      await saveNote(text);
      setNoteOpen(false);
    } catch (reason) {
      setNoteError(reason instanceof Error ? reason.message : 'Could not save. Try again.');
    } finally { setNoteBusy(false); }
  }

  return <form className="screen screen-logger" aria-labelledby="log-heading" onSubmit={submit}>
    <div className="screen-toolbar">
      <RoundButton className="logger-close" aria-label="Back to exercises" onClick={close} disabled={locked}><ChevronLeft size={20} aria-hidden="true" /></RoundButton>
      <span className="logger-position">Exercise {exerciseNumber} of {exerciseCount}</span>
    </div>
    <div className="logger-heading">
      <h1 id="log-heading">{exercise.name}</h1>
      {equipmentLabel(exercise, variant) && <span className="logger-pill logger-equipment">{equipmentLabel(exercise, variant)}</span>}
    </div>
    <div className="logger-content">
      <div className="logger-tools" aria-label="Exercise tools">
        {exercise.rest > 0 && rest && <button type="button" className="logger-pill" onClick={rest} disabled={locked}>
          <Timer size={16} strokeWidth={1.8} aria-hidden="true" />{restDisplay(exercise.rest)} rest
        </button>}
        <button type="button" className="logger-pill" aria-pressed={history} onClick={() => setPanel(history ? undefined : 'history')} disabled={locked}>
          <ChartNoAxesCombined size={16} strokeWidth={1.8} aria-hidden="true" />History
        </button>
        {barbell && <button type="button" className="logger-pill" aria-pressed={plates} onClick={() => setPanel(plates ? undefined : 'plates')} disabled={locked}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 12h20M6 7v10M9 5v14M15 5v14M18 7v10" />
          </svg>Plates
        </button>}
        <button type="button" className="logger-pill" onClick={cues} disabled={locked}><Play size={16} strokeWidth={1.8} aria-hidden="true" />Cues</button>
      </div>
      {plates ? <PlateCalculator name={name} weight={kg} /> : <section className="logger-card logger-target" aria-label="Brenna’s target">
        <strong>Brenna’s target · {workSetCount} × {exercise.target.replace(/ reps\b/, '')} · {weightLabel(exercise)}</strong>
        {exercise.cue && <p>{exercise.cue}</p>}
        <div className="logger-trends">
          <span>vs last time</span>
          <Trend label={timed ? 'Seconds' : 'Reps'} value={count} previous={timed ? last?.seconds : last?.reps} />
          {weighted && <Trend label="Weight" value={kg} previous={last?.weight} unit=" kg" />}
        </div>
      </section>}
      <div className="logger-columns" data-weighted={weighted} aria-hidden="true">
        <span /><span>{countLabel}</span>{weighted && <span>Weight (kg)</span>}
      </div>
      {history ? <div className="logger-history" aria-label={`Past ${exercise.name} sessions`} role="list">
        {sessions.length ? sessions.map(({ entry, sets }, position) => <div role="listitem" key={`${entry.date}:${entry.planId}`}>
          <span>{displayDate(entry.date, { weekday: 'short', day: 'numeric', month: 'short' })}{position === 0 ? ' · last session' : ''}</span>
          <strong>{sets.map(compactSet).join(' · ')}</strong>
        </div>) : <div role="listitem"><span>No past sets for this exercise yet.</span></div>}
      </div> : <>
        <div className="logger-sets" role="list" aria-label="Sets">
          {rows.map((row) => {
            const current = !finishing && row.index === index;
            const rowExtra = extraKindFor(row.index);
            const rowName = rowExtra ? extraLabel[rowExtra] : `Set ${row.index + 1}`;
            const setDraft = draftFor(row);
            const previousCount = timed ? row.last?.seconds : row.last?.reps;
            const deletable = Boolean(rowExtra) || workSetCount > 1;
            return <SwipeDelete key={row.index} enabled={deletable && !locked} label={`Delete ${rowName}`}
              current={current} done={Boolean(row.logged)} weighted={weighted} onSwiped={noteSwipe}
              onDelete={() => void perform(() => drop(rowExtra ? { kind: rowExtra } : { index: row.index }), 'all')}>
              <button type="button" className="logger-set-mark" onClick={() => select(row.index)}
                aria-current={current ? 'step' : undefined} aria-label={`${finishing ? 'Edit ' : ''}${rowName}${row.logged ? ', logged' : ''}`} disabled={locked}>
                {row.logged ? <Check size={14} strokeWidth={2.6} aria-hidden="true" /> : rowExtra ? extraMark[rowExtra] : row.index + 1}
              </button>
              <label className="logger-value">
                <input aria-label={`${rowName} ${countLabel.toLowerCase()}`} type="text" inputMode="numeric" maxLength={5}
                  value={setDraft.count} readOnly={finishing} tabIndex={finishing ? -1 : undefined}
                  onClick={() => select(row.index)} onFocus={() => { if (!finishing) select(row.index); }}
                  onChange={(event) => update(row, 'count', event.target.value)} disabled={locked} />
                <span>{rowExtra ? 'optional' : `last ${previousCount ?? '—'}`}</span>
              </label>
              {weighted && <label className="logger-value">
                <input aria-label={`${rowName} weight in kg`} type="text" inputMode="decimal" maxLength={12}
                  value={setDraft.weight} readOnly={finishing} tabIndex={finishing ? -1 : undefined}
                  onFocus={(event) => armWeight(row, event.currentTarget)}
                  onTouchEnd={(event) => { weightFromTouch.current = true; armWeight(row, event.currentTarget); }}
                  onMouseUp={(event) => {
                    if (weightFromTouch.current) weightFromTouch.current = false;
                    else event.preventDefault();
                    armWeight(row, event.currentTarget);
                  }}
                  onKeyDown={(event) => editWeight(row, event)}
                  onChange={(event) => changeWeight(row, event)} disabled={locked} />
                <span>{rowExtra === 'warmup' ? 'bar' : rowExtra ? 'optional' : `last ${row.last?.weight ?? '—'}`}</span>
              </label>}
            </SwipeDelete>;
          })}
        </div>
        <div className="logger-add">
          {workSetCount < 20 && <button type="button" className="logger-pill" aria-label="Add a set" onClick={() => void perform(() => add(), 'keep')} disabled={locked}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" />Set
          </button>}
          {extraKinds.filter((item) => !shownExtras.has(item)).map((item) => <button type="button" key={item} className="logger-pill"
            aria-label={`Add ${extraLabel[item].toLowerCase()}`} onClick={() => void perform(() => add(item), 'keep')} disabled={locked}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" />{extraLabel[item]}
          </button>)}
          {(workSetCount > 1 || shownExtras.size > 0) && <p className="logger-add-hint">Swipe left to delete a set.</p>}
        </div>
      </>}
    </div>
    <div className="logger-footer">
      <section className="logger-note" aria-label={`${exercise.name} notes for Brenna`}>
        {noteOpen ? <>
          <textarea ref={noteInput} className="logger-note-input" rows={3} maxLength={2_000}
            aria-label={`${exercise.name} notes for Brenna`} placeholder="Optional. This is saved with the exercise and sent in your log."
            value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} disabled={locked} />
          <div className="logger-note-actions">
            <button type="button" className="logger-pill" onClick={() => void commitNote()} disabled={locked}>{noteAction}</button>
            <button type="button" className="logger-note-cancel" onClick={() => { setNoteOpen(false); setNoteError(''); }} disabled={locked}>Cancel</button>
          </div>
        </> : savedNote ? <>
          <p className="logger-note-saved">{savedNote}</p>
          <button type="button" className="logger-note-open" onClick={openNote} disabled={locked}>Edit note</button>
        </> : <button type="button" className="logger-note-open" onClick={openNote} disabled={locked}>
          <StickyNote size={16} strokeWidth={1.8} aria-hidden="true" />Note for Brenna
        </button>}
        {noteError && <p className="notice" role="alert">{noteError}</p>}
      </section>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="logger-status">
        <strong role="status">{finishing ? 'All working sets logged' : extra ? name : `${name} of ${workSetCount}`}</strong>
        <span>Up next · {nextExercise ?? 'Submit record'}</span>
      </div>
      <PrimaryButton type="submit" disabled={locked}>
        {busy ? 'Saving…' : finishing ? 'Done' : logged ? `Update ${name.toLowerCase()}` : `Log ${name.toLowerCase()}`}
      </PrimaryButton>
      {!finishing && logged && <button type="button" className="logger-remove" onClick={() => void perform(remove)} disabled={locked}>Remove {name.toLowerCase()}</button>}
      {!finishing && review && <button type="button" className="logger-remove" onClick={review} disabled={locked}>Back to exercise summary</button>}
    </div>
  </form>;
}
