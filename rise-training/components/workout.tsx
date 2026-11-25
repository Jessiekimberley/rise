'use client';

import { ArrowLeftRight, Check, ChevronLeft, Clock3 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { compactSet, displayDate, lastPerformance, pastSessions, restDisplay, rirDisplay } from '@/lib/insights';
import { effectiveSlot, firstOpenSet, sessionKey, type SetLog, type TrainingData } from '@/lib/model';
import { canonicalVariant, dayTitle, exerciseOptions, type Exercise } from '@/lib/programme';
import { programmeExercises, weekPlans, workoutPlan } from '@/lib/weeks';
import { RestTimer, useRestAudio, type RestDetails } from './rest-timer';
import { LogSet, usesBarbell, warmupIndex, type LogSetRow } from './log-set';
import { BottomSheet, ChipGroup, HeadingSentence, Pill, PrimaryButton, RoundButton, Row, RowStack } from './ui';
import type { Mutate } from './training-app';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Try again.';
const restLabel = (exercise: Exercise) => exercise.rest ? `rest ${restDisplay(exercise.rest)}${exercise.restNote ? ` ${exercise.restNote}` : ''}` : 'no rest prescribed';
const shortTarget = (exercise: Exercise) => exercise.target.replace(/ reps\b/, '');
const dateWords = { weekday: 'long', day: 'numeric', month: 'short' } as const;

function WorkoutClock({ startedAt, finishedAt }: { startedAt: string; finishedAt?: string }) {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    if (finishedAt) return;
    function tick() { setNow(Date.now()); }
    tick();
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [finishedAt]);
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : now ?? start;
  const seconds = Math.max(0, Math.floor((end - start) / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const elapsed = hours ? `${hours}:${restDisplay(seconds % 3_600).padStart(5, '0')}` : restDisplay(seconds);
  return <span className="workout-clock" role="timer" aria-label={finishedAt ? 'Total workout time' : 'Elapsed workout time'} aria-live="off">
    <Clock3 size={16} aria-hidden="true" />{elapsed}
  </span>;
}

function Cues({ exercise, variant, date, data, coachText, note, canSwap, back, openSwap, saveNote, manualRest, modalOpen }: {
  exercise: Exercise; variant: string; date: string; data: TrainingData; note: string; canSwap: boolean;
  coachText?: string; back: () => void; openSwap: () => void; saveNote: (note: string) => Promise<void>; manualRest: () => void; modalOpen: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const history = pastSessions(data, date).flatMap((session) => Object.entries(session.slots)
    .filter(([slotId, slot]) => slot.note.trim() && (slot.exerciseId === exercise.id || slotId === exercise.id || Object.values(slot.sets).some((set) => set.exerciseId === exercise.id)))
    .map(([slotId, slot]) => ({ id: `${session.date}:${session.planId}:${slotId}`, date: session.date, note: slot.note })));
  const initialNote = note || history[0]?.note || '';
  const [draft, setDraft] = useState(initialNote);
  const cues = exercise.cue.split(/(?:[.!?]\s+|,\s+(?=[a-z])|\s+-\s+)/i).filter(Boolean);

  async function done() {
    if (busy) return;
    if (draft === initialNote) { back(); return; }
    setError('');
    setBusy(true);
    try { await saveNote(draft); back(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  return <section className={`screen screen-cues ${modalOpen ? 'behind-swap' : ''}`}>
    <div className="screen-toolbar">
      <RoundButton aria-label="Back to sets" onClick={() => void done()} disabled={busy}><ChevronLeft size={20} /></RoundButton>
      {canSwap && <Pill className="pill-white" onClick={openSwap} disabled={busy}><ArrowLeftRight size={14} aria-hidden="true" />Swap</Pill>}
    </div>
    <HeadingSentence lead={`${exercise.name}.`} follow={`${variant ? `${canonicalVariant(exercise.id, variant)}, ` : ''}${exercise.sets} sets of ${shortTarget(exercise)}, ${restLabel(exercise)}.`} />
    <div className="cues-content">
      <section className="cues-block" aria-label="Brenna’s cues">
        <h2 className="fine">Brenna’s cues</h2>
        {cues.length ? <ul>{cues.map((cue, index) => <li key={index}>{cue[0].toUpperCase() + cue.slice(1)}</li>)}</ul>
          : <p>No cues in your programme yet.</p>}
      </section>
      {coachText && <Row label="Unsure about form?" value="Send Brenna a video" end={<Pill href={coachText}>Text</Pill>} />}
      <label className="note-field">
        <span>My notes · shown every session for this exercise</span>
        <textarea rows={3} maxLength={2_000} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} />
      </label>
      <details className="disclosure">
        <summary>Past notes{exercise.rest > 0 ? ' and rest timer' : ''}</summary>
        {history.length ? <RowStack>{history.map((entry) => <Row key={entry.id} label={displayDate(entry.date, dateWords)} value={entry.note} />)}</RowStack>
          : <p className="fine">No past notes for this exercise yet.</p>}
        {exercise.rest > 0 && <Pill onClick={manualRest} disabled={busy || draft !== initialNote}><Clock3 size={16} aria-hidden="true" />Start rest timer</Pill>}
      </details>
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
    <div className="screen-actions">
      <PrimaryButton onClick={() => void done()} disabled={busy}>{busy ? 'Saving…' : 'Back to sets'}</PrimaryButton>
    </div>
  </section>;
}

function SwapSheet({ exercise, variant, date, day, data, coachText, close, save }: {
  exercise: Exercise; variant: string; date: string; day: number; data: TrainingData; coachText?: string; close: () => void;
  save: (variant: string, recurring: boolean) => Promise<void>;
}) {
  const options = exerciseOptions(exercise.id);
  const current = canonicalVariant(exercise.id, variant);
  const [choice, setChoice] = useState(options.includes(current) ? current : '');
  const [scope, setScope] = useState('today');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useId();

  async function apply() {
    if (!choice || busy) return;
    setError('');
    setBusy(true);
    try { await save(choice, scope === 'every'); close(); } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  return <BottomSheet labelId={id} className="swap-sheet" onClose={() => { if (!busy) close(); }}>
    <HeadingSentence id={id} className="heading-small" lead={`Swap ${exercise.name}.`} follow="Options from Brenna’s programme, same sets, reps and rest." />
    <ChipGroup className="swap-options" label="Equipment" value={choice} disabled={busy} onChange={setChoice}
      options={options.map((option) => {
        const last = lastPerformance(data, date, exercise.id, option)?.sets.at(-1);
        return { value: option, label: <>
          <span className="row-copy"><span className="row-label">{[option === current ? 'Current' : '', last ? `Last ${compactSet(last)}` : 'No history yet'].filter(Boolean).join(' · ')}</span>
            <span className="row-value">{option}</span></span>
          <span className="option-tick" aria-hidden="true">{option === choice && <Check size={17} />}</span>
        </> };
      })} />
    <ChipGroup className="chips-two" label="Apply to" value={scope} disabled={busy} onChange={setScope}
      options={[{ value: 'today', label: 'Today only' }, { value: 'every', label: `Every Day ${day}` }]} />
    {coachText && <p className="fine">Need something not listed? <a href={coachText}>Ask Brenna</a> before changing your plan.</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <PrimaryButton onClick={() => void apply()} disabled={!choice || busy}>{busy ? 'Saving…' : choice ? `Use ${choice.toLowerCase()}` : 'Choose an option'}</PrimaryButton>
  </BottomSheet>;
}

type Selection = { slotId: string; index?: number };

export function Workout({ date, today, planId, onPlan, previewOnly, onOpen, onLogToday, data, coachText, mutate, onBack, setFocused }: {
  date: string; today: string; planId: string; onPlan: (id: string) => void; data: TrainingData; mutate: Mutate;
  previewOnly?: boolean; onOpen: (id: string) => boolean; onLogToday: (id: string) => void;
  coachText?: string; onBack: () => void; setFocused: (focused: boolean) => void;
}) {
  const plans = weekPlans(data, date);
  const plan = workoutPlan(data, date, planId);
  const session = plan && data.sessions[sessionKey(date, plan.id)];
  const roster = programmeExercises(data, plan ? [plan, ...plans] : plans);
  const [selection, setSelection] = useState<Selection>();
  const [cues, setCues] = useState(false);
  const [swap, setSwap] = useState(false);
  const [rest, setRest] = useState<RestDetails>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audio = useRestAudio();
  const preview = date > today || (previewOnly && date !== today && !session);

  function clearRest() {
    audio.cancel();
    setRest(undefined);
  }

  function go(next?: Selection) {
    clearRest();
    setSelection(next);
    setFocused(!!next);
    setCues(false);
    setSwap(false);
    window.scrollTo(0, 0);
  }

  const chooseWorkout = <details className="disclosure supplementary">
    <summary>Choose a workout</summary>
    <label className="input-group"><span>Workout</span>
      <select value={plan?.id ?? ''} onChange={(event) => onPlan(event.target.value)}>
        {!plans.some((item) => item.id === plan?.id) && <option value={plan?.id ?? ''} disabled>{plan ? dayTitle(plan) : 'Select a workout'}</option>}
        {plans.map((item) => <option key={item.id} value={item.id}>{dayTitle(item)} · Day {item.day}</option>)}
      </select>
    </label>
  </details>;

  if (!plan || !plan.exercises.length) return <section className="screen screen-nav">
    <div className="screen-toolbar">
      <RoundButton aria-label="Back to Today" onClick={onBack}><ChevronLeft size={20} /></RoundButton>
      <time className="fine" dateTime={date}>{displayDate(date, dateWords)}</time>
    </div>
    <HeadingSentence lead="Train." follow="No strength workout scheduled for this day." />
    {chooseWorkout}
  </section>;

  const slots = plan.exercises.map((original) => {
    const log = effectiveSlot(data, date, plan.id, original);
    const exercise = roster.find((item) => item.id === log.exerciseId) ?? original;
    const index = firstOpenSet(original, log.sets);
    const done = index === undefined && Boolean(log.completion || session?.finishedAt);
    return { original, log, exercise, index, done };
  });
  const next = slots.find((slot) => !slot.done);
  const completed = slots.filter((slot) => slot.done).length;
  const hasSets = slots.some(({ log }) => Object.keys(log.sets).length);
  const slot = selection && slots.find((item) => item.original.id === selection.slotId);
  const sessionBar = session && <div className="workout-session-bar">
    <div className="workout-session-heading">
      <div><strong>{selection ? dayTitle(plan) : session.finishedAt ? 'Workout finished' : 'Workout in progress'}</strong>
        <span>Day {plan.day} · <time dateTime={date}>{displayDate(date, dateWords)}</time></span></div>
      <WorkoutClock key={session.startedAt} startedAt={session.startedAt} finishedAt={session.finishedAt} />
    </div>
  </div>;

  async function open(selected: Selection) {
    if (busy || preview || !onOpen(planId)) return;
    setBusy(true);
    setError('');
    try {
      if (!session) await mutate({ type: 'start', date, planId });
      go(selected);
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await mutate({ type: 'finish', date, planId }); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  if (selection && slot) {
    const { original, log, exercise: selectedExercise, index: openIndex } = slot;
    const finishing = selection.index === undefined && openIndex === undefined;
    const index = selection.index ?? openIndex ?? original.sets - 1;
    const warmup = index === warmupIndex;
    const historyByEquipment = new Map<string, ReturnType<typeof lastPerformance>>();
    const workSets = Object.values(log.sets);
    function rowFor(position: number, logged?: SetLog): LogSetRow {
      const exercise = roster.find((item) => item.id === logged?.exerciseId) ?? selectedExercise;
      const variant = logged?.variant ?? log.variant;
      if (position === warmupIndex) return { index: position, exercise, variant, logged };
      const key = JSON.stringify([exercise.id, variant]);
      if (!historyByEquipment.has(key)) historyByEquipment.set(key, lastPerformance(data, date, exercise.id, variant));
      const history = historyByEquipment.get(key)?.sets;
      const last = history?.[position];
      const fallback = workSets.filter((set) => set.exerciseId === exercise.id && set.variant === variant).at(-1) ?? last ?? history?.at(-1);
      return { index: position, exercise, variant, logged, last, fallback };
    }
    const active = rowFor(index, warmup ? log.warmup : log.sets[index]);
    const { exercise, variant, logged } = active;
    const rows = Array.from({ length: original.sets }, (_, position) => rowFor(position, log.sets[position]));
    if (log.warmup || usesBarbell(selectedExercise, log.variant)) rows.unshift(rowFor(warmupIndex, log.warmup));

    const prescription = { ...exercise, sets: original.sets };
    const activeNumber = slots.indexOf(slot) + 1;
    const commandSlot = { date, planId: plan.id, slotId: original.id };
    const canSwap = exercise.id === original.id && exerciseOptions(exercise.id).length > 0;
    const nextExercise = slots.find((candidate) => candidate !== slot && !candidate.done)?.exercise.name;

    function showRest() {
      if (!exercise.rest) { clearRest(); return; }
      audio.schedule(exercise.rest);
      setRest({ startedAt: Date.now(), seconds: exercise.rest });
    }

    function manualRest() {
      audio.prime();
      showRest();
    }

    async function save(set: SetLog) {
      if (!logged) audio.prime();
      const saved = await mutate(warmup
        ? { type: 'saveWarmup', ...commandSlot, set }
        : { type: 'putSet', ...commandSlot, index, set });
      const entry = effectiveSlot(saved.data, date, planId, original);
      const nextIndex = firstOpenSet(original, entry.sets);
      setSelection({ slotId: original.id, index: nextIndex });
      if (!logged) showRest();
    }

    async function complete(rir: number | null) {
      await mutate({ type: 'completeExercise', ...commandSlot, rir });
      go();
    }

    async function remove() {
      const saved = await mutate(warmup
        ? { type: 'saveWarmup', ...commandSlot, set: null }
        : { type: 'removeSet', ...commandSlot, index });
      const remaining = effectiveSlot(saved.data, date, planId, original);
      go({ slotId: original.id, index: firstOpenSet(original, remaining.sets) ?? Math.max(0, index) });
    }

    return <>
      {sessionBar}
      {rest && <RestTimer key={rest.startedAt} details={rest} audio={audio} close={clearRest} />}
      <div className="workout-exercise" hidden={cues}>
        <LogSet key={original.id} rows={rows} active={active} exerciseNumber={activeNumber} exerciseCount={slots.length}
          workSetCount={original.sets} date={date} data={data} close={() => go()}
          choose={(position) => setSelection({ slotId: original.id, index: position })}
          swap={canSwap ? () => setSwap(true) : undefined} cues={() => { setCues(true); window.scrollTo(0, 0); }}
          rest={manualRest} nextExercise={nextExercise} finishing={finishing} savedRir={log.completion?.rir}
          review={openIndex === undefined ? () => setSelection({ slotId: original.id }) : undefined}
          complete={complete} save={save} remove={remove} />
      </div>
      {cues && <Cues key={original.id} exercise={prescription} variant={variant} date={date} data={data}
        coachText={coachText} note={log.note} modalOpen={swap}
        canSwap={canSwap} openSwap={() => setSwap(true)}
        back={() => { setCues(false); window.scrollTo(0, 0); }}
        saveNote={async (text) => { await mutate({ type: 'note', ...commandSlot, text }); }}
        manualRest={manualRest} />}
      {swap && <SwapSheet exercise={exercise} variant={log.variant} date={date} day={plan.day} data={data}
        coachText={coachText} close={() => setSwap(false)}
        save={async (newVariant, recurring) => {
          await mutate({ type: 'substitute', ...commandSlot, exerciseId: original.id, variant: newVariant, recurring });
          setSelection({ slotId: original.id, index: openIndex });
        }} />}
    </>;
  }

  const actionText = session?.finishedAt ? 'Back to Today' : !session ? 'Start workout' : next ? `Continue with ${next.exercise.name}` : 'Finish workout';
  return <>{sessionBar}<section className="screen screen-nav screen-overview">
    <div className="screen-toolbar">
      <RoundButton aria-label="Back to Today" onClick={onBack}><ChevronLeft size={20} /></RoundButton>
      {!session && <p className="fine">{preview ? 'Preview' : 'Workout date'} · <time dateTime={date}>{displayDate(date, { ...dateWords, year: 'numeric' })}</time></p>}
    </div>
    <HeadingSentence lead={`${dayTitle(plan)}.`} />
    <p className="overview-progress" role="status">{session ? `${completed} of ${slots.length} exercises done` : `Day ${plan.day} · ${slots.length} exercises`}</p>
    <RowStack>
      {slots.map(({ original, exercise, log, index, done }) => {
        const prior = lastPerformance(data, date, exercise.id, log.variant)?.sets.at(-1);
        const upcoming = session && !session.finishedAt && next?.original.id === original.id;
        const lastRir = log.completion?.rir;
        return <Row key={original.id} className={done ? 'workout-row-done' : upcoming ? 'workout-row-next' : ''} current={upcoming}
          label={`${original.sets} × ${shortTarget(exercise)} · ${restLabel(exercise)}`}
          value={`${exercise.name}${log.variant ? ` · ${canonicalVariant(exercise.id, log.variant)}` : ''}`}
          onClick={preview || busy || !session ? undefined : () => void open({ slotId: original.id, index })}
          end={done ? <Pill><Check size={16} aria-hidden="true" />{lastRir == null ? 'Done' : `Done · RIR ${rirDisplay(lastRir)}`}</Pill>
            : upcoming ? <Pill className="pill-dark">Up next</Pill> : prior ? <Pill>Last {compactSet(prior)}</Pill> : undefined} />;
      })}
    </RowStack>
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="screen-actions">
      <PrimaryButton disabled={busy} onClick={() => {
        if (preview) onLogToday(plan.id);
        else if (session?.finishedAt) onBack();
        else if (next) void open({ slotId: next.original.id, index: next.index });
        else void finish();
      }}>{busy ? 'Saving…' : preview ? 'Log this workout today' : actionText}</PrimaryButton>
    </div>
    {chooseWorkout}
    {hasSets && !session?.finishedAt && next && <details className="disclosure supplementary">
      <summary>Workout options</summary>
      <Pill onClick={() => void finish()} disabled={busy}>Finish workout early</Pill>
    </details>}
  </section></>;
}
