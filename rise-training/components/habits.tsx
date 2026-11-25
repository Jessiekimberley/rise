'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { displayDate, formatCount, formatHours, goalSpan } from '@/lib/insights';
import { emptyHabits, type HabitLog } from '@/lib/model';
import type { ProgrammeHabits } from '@/lib/prescription';
import { habitTargets } from '@/lib/programme';
import { HeadingSentence, Pill } from './ui';
import type { Mutate } from './training-app';

const reminders = habitTargets.nutrition.habits;

type Field = 'steps' | 'sleep' | 'sleep-note' | 'fuel' | 'water';
type SleepEditor = 'hours' | 'note' | null;

function parseSteps(raw: string) {
  const trimmed = raw.trim().replace(/,/g, '');
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isInteger(value) && value <= 200_000 ? value : undefined;
}

function parseHours(raw: string) {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value <= 24 ? value : undefined;
}

function barWidth(value: number, full: number) {
  if (full <= 0) return 0;
  return Math.min(100, Math.round((value / full) * 100));
}

export function Habits({ date, log = emptyHabits, goals, mutate }: { date: string; log?: HabitLog; goals: ProgrammeHabits; mutate: Mutate }) {
  const stepsGoal = goals.steps;
  const waterGoal = goals.hydrationLitres;
  const sleepGoal = goals.sleepHours;
  const stepsRange = goalSpan(stepsGoal.min, stepsGoal.max);
  const waterRange = goalSpan(waterGoal.min, waterGoal.max);
  const sleepRange = goalSpan(sleepGoal.min, sleepGoal.max);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [stepsDraft, setStepsDraft] = useState('');
  const [sleepEditor, setSleepEditor] = useState<SleepEditor>(null);
  const [hoursDraft, setHoursDraft] = useState('');
  const [sleepNoteDraft, setSleepNoteDraft] = useState('');
  const [fuelOpen, setFuelOpen] = useState(false);
  const [fuelDraft, setFuelDraft] = useState('');
  const [busy, setBusy] = useState<Partial<Record<Field, boolean>>>({});
  const [problem, setProblem] = useState<{ field: Field; text: string }>();
  const [waterChoice, setWaterChoice] = useState<boolean | null>();
  const stepsInput = useRef<HTMLInputElement>(null);
  const hoursInput = useRef<HTMLInputElement>(null);
  const sleepNoteInput = useRef<HTMLTextAreaElement>(null);
  const fuelInput = useRef<HTMLTextAreaElement>(null);
  const yesButton = useRef<HTMLButtonElement>(null);
  const noButton = useRef<HTMLButtonElement>(null);
  const waterRef = useRef<boolean | null>(log.waterHitTarget ?? null);
  const waterLock = useRef(false);
  if (!waterLock.current) waterRef.current = log.waterHitTarget ?? null;

  const steps = log.steps;
  const sleep = log.sleep;
  const sleepNote = log.sleepNote?.trim() ?? '';
  const fuelNote = log.fuellingNote?.trim() ?? '';
  const water = waterChoice === undefined ? (log.waterHitTarget ?? null) : waterChoice;
  useEffect(() => { setWaterChoice(undefined); }, [log.waterHitTarget]);
  useEffect(() => {
    if (stepsOpen) stepsInput.current?.focus();
    else if (sleepEditor === 'hours') hoursInput.current?.focus();
    else if (sleepEditor === 'note') sleepNoteInput.current?.focus();
    else if (fuelOpen) fuelInput.current?.focus();
  }, [stepsOpen, sleepEditor, fuelOpen]);
  const stepsLogged = steps != null && !stepsOpen;
  const sleepLogged = sleep != null && sleepEditor !== 'hours';

  function draft(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, set: (value: string) => void) {
    set(event.target.value);
  }

  async function save(field: Field, data: Partial<HabitLog>, close?: () => void) {
    setBusy((current) => ({ ...current, [field]: true }));
    setProblem(undefined);
    try {
      await mutate({ type: 'patchHabits', date, data });
      close?.();
      return true;
    } catch (reason) {
      setProblem({ field, text: reason instanceof Error ? reason.message : 'Could not save. Try again.' });
      return false;
    } finally {
      setBusy((current) => ({ ...current, [field]: false }));
    }
  }

  function saveSteps() {
    const value = parseSteps(stepsInput.current?.value ?? '');
    if (value === undefined) {
      setProblem({ field: 'steps', text: 'Enter a whole number of steps.' });
      return;
    }
    void save('steps', { steps: value }, () => setStepsOpen(false));
  }

  function saveHours() {
    const value = parseHours(hoursInput.current?.value ?? '');
    if (value === undefined) {
      setProblem({ field: 'sleep', text: 'Enter hours, such as 7.5.' });
      return;
    }
    void save('sleep', { sleep: value }, () => setSleepEditor(null));
  }

  function saveSleepNote() {
    const value = (sleepNoteInput.current?.value ?? '').trim();
    void save('sleep-note', { sleepNote: value || null }, () => setSleepEditor(null));
  }

  function saveFuelNote() {
    const value = (fuelInput.current?.value ?? '').trim();
    void save('fuel', { fuellingNote: value || null }, () => setFuelOpen(false));
  }

  function chooseWater(value: boolean) {
    if (waterLock.current) return;
    waterLock.current = true;
    const next = waterRef.current === value ? null : value;
    waterRef.current = next;
    setWaterChoice(next);
    void save('water', { waterHitTarget: next }).then((saved) => {
      if (!saved) setWaterChoice(undefined);
    }).finally(() => { waterLock.current = false; });
  }

  function moveWater(event: KeyboardEvent<HTMLButtonElement>, current: boolean) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = !current;
    (next ? yesButton : noButton).current?.focus();
    chooseWater(next);
  }

  function notice(field: Field) {
    return problem?.field === field ? <p className="habit-inline" role="alert">{problem.text}</p> : null;
  }

  return <section className="screen screen-nav screen-habits">
    <div className="habits-photo">
      <Image src="/images/days/swim.webp" alt="" fill sizes="(max-width: 520px) 100vw, 520px" loading="eager" />
      <div className="habits-scrim" aria-hidden="true" />
      <header>
        <p className="habits-date">{displayDate(date, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')}</p>
        <HeadingSentence lead="Daily habits." />
        <p className="habits-guide">Brenna's guide for today.</p>
      </header>
    </div>

    <section className="habit-card" aria-label="Steps">
      <div className="habit-card-head">
        <div className="habit-card-copy">
          <span className="row-label">{stepsLogged ? `Steps · goal ${stepsRange}` : 'Steps'}</span>
          {stepsOpen ? <input ref={stepsInput} className="habit-input habit-input-steps" type="text" inputMode="numeric" aria-label="Steps today"
            placeholder="e.g. 8,500" value={stepsDraft} aria-invalid={problem?.field === 'steps' || undefined}
            onChange={(event) => draft(event, setStepsDraft)} onKeyDown={(event) => { if (event.key === 'Enter') saveSteps(); }} />
            : <p className="habit-figure">{stepsLogged ? formatCount(steps) : stepsRange}{stepsLogged && <span> steps</span>}</p>}
        </div>
        <Pill className={stepsOpen ? 'pill-dark' : ''} disabled={busy.steps} onClick={() => {
          if (stepsOpen) saveSteps();
          else {
            setStepsDraft(steps == null ? '' : String(steps));
            setStepsOpen(true);
            setProblem(undefined);
          }
        }}>{busy.steps ? 'Saving…' : stepsOpen ? 'Save' : stepsLogged ? 'Edit' : '+ Add'}</Pill>
      </div>
      {stepsLogged && <div className="habit-meter" aria-hidden="true">
        <span style={{ width: `${barWidth(steps, stepsGoal.max)}%` }} />
        <span className="habit-meter-mark" style={{ left: `${barWidth(stepsGoal.min, stepsGoal.max)}%` }} />
      </div>}
      {notice('steps')}
    </section>

    <div className="habit-pair">
      <section className="habit-tile" aria-label="Water">
        <span className="row-label">Water · target</span>
        <p className="habit-figure">{waterRange}<span> L</span></p>
        <p className="habit-aside">Same bottle every day.</p>
        <div className="habit-yn" role="radiogroup" aria-label="Hit your water target today?">
          <span>Hit it today?</span>
          <div className="habit-choices">
            <button ref={yesButton} type="button" role="radio" className="habit-choice" aria-checked={water === true} disabled={busy.water}
              onClick={() => chooseWater(true)} onKeyDown={(event) => moveWater(event, true)}>Yes</button>
            <button ref={noButton} type="button" role="radio" className="habit-choice habit-choice-no" aria-checked={water === false} disabled={busy.water}
              onClick={() => chooseWater(false)} onKeyDown={(event) => moveWater(event, false)}>No</button>
          </div>
        </div>
        {notice('water')}
      </section>

      <section className="habit-tile" aria-label="Sleep">
        <span className="row-label">{sleepLogged ? `Sleep · goal ${sleepRange} h` : 'Sleep'}</span>
        {sleepEditor === 'hours' ? <input ref={hoursInput} className="habit-input habit-input-hours" type="text" inputMode="decimal" aria-label="Sleep today"
          placeholder="Hours" value={hoursDraft} aria-invalid={problem?.field === 'sleep' || undefined}
          onChange={(event) => draft(event, setHoursDraft)} onKeyDown={(event) => { if (event.key === 'Enter') saveHours(); }} />
          : <p className="habit-figure">{sleepLogged ? formatHours(sleep) : sleepRange}<span>{sleepLogged ? ` h of ${sleepRange}` : ' h'}</span></p>}
        {sleepLogged && <div className="habit-meter habit-meter-short" aria-hidden="true"><span style={{ width: `${barWidth(sleep, sleepGoal.min)}%` }} /></div>}
        <p className="habit-aside">Quality over quantity.</p>
        {sleepEditor !== 'note' && sleepNote && <p className="habit-saved-note">{sleepNote}</p>}
        {sleepEditor === 'note' && <textarea ref={sleepNoteInput} className="habit-note-input" rows={3} maxLength={2_000} aria-label="Sleep notes"
          placeholder="How did you sleep? Woke up, felt rested…" value={sleepNoteDraft} onChange={(event) => draft(event, setSleepNoteDraft)} />}
        <div className="habit-actions">
          <Pill className={`pill-tile ${sleepEditor === 'hours' ? 'pill-dark' : ''}`} disabled={busy.sleep} onClick={() => {
            if (sleepEditor === 'hours') saveHours();
            else {
              setHoursDraft(sleep == null ? '' : formatHours(sleep));
              setSleepEditor('hours');
              setProblem(undefined);
            }
          }}>{busy.sleep ? 'Saving…' : sleepEditor === 'hours' ? 'Save' : sleep != null ? 'Edit hours' : '+ Hours'}</Pill>
          <Pill className={`pill-tile ${sleepEditor === 'note' ? 'pill-dark' : ''}`} disabled={busy['sleep-note']} onClick={() => {
            if (sleepEditor === 'note') saveSleepNote();
            else {
              setSleepNoteDraft(sleepNote);
              setSleepEditor('note');
              setProblem(undefined);
            }
          }}>{busy['sleep-note'] ? 'Saving…' : sleepEditor === 'note' ? 'Save note' : sleepNote ? 'Edit note' : '+ Note'}</Pill>
        </div>
        {notice('sleep')}
        {notice('sleep-note')}
      </section>
    </div>

    <section className="fuelling" aria-label="Fuelling">
      <span className="row-label">Fuelling · no calorie target</span>
      <p className="fuelling-title">Eat around maintenance, <span>if not more.</span></p>
      <ul className="fuelling-pills" aria-label="Fuelling reminders">
        {reminders.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {fuelOpen ? <textarea ref={fuelInput} className="habit-note-input" rows={3} maxLength={2_000} aria-label="Fuelling notes"
        placeholder="What did you eat? Felt fuelled, low on energy…" value={fuelDraft} onChange={(event) => draft(event, setFuelDraft)} />
        : fuelNote ? <p className="habit-saved-note">{fuelNote}</p> : null}
      <Pill className={`pill-tile ${fuelOpen ? 'pill-dark' : 'pill-white'}`} disabled={busy.fuel} onClick={() => {
        if (fuelOpen) saveFuelNote();
        else {
          setFuelDraft(fuelNote);
          setFuelOpen(true);
          setProblem(undefined);
        }
      }}>{busy.fuel ? 'Saving…' : fuelOpen ? 'Save note' : fuelNote ? 'Edit note' : '+ Note'}</Pill>
      {notice('fuel')}
    </section>

    <p className="habits-footnote">Everything here is optional. Anything you add is saved to today's entry with your workout notes.</p>
  </section>;
}
