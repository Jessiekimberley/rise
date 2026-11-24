'use client';

import { Check, ChevronDown, Clock3, Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { displayDate, lastPerformance, restDisplay, setLabel } from '@/lib/insights';
import { sessionKey, type SetLog, type SlotLog, type TrainingData } from '@/lib/model';
import type { Exercise } from '@/lib/programme';
import { programmeExercises, weekPlans, workoutPlan } from '@/lib/weeks';
import type { Mutate } from './training-app';

type Selection = { slot: Exercise; exercise: Exercise; variant: string; index: number; logged?: SetLog };

function SetInput({ label, value, onChange, delta, max }: { label: string; value: string; onChange: (value: string) => void; delta: number; max: number }) {
  function adjust(number: number) {
    onChange(String(Math.min(max, Math.max(0, Math.round((Number(value || '0') + number) * 100) / 100))));
  }
  return <label className="input-group">
    <span>{label}</span>
    <span className="stepper"><button type="button" onClick={() => adjust(-delta)} aria-label={`Decrease ${label}`}><Minus size={19} /></button>
      <input aria-label={label} type="number" min="0" max={max} step={delta % 1 ? 'any' : 1} inputMode={delta % 1 ? 'decimal' : 'numeric'} value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" onClick={() => adjust(delta)} aria-label={`Increase ${label}`}><Plus size={19} /></button></span>
  </label>;
}

function SetSheet({ selection, previous, close, save, remove, primeAudio }: {
  selection: Selection; previous?: SetLog; close: () => void; save: (set: SetLog, rest: boolean) => Promise<void>; remove: () => Promise<void>; primeAudio: () => void;
}) {
  const { exercise, variant, index, logged } = selection;
  const suggested = logged ?? previous;
  const ref = useRef<HTMLDialogElement>(null);
  const string = (value?: number | null) => value == null ? '' : String(value);
  const number = (value: string) => value === '' ? null : Number(value);
  const [weight, setWeight] = useState(string(suggested?.weight ?? (!logged && exercise.metric !== 'seconds' && exercise.metric !== 'bodyweight' ? exercise.coachKg : undefined)));
  const [reps, setReps] = useState(string(suggested?.reps));
  const [seconds, setSeconds] = useState(string(suggested?.seconds));
  const [effort, setEffort] = useState(string(logged?.effort));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { ref.current?.showModal(); }, []);

  async function perform(action: () => Promise<void>) {
    if (saving) return;
    setSaving(true);
    setError('');
    try { await action(); } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save. Try again.');
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const set = { exerciseId: exercise.id, variant, weight: number(weight), reps: number(reps), seconds: number(seconds), effort: number(effort) };
    if (exercise.metric === 'seconds' ? !set.seconds : !set.reps) {
      setError(exercise.metric === 'seconds' ? 'Enter the seconds you held.' : 'Enter the reps you completed.');
      return;
    }
    if (!logged && exercise.rest) primeAudio();
    void perform(() => save(set, !logged));
  }

  return <dialog className="set-sheet" ref={ref} onCancel={(event) => { event.preventDefault(); if (!saving) close(); }} aria-labelledby="set-heading">
    <form onSubmit={submit}>
      <div className="section-line"><div><p className="eyebrow">Set {index + 1} · {exercise.target}</p><h2 id="set-heading">{exercise.name}</h2>{variant && <p>{variant}</p>}</div>
        <button className="icon-button" type="button" aria-label="Close set" onClick={close} disabled={saving}><X size={24} /></button></div>
      <div className="set-fields">
        {exercise.metric === 'seconds' ? <SetInput label="Seconds" value={seconds} onChange={setSeconds} delta={5} max={86_400} /> : <>
          {exercise.metric !== 'bodyweight' && <SetInput label="Weight (kg)" value={weight} onChange={setWeight} delta={2.5} max={5_000} />}
          <SetInput label={exercise.perSide ? `Reps per ${exercise.perSide}` : 'Reps'} value={reps} onChange={setReps} delta={1} max={1_000} />
        </>}
        <label className="input-group"><span>Effort · RPE</span><select value={effort} onChange={(event) => setEffort(event.target.value)}>
          <option value="">Optional, 1–10</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
        </select></label>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      <button type="submit" className="primary full" disabled={saving}>{saving ? 'Saving…' : logged ? 'Update set' : exercise.rest ? `Save set · ${restDisplay(exercise.rest)} rest` : 'Save set'}</button>
      {logged && <button className="text-button full" type="button" disabled={saving} onClick={() => void perform(remove)}>Remove set</button>}
    </form>
  </dialog>;
}

function ExerciseEntry({ original, log, data, date, open, onSelect, onNote, startRest, roster }: {
  original: Exercise; log?: SlotLog; data: TrainingData; date: string;
  open: (selection: Selection) => void; onSelect: (exercise: string, variant: string) => Promise<unknown>;
  onNote: (text: string) => Promise<unknown>; startRest: (seconds: number) => void; roster: Exercise[];
}) {
  const find = (id: string) => roster.find((item) => item.id === id);
  const exercise = find(log?.exerciseId ?? original.id) ?? original;
  const variant = log?.variant ?? '';
  const previous = lastPerformance(data, date, exercise.id, variant);
  const [note, setNote] = useState(log?.note ?? '');
  const [busy, setBusy] = useState(false);
  const sets = Array.from({ length: original.sets }, (_, index) => log?.sets[index]);
  const next = sets.findIndex((item) => !item);

  async function change(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch { /* The app shows the error. */ } finally { setBusy(false); }
  }

  return <section className="exercise">
    <div className="section-line"><div><h2>{exercise.name}</h2><p className="fine">{original.sets} sets · {exercise.target}{variant ? ` · ${variant}` : ''}</p></div>
      {exercise.rest > 0 && <button className="timer-button" onClick={() => startRest(exercise.rest)} aria-label={`Start ${exercise.name} rest timer`}><Clock3 size={17} />{restDisplay(exercise.rest)}</button>}</div>
    <p className="previous">{previous ? <><strong>Last time · {displayDate(previous.date)}</strong> · {previous.sets.map(setLabel).join(' / ')}</> : 'No previous sets for this exercise'}</p>
    {exercise.coachWeight && <p className="coach-weight"><strong>Brenna’s load</strong> · {exercise.coachWeight}</p>}
    <div className="set-list" aria-label={`${exercise.name} sets`}>
      {sets.map((set, index) => <button type="button" key={index} className={set ? 'set-row logged' : index === next ? 'set-row next-set' : 'set-row'} onClick={() => open({ slot: original, exercise: set ? find(set.exerciseId) ?? exercise : exercise, variant: set?.variant ?? variant, index, logged: set })}>
        <span className="set-number">{set ? <Check size={17} /> : index + 1}</span>
        <span>{set ? <>{setLabel(set)}{set.exerciseId !== exercise.id ? ` · ${set.exerciseName ?? find(set.exerciseId)?.name}` : ''}</> : `Log set ${index + 1}`}</span>
        {set ? <span className="fine">Edit</span> : <Plus size={19} aria-hidden="true" />}
      </button>)}
    </div>
    <details className="exercise-details"><summary>Technique, notes & substitution <ChevronDown size={17} /></summary>
      <p>{exercise.cue}</p>
      <label className="input-group"><span>Exercise</span><select disabled={busy} value={exercise.id} onChange={(event) => void change(() => onSelect(event.target.value, ''))}>
        {roster.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === original.id ? ' (planned)' : ''}</option>)}
      </select></label>
      {!!exercise.variants?.length && <label className="input-group"><span>Equipment or variation</span><select disabled={busy} value={variant} onChange={(event) => void change(() => onSelect(exercise.id, event.target.value))}>
        <option value="">Unspecified</option>{exercise.variants.map((option) => <option key={option}>{option}</option>)}
      </select></label>}
      <label className="input-group"><span>Personal notes</span><textarea rows={3} maxLength={2_000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      <button className="secondary" disabled={busy || note === (log?.note ?? '')} onClick={() => void change(() => onNote(note))}>Save note</button>
    </details>
  </section>;
}

export function Workout({ date, planId, onPlan, data, mutate, startRest, primeAudio }: {
  date: string; planId: string; onPlan: (id: string) => void; data: TrainingData; mutate: Mutate; startRest: (seconds: number) => void; primeAudio: () => void;
}) {
  const plans = weekPlans(data, date);
  const plan = workoutPlan(data, date, planId) ?? plans[0];
  const roster = programmeExercises(data, [plan, ...plans]);
  const session = data.sessions[sessionKey(date, plan.id)];
  const completed = Object.values(session?.slots ?? {}).reduce((total, log) => total + Object.keys(log.sets).length, 0);
  const total = plan.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  const [selection, setSelection] = useState<Selection>();
  const [finishing, setFinishing] = useState(false);

  async function finish() {
    setFinishing(true);
    try { await mutate({ type: 'finish', date, planId: plan.id }); } catch { /* The app shows the error. */ } finally { setFinishing(false); }
  }

  return <>
    <p className="eyebrow">{displayDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
    <h1 className="page-title">Train</h1>
    <label className="input-group workout-picker"><span>Workout</span><select value={plan.id} onChange={(event) => onPlan(event.target.value)}>{plans.map((item) => <option key={item.id} value={item.id}>{item.name} · Day {item.day}</option>)}</select></label>
    <div className="workout-progress"><span><strong>{completed}/{total}</strong> sets logged</span>{session?.finishedAt && <span className="success"><Check size={17} /> Workout finished</span>}<progress max={total} value={completed} aria-label="Sets logged" /></div>
    {plan.exercises.map((original) => <ExerciseEntry key={original.id} original={original} log={session?.slots[original.id]} data={data} date={date} open={setSelection} roster={roster} startRest={(seconds) => { primeAudio(); startRest(seconds); }}
      onSelect={(exerciseId, variant) => mutate({ type: 'substitute', date, planId: plan.id, slotId: original.id, exerciseId, variant })}
      onNote={(text) => mutate({ type: 'note', date, planId: plan.id, slotId: original.id, text })} />)}
    {!session?.finishedAt && <button className="primary full" disabled={!completed || finishing} onClick={() => void finish()}>{finishing ? 'Saving…' : 'Finish workout'}</button>}
    {selection && <SetSheet selection={selection} close={() => setSelection(undefined)} primeAudio={primeAudio}
      previous={lastPerformance(data, date, selection.exercise.id, selection.variant)?.sets[selection.index]}
      save={async (set, rest) => {
        await mutate({ type: 'putSet', date, planId: plan.id, slotId: selection.slot.id, index: selection.index, set });
        setSelection(undefined);
        if (rest) startRest(selection.exercise.rest);
      }}
      remove={async () => { await mutate({ type: 'removeSet', date, planId: plan.id, slotId: selection.slot.id, index: selection.index }); setSelection(undefined); }} />}
  </>;
}
