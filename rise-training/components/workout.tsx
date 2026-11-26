'use client';

import { Check, ChevronLeft, Clock3, Play, Square } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { addDays, compactSet, displayDate, lastPerformance, ordinal, restDisplay, scheduledProgrammeDay, weekStart, workoutElapsedMs, workoutsDoneThisWeek, workoutsThisWeek } from '@/lib/insights';
import { effectiveSlot, extraIndex, extraKindFor, extraKinds, extraShown, firstOpenSet, sessionKey, workingSetCount, type ExtraKind, type Session, type SetLog, type TrainingData } from '@/lib/model';
import { revisionCovering, type ProgrammeSnapshot } from '@/lib/prescription';
import { canonicalVariant, dayKind, dayTitle, prescribedReps, programmeDays, type Exercise, type Plan } from '@/lib/programme';
import { programmeExercises, weekPlans, workoutPlan } from '@/lib/weeks';
import { LogSet, usesBarbell, type LogSetRow } from './log-set';
import { RestTimer, useRestAudio, type RestDetails } from './rest-timer';
import { BottomSheet, HeadingSentence, Pill, PrimaryButton, RoundButton, Row, RowStack } from './ui';
import type { Mutate } from './training-app';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Could not save. Try again.';
const restLabel = (exercise: Exercise) => exercise.rest ? `rest ${restDisplay(exercise.rest)}${exercise.restNote ? ` ${exercise.restNote}` : ''}` : 'no rest prescribed';
const effortMark = (exercise: Exercise) => exercise.rirTarget != null ? ` · RIR ${exercise.rirTarget >= 3 ? '3+' : exercise.rirTarget}` : exercise.rpeTarget != null ? ` · RPE ${exercise.rpeTarget}` : '';
function dayOn(programme: ProgrammeSnapshot, data: TrainingData, date: string) {
  return revisionCovering(programme.state, date)?.days[scheduledProgrammeDay(date, data) - 1] ?? programmeDays[scheduledProgrammeDay(date, data) - 1];
}
const shortTarget = (exercise: Exercise) => exercise.target.replace(/ reps\b/, '');
const lastMark = (set: SetLog) => compactSet(set).replace(' kg', '');
function prescribedLoad(exercise: Exercise) {
  const reps = prescribedReps(exercise);
  if (exercise.coachKg != null && reps != null) return `${exercise.coachKg} kg × ${reps}`;
  if (reps != null) return `${reps} reps`;
  return exercise.coachWeight || exercise.target || undefined;
}
const dateWords = { weekday: 'long', day: 'numeric', month: 'short' } as const;
const compactName = (name: string) => /^[A-Z]{2,}$/.test(name)
  ? name : name.replace(/^Forearm /i, '').replace(/ (with dumbbells|on cable)$/i, '').toLowerCase();

function planBlurb(plan: Plan) {
  const names = plan.exercises.map((exercise) => compactName(exercise.name)).join(', ').replace(/^./, (letter) => letter.toUpperCase());
  const sets = plan.exercises.reduce((sum, item) => sum + item.sets, 0);
  return `${names}. ${sets} sets.`;
}

function LoggedWorkout({ plan, session, data, programme, today, onBack, onPreview }: {
  plan: Plan; session: Session; data: TrainingData; programme: ProgrammeSnapshot; today: string;
  onBack: () => void; onPreview: (planId: string, date: string) => void;
}) {
  const count = workoutsThisWeek(data, session.date);
  const thisWeek = weekStart(session.date) === weekStart(today);
  const line = thisWeek
    ? `Your ${ordinal(count)} workout this week.`
    : `Your ${ordinal(count)} workout in the week of ${displayDate(weekStart(session.date))}.`;
  const tomorrow = addDays(today, 1);
  const tomorrowDay = scheduledProgrammeDay(tomorrow, data);
  const tomorrowDefinition = dayOn(programme, data, tomorrow);
  const tomorrowPlan = weekPlans(data, tomorrow, undefined, programme).find((item) => item.day === tomorrowDay);
  let later: { date: string; plan: Plan } | undefined;
  if (!tomorrowPlan) {
    for (let offset = 1; offset < 7; offset += 1) {
      const date = addDays(tomorrow, offset);
      const day = scheduledProgrammeDay(date, data);
      const next = weekPlans(data, date, undefined, programme).find((item) => item.day === day);
      if (next) { later = { date, plan: next }; break; }
    }
  }
  const tomorrowKind = dayKind(tomorrowDefinition.type);
  const tomorrowMark = tomorrowKind === 'cardio' ? 'Cardio' : tomorrowKind === 'rest' ? 'Rest' : `Day ${tomorrowDay}`;
  const tomorrowTitle = tomorrowPlan ? dayTitle(tomorrowPlan) : tomorrowDefinition.title;
  const tomorrowDetail = tomorrowPlan
    ? planBlurb(tomorrowPlan)
    : tomorrowDefinition.guidance?.[0] ?? tomorrowDefinition.options?.join(' · ') ?? tomorrowDefinition.note;
  const preview = tomorrowPlan
    ? { date: tomorrow, plan: tomorrowPlan, label: 'Preview tomorrow' }
    : later && { date: later.date, plan: later.plan, label: `Preview ${displayDate(later.date, { weekday: 'long' })}` };

  return <section className="screen screen-nav screen-logged">
    <div role="status">
      <HeadingSentence id="logged-heading" lead="Logged." follow={line} />
    </div>
    <p className="logged-meta">
      <span>{dayTitle(plan)} · Day {plan.day}</span>
      <WorkoutClock session={session} />
    </p>
    <article className="logged-next" aria-label="Tomorrow">
      <p className="fine">Tomorrow · {displayDate(tomorrow, { weekday: 'long' })} · {tomorrowMark}</p>
      <h2>{tomorrowTitle}</h2>
      {tomorrowDetail && <p className="logged-detail">{tomorrowDetail}</p>}
      {later && <p className="logged-again">Next workout is {displayDate(later.date, { weekday: 'long' })} · {dayTitle(later.plan)}.</p>}
    </article>
    <div className="screen-actions">
      <PrimaryButton onClick={onBack}>Back to Today</PrimaryButton>
      {preview && <PrimaryButton className="button-quiet" onClick={() => onPreview(preview.plan.id, preview.date)}>{preview.label}</PrimaryButton>}
    </div>
  </section>;
}

function WorkoutClock({ session }: { session: Pick<Session, 'startedAt' | 'finishedAt' | 'pausedAt' | 'pausedMs'> }) {
  const running = !session.finishedAt && !session.pausedAt;
  const [now, setNow] = useState<number>();
  useLayoutEffect(() => {
    if (!running) return;
    function tick() { setNow(Date.now()); }
    tick();
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [running]);
  const seconds = Math.floor(workoutElapsedMs(session, now ?? Date.parse(session.startedAt)) / 1_000);
  const hours = Math.floor(seconds / 3_600);
  const elapsed = hours ? `${hours}:${restDisplay(seconds % 3_600).padStart(5, '0')}` : restDisplay(seconds);
  const stopped = Boolean(session.pausedAt);
  const label = session.finishedAt ? 'Total workout time' : stopped ? 'Workout clock stopped' : 'Elapsed workout time';
  return <span className={`workout-clock${stopped ? ' workout-clock-paused' : ''}`} role="timer" aria-label={label} aria-live="off">
    <Clock3 size={16} aria-hidden="true" />
    {elapsed}
  </span>;
}

function Cues({ exercise, variant, back }: {
  exercise: Exercise; variant: string; back: () => void;
}) {
  const cues = exercise.cue.split(/(?:[.!?]\s+|,\s+(?=[a-z])|\s+-\s+)/i).filter(Boolean);

  return <section className="screen screen-cues">
    <div className="screen-toolbar">
      <RoundButton aria-label="Back to sets" onClick={back}><ChevronLeft size={20} /></RoundButton>
    </div>
    <HeadingSentence lead={`${exercise.name}.`} follow={`${variant ? `${canonicalVariant(exercise.id, variant)}, ` : ''}${exercise.warmupSets ? `${exercise.warmupSets} warm-up, ` : ''}${exercise.sets} sets of ${shortTarget(exercise)}, ${restLabel(exercise)}${effortMark(exercise)}.`} />
    <div className="cues-content">
      <section className="cues-block" aria-label="Brenna’s cues">
        <h2 className="fine">Technique</h2>
        {cues.length ? <ul>{cues.map((cue, index) => <li key={index}>{cue[0].toUpperCase() + cue.slice(1)}</li>)}</ul>
          : <p>No technique notes in the programme yet.</p>}
        {exercise.video && <a className="pill cue-video" href={exercise.video} target="_blank" rel="noopener noreferrer" aria-label="Form video, opens in a new tab">Form video</a>}
      </section>
      {exercise.coachNote && <section className="cues-block" aria-label="Coaching note"><h2 className="fine">Coaching note</h2><p>{exercise.coachNote}</p></section>}
      {exercise.progression && <section className="cues-block" aria-label="Progression"><h2 className="fine">Progression</h2><p>{exercise.progression}</p></section>}
    </div>
    <div className="screen-actions">
      <PrimaryButton onClick={back}>Back to sets</PrimaryButton>
    </div>
  </section>;
}

type Selection = { slotId: string; index?: number };

export function Workout({ date, today, planId, onPlan, onOpen, onLogToday, data, programme, mutate, onBack, onPreview, setFocused }: {
  date: string; today: string; planId: string; onPlan: (id: string) => void; data: TrainingData; programme: ProgrammeSnapshot; mutate: Mutate;
  onOpen: (id: string) => boolean; onLogToday: (id: string) => void;
  onBack: () => void; onPreview: (planId: string, date: string) => void; setFocused: (focused: boolean) => void;
}) {
  const plans = weekPlans(data, date, undefined, programme);
  const plan = workoutPlan(data, date, planId, programme);
  const session = plan && data.sessions[sessionKey(date, plan.id)];
  const roster = programmeExercises(data, plan ? [plan, ...plans] : plans);
  const [selection, setSelection] = useState<Selection>();
  const [cues, setCues] = useState(false);
  const [rest, setRest] = useState<RestDetails>();
  const [restMini, setRestMini] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<'discard' | 'again'>();
  const [showLogged, setShowLogged] = useState(false);
  const opened = useRef(false);
  if (session && !session.finishedAt) opened.current = true;
  if (opened.current && session?.finishedAt && !showLogged) setShowLogged(true);
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
    setConfirming(undefined);
    window.scrollTo(0, 0);
  }

  function ask(action: 'discard') {
    if (busy || !session || session.finishedAt) return;
    const leaving = action === 'discard' && selection !== undefined;
    if (leaving) {
      clearRest();
      setSelection(undefined);
      setFocused(false);
      setCues(false);
      window.scrollTo(0, 0);
    }
    setConfirming(action);
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

  if (showLogged && session?.finishedAt) {
    return <LoggedWorkout plan={plan} session={session} data={data} programme={programme} today={today} onBack={onBack} onPreview={onPreview} />;
  }

  const slots = plan.exercises.map((original) => {
    const log = effectiveSlot(data, date, plan.id, original);
    const exercise = roster.find((item) => item.id === log.exerciseId) ?? original;
    const index = firstOpenSet(original, log);
    const done = index === undefined && Boolean(log.completion || session?.finishedAt);
    return { original, log, exercise, index, done };
  });
  const next = slots.find((slot) => !slot.done);
  const completed = slots.filter((slot) => slot.done).length;
  const hasSets = slots.some(({ log }) => Object.keys(log.sets).length);
  const slot = selection && slots.find((item) => item.original.id === selection.slotId);
  const ready = Boolean(session && !session.finishedAt && !next);
  const stopped = Boolean(session?.pausedAt);
  const sessionBar = session && <div className="workout-session-bar">
    <div className="workout-session-heading">
      <div><strong>{selection ? dayTitle(plan) : session.finishedAt ? 'Workout finished' : stopped ? 'Workout stopped' : ready ? 'Ready to submit' : 'Workout in progress'}</strong>
        <span>Day {plan.day} · <time dateTime={date}>{displayDate(date, dateWords)}</time></span></div>
      <div className="workout-session-time">
        <WorkoutClock key={session.startedAt} session={session} />
        {!session.finishedAt && <button type="button" className="workout-stop" aria-pressed={stopped}
          aria-label={stopped ? 'Resume clock' : 'Stop clock'} disabled={busy}
          onClick={() => void setClock(!stopped)}>
          {stopped
            ? <Play size={14} strokeWidth={2} aria-hidden="true" />
            : <Square size={11} fill="currentColor" strokeWidth={0} aria-hidden="true" />}
        </button>}
      </div>
    </div>
    {selection && stopped && confirming !== 'discard' && <button type="button" className="workout-discard" onClick={() => ask('discard')} disabled={busy}>Discard workout</button>}
    {selection && error && <p className="notice" role="alert">{error}</p>}
  </div>;

  async function begin() {
    if (busy || preview || session || !onOpen(planId)) return;
    setConfirming(undefined);
    setBusy(true);
    setError('');
    try { await mutate({ type: 'start', date, planId }); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  function open(selected: Selection) {
    if (busy || preview || confirming || !session || !onOpen(planId)) return;
    go(selected);
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await mutate({ type: 'finish', date, planId }); setConfirming(undefined); }
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

  async function setClock(running: boolean) {
    if (busy || !session || session.finishedAt || running === !session.pausedAt) return;
    setBusy(true);
    setError('');
    try { await mutate({ type: running ? 'resumeClock' : 'pauseClock', date, planId }); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(false); }
  }

  if (selection && slot) {
    const { original, log, exercise: selectedExercise, index: openIndex } = slot;
    const count = workingSetCount(original.sets, log);
    const finishing = selection.index === undefined && openIndex === undefined;
    const index = selection.index ?? openIndex ?? count - 1;
    const kind = extraKindFor(index);
    const historyByEquipment = new Map<string, ReturnType<typeof lastPerformance>>();
    const workSets = Object.values(log.sets);
    function rowFor(position: number, logged?: SetLog): LogSetRow {
      const exercise = roster.find((item) => item.id === logged?.exerciseId) ?? selectedExercise;
      const variant = logged?.variant ?? log.variant;
      const key = JSON.stringify([exercise.id, variant]);
      if (!historyByEquipment.has(key)) historyByEquipment.set(key, lastPerformance(data, date, exercise.id, variant));
      const history = historyByEquipment.get(key)?.sets;
      const same = workSets.filter((set) => set.exerciseId === exercise.id && set.variant === variant);
      if (position < 0) return { index: position, exercise, variant, logged, fallback: same.at(-1) ?? history?.at(-1) };
      const last = history?.[position];
      return { index: position, exercise, variant, logged, last, fallback: same.at(-1) ?? last ?? history?.at(-1) };
    }
    const active = rowFor(index, kind ? log[kind] : log.sets[index]);
    const { exercise, variant, logged } = active;
    const barbell = usesBarbell(selectedExercise, log.variant);
    const showWarmup = barbell || (original.warmupSets ?? 0) > 0;
    const rows = [
      ...extraKinds.flatMap((item) => extraShown(log, item, showWarmup) ? [rowFor(extraIndex[item], log[item])] : []),
      ...Array.from({ length: count }, (_, position) => rowFor(position, log.sets[position])),
    ];

    const prescription = {
      ...original, ...exercise, sets: count, cue: exercise.cue || original.cue,
      coachNote: exercise.coachNote || original.coachNote, progression: exercise.progression || original.progression,
      rirTarget: exercise.rirTarget ?? original.rirTarget, rpeTarget: exercise.rpeTarget ?? original.rpeTarget,
      warmupSets: exercise.warmupSets ?? original.warmupSets,
      video: exercise.video || (exercise.id === original.id ? original.video : undefined),
    };
    const activeNumber = slots.indexOf(slot) + 1;
    const commandSlot = { date, planId: plan.id, slotId: original.id };
    const nextExercise = slots.find((candidate) => candidate !== slot && !candidate.done)?.exercise.name;
    const history = lastPerformance(data, date, exercise.id, variant)?.sets;

    function openRest(upcoming: string, justLogged?: { number: number; set: SetLog }) {
      if (!exercise.rest) return;
      audio.schedule(exercise.rest);
      const continuing = upcoming.startsWith('set ');
      const nextSlot = slots.find((candidate) => candidate !== slot && !candidate.done);
      const focus = continuing ? exercise : nextSlot?.exercise;
      const previous = continuing
        ? history?.at(-1)
        : focus ? lastPerformance(data, date, focus.id, nextSlot?.log.variant ?? '')?.sets.at(-1) : undefined;
      const sample = continuing ? (justLogged?.set ?? logged ?? active.fallback) : undefined;
      const loggedNumber = justLogged?.number ?? (logged && !kind ? index + 1 : undefined);
      const pair = sample?.seconds != null ? `${sample.seconds}s`
        : sample ? `${sample.weight == null ? '' : `${sample.weight} × `}${sample.reps ?? '—'}${sample.perSide ? `/${sample.perSide}` : ''}` : '';
      setRestMini(false);
      setRest({
        startedAt: Date.now(),
        seconds: exercise.rest,
        logged: loggedNumber && pair ? `Set ${loggedNumber} logged · ${pair}` : undefined,
        upcoming,
        next: sample ? compactSet(sample) : focus && upcoming !== 'Submit record' ? prescribedLoad(focus) : undefined,
        last: previous ? lastMark(previous) : undefined,
      });
    }

    async function save(set: SetLog) {
      if (!logged) audio.prime();
      const saved = await mutate(kind
        ? { type: 'saveWarmup', ...commandSlot, kind, set }
        : { type: 'putSet', ...commandSlot, index, set });
      const entry = effectiveSlot(saved.data, date, planId, original);
      const nextIndex = firstOpenSet(original, entry);
      setSelection({ slotId: original.id, index: nextIndex });
      if (!logged && !kind) openRest(nextIndex == null ? (nextExercise ?? 'Submit record') : `set ${nextIndex + 1} of ${count}`, { number: index + 1, set });
    }

    async function complete() {
      await mutate({ type: 'completeExercise', ...commandSlot, rir: null });
      go();
    }

    async function remove() {
      const saved = await mutate(kind
        ? { type: 'saveWarmup', ...commandSlot, kind, set: null }
        : { type: 'removeSet', ...commandSlot, index });
      const remaining = effectiveSlot(saved.data, date, planId, original);
      setSelection({ slotId: original.id, index: firstOpenSet(original, remaining) ?? Math.max(0, index) });
    }

    async function add(next?: ExtraKind) {
      const saved = await mutate(next ? { type: 'addSet', ...commandSlot, kind: next } : { type: 'addSet', ...commandSlot });
      const entry = effectiveSlot(saved.data, date, planId, original);
      setSelection({ slotId: original.id, index: next ? extraIndex[next] : workingSetCount(original.sets, entry) - 1 });
    }

    const chosen = selection;
    async function drop(target: { index?: number; kind?: ExtraKind }) {
      const saved = await mutate({ type: 'dropSet', ...commandSlot, ...target });
      const entry = effectiveSlot(saved.data, date, planId, original);
      const nextCount = workingSetCount(original.sets, entry);
      const open = firstOpenSet(original, entry);
      if (target.kind) {
        const current = chosen.index;
        setSelection({ slotId: original.id, index: current != null && extraKindFor(current) === target.kind ? open : current });
        return;
      }
      const position = target.index ?? 0;
      if (chosen.index == null || chosen.index < 0 || open == null) {
        setSelection({ slotId: original.id, index: open });
        return;
      }
      const nextIndex = chosen.index > position ? chosen.index - 1 : Math.min(chosen.index, nextCount - 1);
      setSelection({ slotId: original.id, index: nextIndex });
    }

    return <div className="workout-logging" data-rest={rest ? restMini ? 'mini' : 'open' : undefined}>
      {sessionBar}
      {rest && <RestTimer key={rest.startedAt} details={rest} audio={audio} close={clearRest} onMini={setRestMini} />}
      <div className="workout-exercise" hidden={cues}>
        <LogSet key={original.id} rows={rows} active={active} exerciseNumber={activeNumber} exerciseCount={slots.length}
          resting={rest ? restMini ? 'mini' : 'open' : undefined}
          workSetCount={count} date={date} data={data} close={() => go()}
          choose={(position) => setSelection({ slotId: original.id, index: position })}
          cues={() => { setCues(true); window.scrollTo(0, 0); }}
          rest={exercise.rest > 0 ? () => { audio.prime(); openRest(kind || index + 1 >= count ? (nextExercise ?? 'Submit record') : `set ${index + 2} of ${count}`); } : undefined}
          nextExercise={nextExercise} finishing={finishing}
          review={openIndex === undefined ? () => setSelection({ slotId: original.id }) : undefined}
          complete={complete} save={save} remove={remove} add={add} drop={drop}
          note={log.note ?? ''} saveNote={async (text) => { await mutate({ type: 'note', ...commandSlot, text }); }} />
      </div>
      {cues && <Cues key={original.id} exercise={prescription} variant={variant}
        back={() => { setCues(false); window.scrollTo(0, 0); }} />}
    </div>;
  }

  const repeated = !preview && !session ? workoutsDoneThisWeek(data, today).done.get(plan.day) : undefined;
  const actionText = session?.finishedAt ? 'Back to Today' : !session ? 'Start workout' : next ? `Continue with ${next.exercise.name}` : 'Submit record';
  const prompt = confirming === 'discard'
    ? { text: 'Are you sure? Discarding deletes this workout, including the sets and the gym time.', confirm: 'Yes, discard', pending: 'Discarding…', cancel: 'Keep workout', run: discard }
    : undefined;
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
          label={<>{`${original.warmupSets ? `${original.warmupSets} warm-up · ` : ''}${workingSetCount(original.sets, log)} × ${shortTarget(exercise)} · ${restLabel(exercise)}${effortMark(original)}`}
            {(log.note ?? '').trim() && <span className="exercise-note">{log.note.trim()}</span>}</>}
          value={`${exercise.name}${log.variant ? ` · ${canonicalVariant(exercise.id, log.variant)}` : ''}`}
          onClick={preview || busy || confirming || !session ? undefined : () => void open({ slotId: original.id, index })}
          end={done ? <Pill><Check size={16} aria-hidden="true" />Done</Pill>
            : upcoming ? <Pill className="pill-dark">Up next</Pill> : prior ? <Pill>Last {compactSet(prior)}</Pill> : undefined} />;
      })}
    </RowStack>
    {error && !confirming && <p className="notice" role="alert">{error}</p>}
    <div className="screen-actions">
      {prompt ? <>
        <p className="fine">{prompt.text}</p>
        <PrimaryButton onClick={() => void prompt.run()} disabled={busy}>{busy ? prompt.pending : prompt.confirm}</PrimaryButton>
        <PrimaryButton className="button-quiet" onClick={() => setConfirming(undefined)} disabled={busy}>{prompt.cancel}</PrimaryButton>
      </> : confirming !== 'discard' && <>
        <PrimaryButton disabled={busy} onClick={() => {
          if (preview) onLogToday(plan.id);
          else if (session?.finishedAt) onBack();
          else if (!session) { if (repeated) setConfirming('again'); else void begin(); }
          else if (next) void open({ slotId: next.original.id, index: next.index });
          else void finish();
        }}>{busy ? 'Saving…' : preview ? 'Log this workout today' : actionText}</PrimaryButton>
        {(ready || stopped) && <PrimaryButton className="danger-quiet" onClick={() => ask('discard')} disabled={busy}>Discard workout</PrimaryButton>}
      </>}
    </div>
    {!confirming && chooseWorkout}
    {confirming === 'again' && repeated && <BottomSheet className="again-sheet" labelId="workout-again-heading" onClose={() => setConfirming(undefined)}>
      <HeadingSentence id="workout-again-heading" className="heading-small" lead={`Do Workout ${plan.day} again?`} follow={`You did ${dayTitle(plan).toLowerCase()} on ${repeated.weekdayLong}.`} />
      <p className="again-note">It'll be logged as an extra session. Your week still counts it once.</p>
      <PrimaryButton onClick={() => void begin()}>Do again</PrimaryButton>
      <PrimaryButton className="button-muted" onClick={() => setConfirming(undefined)}>Pick another</PrimaryButton>
    </BottomSheet>}
    {!confirming && session && !session.finishedAt && next && (hasSets || !stopped) && <details className="disclosure supplementary">
      <summary>Workout options</summary>
      {hasSets && <Pill onClick={() => void finish()} disabled={busy}>Submit record early</Pill>}
      {!stopped && <Pill onClick={() => ask('discard')} disabled={busy}>Discard workout</Pill>}
    </details>}
  </section></>;
}
