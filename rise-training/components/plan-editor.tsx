'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  blankExercise, duplicateDay, moveItem, nextId,
  type DayDraft, type ExerciseDraft, type ProgrammeHabits,
} from '@/lib/prescription';
import { BottomSheet } from './ui';

export type ProgrammeDraft = {
  effectiveFrom: string;
  deload: boolean;
  weekNote: string;
  stepsMin: string;
  stepsMax: string;
  days: DayDraft[];
  habits: ProgrammeHabits;
};

const dayTypes = [
  { value: 'strength', label: 'Strength' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'active-rest', label: 'Active rest' },
] as const;
const modes = [
  { value: 'reps', label: 'Reps' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'time', label: 'Time' },
] as const;
const efforts = [
  { value: 'none', label: 'None' },
  { value: 'rir', label: 'RIR' },
  { value: 'rpe', label: 'RPE' },
] as const;

function reorder<T>(items: readonly T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function variantList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function exerciseWork(exercise: ExerciseDraft) {
  const sets = exercise.sets.trim() || '—';
  if (exercise.mode === 'time') return `${sets} × ${exercise.target.trim() || '—'}`;
  const from = exercise.repMin.trim();
  const to = exercise.repMax.trim();
  const reps = from && to && from !== to ? `${from}–${to}` : (from || to || '—');
  const side = exercise.per === 'leg' ? ' per leg' : exercise.per === 'side' ? ' per side' : '';
  return `${sets} × ${reps}${side}`;
}

function exerciseSummary(exercise: ExerciseDraft) {
  return `${exerciseWork(exercise)} · rest ${exercise.rest.trim() || '—'}`;
}

function weightPhrase(exercise: ExerciseDraft) {
  if (exercise.mode === 'bodyweight') return 'bodyweight';
  return exercise.weight.trim() ? `${exercise.weight.trim()} kg` : 'no weight set';
}

function jessieDetail(exercise: ExerciseDraft) {
  return `${exerciseSummary(exercise)} · ${weightPhrase(exercise)}`;
}

function exerciseChip(exercise: ExerciseDraft) {
  const count = variantList(exercise.variants).length;
  if (count) return `${count} ${count === 1 ? 'option' : 'options'}`;
  if (exercise.mode === 'time') return 'Time';
  if (exercise.mode === 'bodyweight') return 'Bodyweight';
  return '';
}

function dayTag(day: DayDraft) {
  if (day.type === 'cardio') return 'Cardio';
  if (day.type === 'active-rest') return 'Rest';
  return `Strength · ${day.exercises.length}`;
}

function effortMode(exercise: ExerciseDraft) {
  if (exercise.rir.trim()) return 'rir';
  if (exercise.rpe.trim()) return 'rpe';
  return 'none';
}

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 959px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return narrow;
}

function Grip() {
  return <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" />
    <circle cx="3" cy="8" r="1.4" /><circle cx="9" cy="8" r="1.4" />
    <circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" />
  </svg>;
}

function Segmented({ label, value, options, onChange, fit }: {
  label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void; fit?: boolean;
}) {
  const name = useId();
  return <div className={fit ? 'segmented segmented-fit' : 'segmented'} role="radiogroup" aria-label={label}>
    {options.map((option) => <label key={option.value}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span>{option.label}</span>
    </label>)}
  </div>;
}

function Menu({ label, items }: {
  label: string;
  items: { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean; stay?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return <div className="admin-menu" ref={ref}>
    <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((value) => !value)}>⋯</button>
    {open && <div role="menu" className="admin-menu-list">
      {items.map((item) => <button key={item.label} type="button" role="menuitem" className={item.danger ? 'is-danger' : undefined} disabled={item.disabled}
        onClick={() => { if (!item.stay) setOpen(false); item.onSelect(); }}>{item.label}</button>)}
    </div>}
  </div>;
}

function Quiet({ label, value, onChange, inputMode, placeholder, wide, maxLength = 80 }: {
  label: string; value: string; onChange: (value: string) => void; inputMode?: 'numeric' | 'decimal'; placeholder?: string; wide?: boolean; maxLength?: number;
}) {
  return <label className={wide ? 'admin-quiet admin-quiet-wide' : 'admin-quiet'}>
    <span>{label}</span>
    <input value={value} inputMode={inputMode} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

export function PlanEditor({ draft, onChange, changes, error, busy, canSave, saveLabel, onSave, onDiscard, onOverlay }: {
  draft: ProgrammeDraft;
  onChange: Dispatch<SetStateAction<ProgrammeDraft>>;
  changes: string[];
  error: string;
  busy: boolean;
  canSave: boolean;
  saveLabel: string;
  onSave: () => void;
  onDiscard: () => void;
  onOverlay: (open: boolean) => void;
}) {
  const narrow = useNarrow();
  const [dayId, setDayId] = useState(draft.days[0]?.id ?? '');
  const [exerciseId, setExerciseId] = useState(draft.days[0]?.exercises[0]?.id ?? '');
  const [sheet, setSheet] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [limitNote, setLimitNote] = useState('');
  const drag = useRef<{ list: 'days' | 'exercises'; index: number } | null>(null);
  const dayIndex = Math.max(0, draft.days.findIndex((day) => day.id === dayId));
  const day = draft.days[dayIndex];
  const selected = day?.exercises.find((exercise) => exercise.id === exerciseId) ?? day?.exercises[0];
  const showNote = noteOpen || Boolean(draft.weekNote.trim());
  const showSheet = narrow && sheet && Boolean(selected);

  useEffect(() => { onOverlay(showSheet); return () => onOverlay(false); }, [showSheet, onOverlay]);
  useEffect(() => { if (!narrow) setSheet(false); }, [narrow]);

  function patchDay(index: number, patch: Partial<DayDraft>) {
    onChange((current) => ({
      ...current,
      days: current.days.map((item, dayIndex) => dayIndex === index ? { ...item, ...patch } : item),
    }));
  }

  function patchExercise(patch: Partial<ExerciseDraft>) {
    if (!selected) return;
    onChange((current) => ({
      ...current,
      days: current.days.map((item) => item.id === day.id ? {
        ...item,
        exercises: item.exercises.map((exercise) => exercise.id === selected.id ? { ...exercise, ...patch } : exercise),
      } : item),
    }));
  }

  function pickDay(id: string) {
    setDayId(id);
    const next = draft.days.find((item) => item.id === id);
    setExerciseId(next?.exercises[0]?.id ?? '');
    setSheet(false);
  }

  const form = selected && day?.type === 'strength' ? <ExerciseForm key={selected.id} exercise={selected} index={day.exercises.findIndex((item) => item.id === selected.id)} total={day.exercises.length} compact={showSheet}
    saveLabel={saveLabel} busy={busy} canSave={canSave} dirty={changes.length > 0 || Boolean(error)} onSave={onSave} onDiscard={onDiscard}
    onChange={patchExercise}
    onMove={(direction) => {
      const index = day.exercises.findIndex((item) => item.id === selected.id);
      patchDay(dayIndex, { exercises: moveItem(day.exercises, index, direction) });
    }}
    onDuplicate={() => {
      const index = day.exercises.findIndex((item) => item.id === selected.id);
      const copy = { ...selected, id: nextId(selected.name || 'exercise', day.exercises.map((item) => item.id)) };
      const exercises = [...day.exercises.slice(0, index + 1), copy, ...day.exercises.slice(index + 1)];
      patchDay(dayIndex, { exercises });
      setExerciseId(copy.id);
    }}
    onReplace={() => {
      const index = day.exercises.findIndex((item) => item.id === selected.id);
      const fresh = {
        ...blankExercise(day.exercises.map((item) => item.id)),
        sets: selected.sets, warmupSets: selected.warmupSets, rest: selected.rest,
        mode: selected.mode, repMin: selected.repMin, repMax: selected.repMax, per: selected.per,
      };
      patchDay(dayIndex, { exercises: day.exercises.map((item, position) => position === index ? fresh : item) });
      setExerciseId(fresh.id);
    }}
    onRemove={() => {
      const exercises = day.exercises.filter((item) => item.id !== selected.id);
      patchDay(dayIndex, { exercises });
      setExerciseId(exercises[0]?.id ?? '');
      setSheet(false);
    }} /> : null;

  return <div className="plan-editor">
    <section className="admin-settings" aria-label="Week settings">
      <label className="admin-card">
        <span>Applies from</span>
        <input type="date" value={draft.effectiveFrom} onChange={(event) => onChange({ ...draft, effectiveFrom: event.target.value })} />
      </label>
      <div className="admin-card admin-deload">
        <span><span>Deload week</span><strong>{draft.deload ? 'On this week' : 'Off'}</strong></span>
        <button type="button" className="admin-switch" role="switch" aria-checked={draft.deload} aria-label="Deload week"
          onClick={() => onChange({ ...draft, deload: !draft.deload })}><span /></button>
      </div>
      <div className="admin-card">
        <span>Daily steps target</span>
        <span className="admin-steps">
          <input inputMode="numeric" aria-label="Steps from" value={draft.stepsMin} onChange={(event) => onChange({ ...draft, stepsMin: event.target.value })} />
          <span>to</span>
          <input inputMode="numeric" aria-label="Steps to" value={draft.stepsMax} onChange={(event) => onChange({ ...draft, stepsMax: event.target.value })} />
        </span>
      </div>
      {showNote ? <label className="admin-card admin-note">
        <span>Note for this week</span>
        <textarea rows={2} maxLength={2_000} value={draft.weekNote} placeholder='Shows on Jessie&apos;s Today screen, e.g. "Travel week, swap gym days freely"'
          onBlur={() => { if (!draft.weekNote.trim()) setNoteOpen(false); }}
          onChange={(event) => onChange({ ...draft, weekNote: event.target.value })} />
      </label> : <button type="button" className="admin-note-add" onClick={() => setNoteOpen(true)}>
        <span aria-hidden="true">+</span>
        <span><strong>Add a note for this week</strong><small>Shows on Jessie&apos;s Today screen, e.g. &quot;Travel week, swap gym days freely&quot;</small></span>
      </button>}
    </section>

    <div className="admin-panes">
      <section className="admin-days" aria-label="Days">
        <p className="admin-kicker">Week plan · drag to reorder</p>
        {draft.days.map((item, index) => <div key={item.id} className={item.id === day.id ? 'admin-day is-selected' : 'admin-day'}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const from = drag.current;
            if (from?.list === 'days') onChange((current) => ({ ...current, days: reorder(current.days, from.index, index) }));
          }}>
          <button type="button" className="admin-grip" draggable aria-label={`Reorder ${item.title || 'day'}. Arrow keys move it.`}
            onDragStart={(event) => { drag.current = { list: 'days', index }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              onChange((current) => ({ ...current, days: moveItem(current.days, index, event.key === 'ArrowUp' ? -1 : 1) }));
            }}><Grip /></button>
          <button type="button" className="admin-day-main" aria-current={item.id === day.id ? 'true' : undefined} onClick={() => pickDay(item.id)}>
            <span>Workout {index + 1}</span>
            <strong>{item.title || 'Untitled'}</strong>
          </button>
          <span className="admin-tag">{dayTag(item)}</span>
        </div>)}
        <button type="button" className="admin-add" onClick={() => setLimitNote('A programme week has seven days. Change one of these days instead of adding another.')}>+ Add day</button>
        {limitNote && <p className="fine">{limitNote}</p>}
      </section>

      {day && <section className="admin-pane" aria-label={`Workout ${dayIndex + 1}`}>
        <div className="admin-pane-head">
          <label>
            <span>Workout {dayIndex + 1} · day name</span>
            <input className="admin-title-input" aria-label="Day name" value={day.title} maxLength={40} onChange={(event) => patchDay(dayIndex, { title: event.target.value })} />
          </label>
          <Menu label="Day options: move up, move down, copy to next day, duplicate" items={[
            { label: 'Move up', disabled: dayIndex === 0, onSelect: () => onChange((current) => ({ ...current, days: moveItem(current.days, dayIndex, -1) })) },
            { label: 'Move down', disabled: dayIndex === draft.days.length - 1, onSelect: () => onChange((current) => ({ ...current, days: moveItem(current.days, dayIndex, 1) })) },
            { label: 'Copy to next day', disabled: dayIndex === draft.days.length - 1, onSelect: () => onChange((current) => ({ ...current, days: duplicateDay(current.days, dayIndex) })) },
            { label: 'Duplicate', disabled: dayIndex === draft.days.length - 1, onSelect: () => onChange((current) => ({ ...current, days: duplicateFresh(current.days, dayIndex) })) },
          ]} />
        </div>
        <Segmented label={`Workout ${dayIndex + 1} type`} value={day.type} options={dayTypes} onChange={(type) => {
          const kind = type as DayDraft['type'];
          const created = kind === 'strength' && !day.exercises.length ? blankExercise(draft.days.flatMap((item) => item.exercises.map((exercise) => exercise.id))) : undefined;
          onChange((current) => ({
            ...current,
            days: current.days.map((item, index) => index === dayIndex ? { ...item, type: kind, exercises: created ? [created] : item.exercises } : item),
          }));
          if (created) setExerciseId(created.id);
        }} />
        {day.type === 'strength' && <>
          <div role="list" aria-label="Exercises" className="admin-exercise-list">
            {day.exercises.map((exercise, index) => {
              const chip = exerciseChip(exercise);
              const on = exercise.id === selected?.id;
              return <div key={exercise.id} role="listitem" className={on ? 'admin-exercise-row is-selected' : 'admin-exercise-row'}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = drag.current;
                  if (from?.list === 'exercises') patchDay(dayIndex, { exercises: reorder(day.exercises, from.index, index) });
                }}>
                <button type="button" className="admin-grip" draggable aria-label={`Reorder ${exercise.name || 'exercise'}. Arrow keys move it.`}
                  onDragStart={(event) => { drag.current = { list: 'exercises', index }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    patchDay(dayIndex, { exercises: moveItem(day.exercises, index, event.key === 'ArrowUp' ? -1 : 1) });
                  }}><Grip /></button>
                <button type="button" className="admin-exercise-main" aria-current={on ? 'true' : undefined} onClick={() => { setExerciseId(exercise.id); if (narrow) setSheet(true); }}>
                  <strong>{exercise.name || 'Exercise'}</strong>
                  <small>{exerciseSummary(exercise)}</small>
                </button>
                {chip && <span className="admin-tag admin-tag-peach">{chip}</span>}
              </div>;
            })}
            <button type="button" className="admin-add" onClick={() => {
              const exercise = blankExercise(day.exercises.map((item) => item.id));
              patchDay(dayIndex, { exercises: [...day.exercises, exercise] });
              setExerciseId(exercise.id);
              if (narrow) setSheet(true);
            }}>+ Add exercise</button>
          </div>
          <p className="admin-count">{day.exercises.length} {day.exercises.length === 1 ? 'exercise' : 'exercises'} · {workingSets(day)} working {workingSets(day) === 1 ? 'set' : 'sets'}</p>
        </>}
        {day.type === 'cardio' && <div className="admin-fields">
          <Quiet wide label="Cardio note" maxLength={500} value={day.note} onChange={(note) => patchDay(dayIndex, { note })} />
          <label className="admin-quiet admin-quiet-wide"><span>Options, one per line</span>
            <textarea rows={4} maxLength={2_000} value={day.options} onChange={(event) => patchDay(dayIndex, { options: event.target.value })} /></label>
        </div>}
        {day.type === 'active-rest' && <div className="admin-fields">
          <Quiet wide label="Rest note" maxLength={500} value={day.note} onChange={(note) => patchDay(dayIndex, { note })} />
          <label className="admin-quiet admin-quiet-wide"><span>Guidance, one per line</span>
            <textarea rows={4} maxLength={2_000} value={day.guidance} onChange={(event) => patchDay(dayIndex, { guidance: event.target.value })} /></label>
        </div>}
      </section>}

      {!showSheet && <section className="admin-pane admin-exercise-desk" aria-label="Exercise details">
        {form ?? <p className="fine">{day?.type === 'strength' ? 'Choose an exercise.' : 'Notes for this day are in the day column. Strength days list exercises here.'}</p>}
      </section>}
    </div>

    {showSheet && selected && <BottomSheet className="admin-sheet" labelId="exercise-sheet-title" onClose={() => setSheet(false)}>
      <h2 id="exercise-sheet-title" className="sr-only">Edit {selected.name || 'exercise'}</h2>
      {form}
    </BottomSheet>}

    {!!changes.length && <details className="programme-review">
      <summary>Review {changes.length} {changes.length === 1 ? 'change' : 'changes'}</summary>
      <ul>{changes.map((change, index) => <li key={`${index}:${change}`}>{change}</li>)}</ul>
    </details>}
    {error && <p className="notice" role="alert">{error}</p>}
  </div>;
}

function workingSets(day: DayDraft) {
  return day.exercises.reduce((sum, exercise) => sum + (Number.parseInt(exercise.sets, 10) || 0), 0);
}

function duplicateFresh(days: readonly DayDraft[], index: number) {
  const target = index + 1;
  if (target >= days.length) return [...days];
  const source = structuredClone(days[index]);
  const taken = days.flatMap((day) => day.exercises.map((exercise) => exercise.id));
  source.id = days[target].id;
  source.exercises = source.exercises.map((exercise) => {
    const id = nextId(exercise.name || 'exercise', taken);
    taken.push(id);
    return { ...exercise, id };
  });
  return days.map((day, dayIndex) => dayIndex === target ? source : day);
}

function ExerciseForm({ exercise, index, total, compact, onChange, onMove, onDuplicate, onReplace, onRemove, saveLabel, busy, canSave, dirty, onSave, onDiscard }: {
  exercise: ExerciseDraft; index: number; total: number; compact: boolean;
  onChange: (patch: Partial<ExerciseDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onReplace: () => void;
  onRemove: () => void;
  saveLabel: string; busy: boolean; canSave: boolean; dirty: boolean; onSave: () => void; onDiscard: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [option, setOption] = useState('');
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState('Prescription');
  const [confirming, setConfirming] = useState(false);
  const options = variantList(exercise.variants);
  const mode = effortMode(exercise);
  const both = Boolean(exercise.rir.trim() && exercise.rpe.trim());
  const hint = mode === 'rir'
    ? 'Jessie logs reps left in the tank; this shows as her target.'
    : mode === 'rpe' ? 'Shown as a target. Jessie still logs RIR.' : 'Jessie logs RIR on every set; no target shown.';

  function addOption() {
    const text = option.trim();
    if (!text || options.includes(text) || options.length >= 8 || text.length > 40) return;
    onChange({ variants: [...options, text].join(', ') });
    setOption('');
    setAdding(false);
  }

  function chooseMode(next: string) {
    if (next === 'time' && /reps/i.test(exercise.target)) onChange({ mode: 'time', target: '' });
    else onChange({ mode: next as ExerciseDraft['mode'] });
  }

  function chooseEffort(next: string) {
    if (next === 'none') onChange({ rir: '', rpe: '' });
    if (next === 'rir') onChange({ rpe: '' });
    if (next === 'rpe') onChange({ rir: '' });
  }

  const menu = <Menu label="Exercise options: replace, duplicate, remove" items={confirming ? [
    { label: `Remove ${exercise.name || 'exercise'}?`, disabled: true, stay: true, onSelect: () => undefined },
    { label: 'Remove', danger: true, onSelect: onRemove },
    { label: 'Keep', onSelect: () => setConfirming(false) },
  ] : [
    { label: 'Replace', onSelect: onReplace },
    { label: 'Duplicate', onSelect: onDuplicate },
    { label: 'Remove', danger: true, stay: true, onSelect: () => setConfirming(true) },
  ]} />;

  const prescription = <div className="admin-fields">
    <Quiet label="Working sets" inputMode="numeric" value={exercise.sets} onChange={(sets) => onChange({ sets })} />
    {exercise.mode === 'time'
      ? <Quiet wide label="Time" value={exercise.target} onChange={(target) => onChange({ target })} placeholder="e.g. 30–60 sec" />
      : <div className="admin-quiet">
        <span>Reps (range)</span>
        <span className="admin-range">
          <input inputMode="numeric" aria-label="Reps from" value={exercise.repMin} onChange={(event) => onChange({ repMin: event.target.value })} />
          <span>–</span>
          <input inputMode="numeric" aria-label="Reps to" value={exercise.repMax} onChange={(event) => onChange({ repMax: event.target.value })} />
        </span>
      </div>}
    <Quiet label="Rest" value={exercise.rest} onChange={(rest) => onChange({ rest })} placeholder="2:00" />
    {exercise.mode !== 'bodyweight' && <Quiet label="Target weight, kg" inputMode="decimal" value={exercise.weight} placeholder="Not set" onChange={(weight) => onChange({ weight })} />}
    {(!compact || more) && <>
      <Quiet label="Warm-up sets" inputMode="numeric" value={exercise.warmupSets} placeholder="Optional" onChange={(warmupSets) => onChange({ warmupSets })} />
      {exercise.mode !== 'time' && <label className="admin-quiet"><span>Sides</span>
        <select value={exercise.per} onChange={(event) => onChange({ per: event.target.value as ExerciseDraft['per'] })}>
          <option value="">Together</option>
          <option value="leg">Each leg</option>
          <option value="side">Each side</option>
        </select>
      </label>}
      <Quiet wide label="Rest note" value={exercise.restNote} placeholder="e.g. after both legs are done" onChange={(restNote) => onChange({ restNote })} />
    </>}
    {compact && !more && <button type="button" className="admin-more" onClick={() => setMore(true)}>
      More: warm-up sets{exercise.mode === 'time' ? '' : ', sides'}, rest note ›
    </button>}
  </div>;

  const effort = <div className="admin-effort">
    <div className="admin-effort-row">
      <Segmented fit label="Effort type" value={mode} options={efforts} onChange={chooseEffort} />
      {mode !== 'none' && <input className="admin-effort-value" inputMode="numeric" aria-label={mode === 'rir' ? 'RIR target' : 'RPE target'}
        placeholder={mode === 'rir' ? 'e.g. 2' : 'e.g. 8'} value={mode === 'rir' ? exercise.rir : exercise.rpe}
        onChange={(event) => onChange(mode === 'rir' ? { rir: event.target.value } : { rpe: event.target.value })} />}
    </div>
    <p className="fine">{hint}{both ? ' Both RIR and RPE are saved until you choose one.' : ''}</p>
  </div>;

  const swaps = <div className="admin-swaps">
    <div className="admin-options">
      {options.map((name) => <span key={name} className="admin-option">{name}
        <button type="button" aria-label={`Remove ${name}`} onClick={() => onChange({ variants: options.filter((item) => item !== name).join(', ') })}>×</button>
      </span>)}
      {adding ? <input className="admin-option-input" aria-label="Swap option" value={option} maxLength={40} autoFocus
        onChange={(event) => setOption(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addOption(); } }}
        onBlur={addOption} /> : <button type="button" className="admin-option-add" onClick={() => setAdding(true)}>+ Add option</button>}
    </div>
    <p className="fine">{options.length ? 'Jessie can swap to one of these. Sets, reps and rest stay the same.' : 'None set. Jessie won\'t see a Swap button for this exercise.'}</p>
  </div>;

  const coaching = <div className="admin-coaching">
    <label className="admin-quiet"><span>Technique cue · shown on the set screen</span>
      <textarea rows={4} maxLength={2_000} value={exercise.cue} onChange={(event) => onChange({ cue: event.target.value })} /></label>
    <label className="admin-quiet"><span>Coaching note · in Cues</span>
      <textarea rows={4} maxLength={2_000} placeholder="Anything else Jessie should know" value={exercise.coachNote} onChange={(event) => onChange({ coachNote: event.target.value })} /></label>
    <label className="admin-quiet"><span>Progression rule</span>
      <textarea rows={4} maxLength={2_000} placeholder="e.g. add 2.5 kg once all sets hit 8 reps" value={exercise.progression} onChange={(event) => onChange({ progression: event.target.value })} /></label>
  </div>;

  const preview = <p className="admin-preview"><span>Jessie sees</span><strong>{exercise.name.trim() || 'Exercise'} · {jessieDetail(exercise)}</strong></p>;
  const actions = dirty ? <div className="admin-sheet-actions">
    <button type="button" className="admin-discard" onClick={onDiscard} disabled={busy}>Discard</button>
    <button type="button" className="admin-commit" onClick={onSave} disabled={busy || !canSave}>{busy ? 'Saving…' : saveLabel}</button>
  </div> : <p className="admin-clean">All changes saved</p>;

  return <>
    <div className="admin-exercise-head">
      <label>
        <span>Exercise {index + 1} of {total}</span>
        <input className="admin-title-input" aria-label="Exercise name" value={exercise.name} maxLength={80} onChange={(event) => onChange({ name: event.target.value })} />
      </label>
      <Segmented fit label="Logged as" value={exercise.mode} options={modes} onChange={chooseMode} />
      {menu}
    </div>
    {compact ? <div className="admin-sheet-scroll">
      <Section title="Prescription" summary={jessieDetail(exercise)} open={open === 'Prescription'} onToggle={() => setOpen(open === 'Prescription' ? '' : 'Prescription')}>{prescription}</Section>
      <Section title="Effort target" summary={mode === 'none' ? 'None · Jessie logs RIR each set' : `${mode.toUpperCase()} ${mode === 'rir' ? exercise.rir : exercise.rpe}`} open={open === 'Effort target'} onToggle={() => setOpen(open === 'Effort target' ? '' : 'Effort target')}>{effort}</Section>
      <Section title="Swap options" summary={options.length ? options.join(', ') : 'None · Swap hidden for Jessie'} open={open === 'Swap options'} onToggle={() => setOpen(open === 'Swap options' ? '' : 'Swap options')}>{swaps}</Section>
      <Section title="Coaching" summary={coachingSummary(exercise)} open={open === 'Coaching'} onToggle={() => setOpen(open === 'Coaching' ? '' : 'Coaching')}>{coaching}</Section>
      <div className="admin-move-row">
        <button type="button" className="admin-discard" disabled={index === 0} onClick={() => onMove(-1)}>Move up</button>
        <button type="button" className="admin-discard" disabled={index === total - 1} onClick={() => onMove(1)}>Move down</button>
      </div>
    </div> : <>
      <fieldset>
        <legend className="admin-kicker">Prescription</legend>
        {prescription}
      </fieldset>
      <div className="admin-split">
        <fieldset><legend className="admin-kicker">Effort target</legend>{effort}</fieldset>
        <fieldset><legend className="admin-kicker">Swap options</legend>{swaps}</fieldset>
      </div>
      <fieldset>
        <legend className="admin-kicker">Coaching</legend>
        {coaching}
      </fieldset>
      {preview}
    </>}
    {compact && <div className="admin-sheet-foot">{preview}{actions}</div>}
  </>;
}

function coachingSummary(exercise: ExerciseDraft) {
  const cue = exercise.cue.trim();
  const note = exercise.coachNote.trim();
  const rule = exercise.progression.trim();
  if (cue && !note && !rule) return 'Cue set · no note or progression';
  if (!cue && !note && !rule) return 'No cue, note or progression';
  return [cue && 'Cue set', note && 'Note set', rule && 'Progression set'].filter(Boolean).join(' · ');
}

function Section({ title, summary, open, onToggle, children }: {
  title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return <div className="admin-section">
    <button type="button" aria-expanded={open} onClick={onToggle}>
      <span><strong>{title}</strong><small>{summary}</small></span>
      <ChevronDown size={18} aria-hidden="true" className={open ? 'week-chev is-open' : 'week-chev'} />
    </button>
    {open && <div className="admin-section-body">{children}</div>}
  </div>;
}
