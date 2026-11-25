'use client';

import { Check, ChevronLeft, Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { compactSet, displayDate, lastPerformance, restDisplay } from '@/lib/insights';
import { effectiveSlot, firstOpenSet, sessionKey, type SetLog, type TrainingData } from '@/lib/model';
import { canonicalVariant, dayTitle, type Exercise } from '@/lib/programme';
import { programmeExercises, weekPlans, workoutPlan } from '@/lib/weeks';
import { LogSet, usesBarbell, warmupIndex, type LogSetRow } from './log-set';
import { RestTimer, useRestAudio, type RestDetails } from './rest-timer';
import { HeadingSentence, Pill, PrimaryButton, RoundButton, Row, RowStack } from './ui';
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

function Cues({ exercise, variant, coachText, back }: {
  exercise: Exercise; variant: string; coachText?: string; back: () => void;
}) {
  const cues = exercise.cue.split(/(?:[.!?]\s+|,\s+(?=[a-z])|\s+-\s+)/i).filter(Boolean);

  return <section className="screen screen-cues">
    <div className="screen-toolbar">
      <RoundButton aria-label="Back to sets" onClick={back}><ChevronLeft size={20} /></RoundButton>
    </div>
    <HeadingSentence lead={`${exercise.name}.`} follow={`${variant ? `${canonicalVariant(exercise.id, variant)}, ` : ''}${exercise.sets} sets of ${shortTarget(exercise)}, ${restLabel(exercise)}.`} />
    <div className="cues-content">
      <section className="cues-block" aria-label="Brenna’s cues">
        <h2 className="fine">Brenna’s cues</h2>
        {cues.length ? <ul>{cues.map((cue, index) => <li key={index}>{cue[0].toUpperCase() + cue.slice(1)}</li>)}</ul>
          : <p>No cues in your programme yet.</p>}
      </section>
      {coachText && <Row label="Unsure about form?" value="Send Brenna a video" end={<Pill href={coachText}>Text</Pill>} />}
    </div>
    <div className="screen-actions">
      <PrimaryButton onClick={back}>Back to sets</PrimaryButton>
    </div>
  </section>;
}

type Selection = { slotId: string; index?: number };

export function Workout({ date, today, planId, onPlan, onOpen, onLogToday, data, coachText, mutate, onBack, setFocused }: {
  date: string; today: string; planId: string; onPlan: (id: string) => void; data: TrainingData; mutate: Mutate;
  onOpen: (id: string) => boolean; onLogToday: (id: string) => void;
  coachText?: string; onBack: () => void; setFocused: (focused: boolean) => void;
}) {
  const plans = weekPlans(data, date);
  const plan = workoutPlan(data, date, planId);
  const session = plan && data.sessions[sessionKey(date, plan.id)];
  const roster = programmeExercises(data, plan ? [plan, ...plans] : plans);
  const [selection, setSelection] = useState<Selection>();
  const [cues, setCues] = useState(false);
  const [rest, setRest] = useState<RestDetails>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const audio = useRestAudio();
  const preview = date > today;

  function clearRest() {
    audio.cancel();
    setRest(undefined);
  }

  function go(next?: Selection) {
    clearRest();
    setSelection(next);
    setFocused(!!next);
    setCues(false);
    setConfirmingDiscard(false);
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
  const ready = Boolean(session && !session.finishedAt && !next);
  const sessionBar = session && <div className="workout-session-bar">
    <div className="workout-session-heading">
      <div><strong>{selection ? dayTitle(plan) : session.finishedAt ? 'Workout finished' : ready ? 'Ready to submit' : 'Workout in progress'}</strong>
        <span>Day {plan.day} · <time dateTime={date}>{displayDate(date, dateWords)}</time></span></div>
      <WorkoutClock key={session.startedAt} startedAt={session.startedAt} finishedAt={session.finishedAt} />
    </div>
  </div>;

  async function begin() {
    if (busy || preview || session || !onOpen(planId)) return;
    setBusy(true);
    setError('');
    try { await mutate({ type: 'start', date, planId }); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  function open(selected: Selection) {
    if (busy || preview || !session || !onOpen(planId)) return;
    setConfirmingDiscard(false);
    go(selected);
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await mutate({ type: 'finish', date, planId }); setConfirmingDiscard(false); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  async function discard() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await mutate({ type: 'discard', date, planId });
      onBack();
    } catch (reason) { setError(errorMessage(reason)); setBusy(false); }
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
    const nextExercise = slots.find((candidate) => candidate !== slot && !candidate.done)?.exercise.name;
    const history = lastPerformance(data, date, exercise.id, variant)?.sets;

    function openRest(upcoming: string) {
      if (!exercise.rest) return;
      audio.schedule(exercise.rest);
      const previous = history?.at(-1);
      setRest({ startedAt: Date.now(), seconds: exercise.rest, upcoming, last: previous ? `Last ${compactSet(previous)}` : undefined });
    }

    async function save(set: SetLog) {
      if (!logged) audio.prime();
      const saved = await mutate(warmup
        ? { type: 'saveWarmup', ...commandSlot, set }
        : { type: 'putSet', ...commandSlot, index, set });
      const entry = effectiveSlot(saved.data, date, planId, original);
      const nextIndex = firstOpenSet(original, entry.sets);
      setSelection({ slotId: original.id, index: nextIndex });
      if (!logged && !warmup) openRest(nextIndex == null ? (nextExercise ?? 'Submit record') : `set ${nextIndex + 1} of ${original.sets}`);
    }

    async function complete() {
      await mutate({ type: 'completeExercise', ...commandSlot, rir: null });
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
          cues={() => { setCues(true); window.scrollTo(0, 0); }}
          rest={exercise.rest > 0 ? () => { audio.prime(); openRest(warmup || index + 1 >= original.sets ? (nextExercise ?? 'Submit record') : `set ${index + 2} of ${original.sets}`); } : undefined}
          nextExercise={nextExercise} finishing={finishing}
          review={openIndex === undefined ? () => setSelection({ slotId: original.id }) : undefined}
          complete={complete} save={save} remove={remove} />
      </div>
      {cues && <Cues key={original.id} exercise={prescription} variant={variant} coachText={coachText}
        back={() => { setCues(false); window.scrollTo(0, 0); }} />}
    </>;
  }

  const actionText = session?.finishedAt ? 'Back to Today' : !session ? 'Start workout' : next ? `Continue with ${next.exercise.name}` : 'Submit record';
  const discardPrompt = <>
    <p className="fine">Are you sure? Discarding deletes this workout, including the sets and the gym time.</p>
    <PrimaryButton onClick={() => void discard()} disabled={busy}>{busy ? 'Discarding…' : 'Yes, discard'}</PrimaryButton>
    <PrimaryButton className="button-quiet" onClick={() => setConfirmingDiscard(false)} disabled={busy}>Keep workout</PrimaryButton>
  </>;
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
        return <Row key={original.id} className={done ? 'workout-row-done' : upcoming ? 'workout-row-next' : ''} current={upcoming}
          label={`${original.sets} × ${shortTarget(exercise)} · ${restLabel(exercise)}`}
          value={`${exercise.name}${log.variant ? ` · ${canonicalVariant(exercise.id, log.variant)}` : ''}`}
          onClick={preview || busy || !session ? undefined : () => void open({ slotId: original.id, index })}
          end={done ? <Pill><Check size={16} aria-hidden="true" />Done</Pill>
            : upcoming ? <Pill className="pill-dark">Up next</Pill> : prior ? <Pill>Last {compactSet(prior)}</Pill> : undefined} />;
      })}
    </RowStack>
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="screen-actions">
      {confirmingDiscard ? discardPrompt : <>
        <PrimaryButton disabled={busy} onClick={() => {
          if (preview) onLogToday(plan.id);
          else if (session?.finishedAt) onBack();
          else if (!session) void begin();
          else if (next) void open({ slotId: next.original.id, index: next.index });
          else void finish();
        }}>{busy ? 'Saving…' : preview ? 'Log this workout today' : actionText}</PrimaryButton>
        {ready && <PrimaryButton className="danger-quiet" onClick={() => setConfirmingDiscard(true)} disabled={busy}>Discard record</PrimaryButton>}
      </>}
    </div>
    {!confirmingDiscard && chooseWorkout}
    {!confirmingDiscard && session && !session.finishedAt && next && <details className="disclosure supplementary">
      <summary>Workout options</summary>
      {hasSets && <Pill onClick={() => void finish()} disabled={busy}>Submit record early</Pill>}
      <Pill onClick={() => setConfirmingDiscard(true)} disabled={busy}>Discard record</Pill>
    </details>}
  </section></>;
}
