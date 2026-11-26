'use client';

import Image from 'next/image';
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { addDays, displayDate, scheduledProgrammeDay, todayKey, weekStart, workoutsDoneThisWeek } from '@/lib/insights';
import { orderedSlots, sessionKey, type Session, type TrainingData } from '@/lib/model';
import { dayKind, dayTitle, type Plan } from '@/lib/programme';
import { contentBefore, revisionCovering, type ProgrammeDay, type ProgrammeSnapshot } from '@/lib/prescription';
import { availableWeek, weekPlans, workoutPlan } from '@/lib/weeks';
import { WeeklyCheckInLink } from './weekly-check-in';
import { BottomSheet, ChipGroup, HeadingSentence, PhotoHero, Pill, PrimaryButton, RoundButton, Row, RowStack } from './ui';
import type { Mutate } from './training-app';

type HomeLayout = 'grid' | 'week';
const layoutKey = 'rise-home-layout';
let rememberedLayout: HomeLayout = 'grid';

function readLayout(): HomeLayout {
  if (typeof localStorage === 'undefined') return 'grid';
  try { return localStorage.getItem(layoutKey) === 'week' ? 'week' : 'grid'; }
  catch { return 'grid'; }
}

function HomeLayoutSwitch({ layout, onLayout }: { layout: HomeLayout; onLayout: (layout: HomeLayout) => void }) {
  const week = layout === 'week';
  const Icon = week ? LayoutGrid : CalendarDays;
  return <button type="button" className="home-layout-icon" onClick={() => onLayout(week ? 'grid' : 'week')}
    aria-label={week ? 'Show workout grid' : 'Show week layout'}>
    <Icon size={18} strokeWidth={1.8} />
  </button>;
}

const workoutPhoto: Record<number, string> = {
  1: '/images/workouts/w1-lower-glass.webp',
  2: '/images/workouts/w2-upper-shoulder.webp',
  3: '/images/workouts/w3-rest-swim.webp',
  4: '/images/workouts/w4-lower-night-water.webp',
  5: '/images/workouts/w5-upper-back.webp',
  6: '/images/workouts/w6-cardio-thermal.webp',
  7: '/images/workouts/w7-rest-blur.webp',
};

function homeDate(today: string) {
  return displayDate(today, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/,/g, '');
}

type DayPhoto = { src: string; position?: string };
const originals: DayPhoto[] = ['glass', 'shoulder', 'swim', 'liquid', 'blur', 'thermal', 'night'].map((name) => ({ src: `${name}.webp` }));
const added: DayPhoto[] = [
  { src: 'track.webp', position: '28% 48%' },
  { src: 'linen.webp', position: '50% 40%' },
  { src: 'studio.webp', position: '64% 46%' },
  { src: 'field.jpg', position: '48% 36%' },
];

function mixPhotos(weekOf: string) {
  let state = [...weekOf].reduce((sum, char) => (Math.imul(sum, 33) + char.charCodeAt(0)) >>> 0, 7);
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const draw = (items: DayPhoto[], count: number) => {
    const pool = [...items];
    return Array.from({ length: count }, () => pool.splice(Math.floor(next() * pool.length), 1)[0]);
  };
  return draw([...draw(added, 3), ...draw(originals, 4)], 7);
}

const compactName = (name: string) => /^[A-Z]{2,}$/.test(name)
  ? name : name.replace(/^Forearm /i, '').replace(/ (with dumbbells|on cable)$/i, '').toLowerCase();

function sessionExerciseNames(plan: Plan, session?: Session) {
  const recorded = session ? orderedSlots(session) : [];
  const seen = new Set(recorded.map(([id]) => id));
  const names = recorded.flatMap(([id]) => {
    const name = plan.exercises.find((exercise) => exercise.id === id)?.name;
    return name ? [name] : [];
  });
  return [...names, ...plan.exercises.filter((exercise) => !seen.has(exercise.id)).map((exercise) => exercise.name)];
}

function dayOn(programme: ProgrammeSnapshot, data: TrainingData, date: string) {
  const number = scheduledProgrammeDay(date, data);
  const days = contentBefore(programme.state, date).days;
  return days.find((day) => day.day === number) ?? days[number - 1];
}

function dayLines(day: ProgrammeDay) {
  if (day.exercises.length) return day.exercises.map((exercise) => exercise.name);
  return dayKind(day.type) === 'cardio' ? day.options ?? [] : day.guidance ?? [];
}

function GridHome({ today, data, programme, initials, openWorkout, openHabits, mutate, layout, onLayout }: {
  today: string; data: TrainingData; programme: ProgrammeSnapshot; initials: string;
  openWorkout: (id: string, date: string) => void; openHabits: () => void; mutate: Mutate;
  layout: HomeLayout; onLayout: (layout: HomeLayout) => void;
}) {
  const progress = workoutsDoneThisWeek(data, today);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();
  const days = contentBefore(programme.state, today).days.slice().sort((a, b) => a.day - b.day);
  const activity = days.find((day) => day.day === viewing && dayKind(day.type) !== 'strength');

  function open(day: ProgrammeDay) {
    setError('');
    setConfirming(false);
    if (dayKind(day.type) === 'strength') {
      const plan = weekPlans(data, today, undefined, programme).find((item) => item.day === day.day);
      if (!plan) { setError('This workout is not in the programme.'); return; }
      openWorkout(plan.id, today);
      return;
    }
    setViewing(day.day);
  }

  async function start(day: ProgrammeDay, again = false) {
    if (busy) return;
    setError('');
    if (!again && progress.done.has(day.day)) { setConfirming(true); return; }
    setConfirming(false);
    setBusy(true);
    try {
      await mutate({ type: 'logWorkout', workoutNumber: day.day });
      setViewing(null);
      openHabits();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save. Try again.');
    } finally { setBusy(false); }
  }

  if (activity) {
    const done = progress.done.get(activity.day);
    const kind = dayKind(activity.type);
    const lines = dayLines(activity);
    const kindLabel = kind === 'cardio' ? 'Cardio' : 'Active rest';
    return <section className="screen screen-nav screen-overview">
      <div className="screen-toolbar">
        <RoundButton aria-label="Back to Today" onClick={() => { setViewing(null); setConfirming(false); setError(''); }}><ChevronLeft size={20} /></RoundButton>
      </div>
      <HeadingSentence lead={`${activity.title}.`} follow={activity.note} />
      <p className="overview-progress" role="status">{done ? `Done ${done.weekday} · Day ${activity.day}` : `Day ${activity.day} · ${kindLabel}`}</p>
      {lines.length ? <RowStack>
        {lines.map((line, index) => <Row key={`${index}-${line}`} label={kind === 'cardio' ? 'Option' : 'Today'} value={line} />)}
      </RowStack> : <p className="fine">Nothing listed for this day yet.</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="screen-actions">
        <PrimaryButton disabled={busy} onClick={() => void start(activity)}>{busy ? 'Saving…' : 'Start workout'}</PrimaryButton>
      </div>
      {confirming && done && <BottomSheet className="again-sheet" labelId={titleId} onClose={() => setConfirming(false)}>
        <HeadingSentence id={titleId} className="heading-small" lead={`Do Workout ${activity.day} again?`} follow={`You did ${activity.title.toLowerCase()} on ${done.weekdayLong}.`} />
        <p className="again-note">It'll be logged as an extra session. Your week still counts it once.</p>
        <PrimaryButton onClick={() => void start(activity, true)}>Do again</PrimaryButton>
        <PrimaryButton className="button-muted" onClick={() => setConfirming(false)}>Pick another</PrimaryButton>
      </BottomSheet>}
    </section>;
  }

  return <section className="screen screen-nav screen-home">
    <div className="home-bar">
      <span className="home-avatar" aria-hidden="true">{initials}</span>
      <time className="home-date" dateTime={today}>{homeDate(today)}</time>
      <HomeLayoutSwitch layout={layout} onLayout={onLayout} />
    </div>
    <HeadingSentence className="heading-small home-heading" lead="Pick today's." follow="Any order." />
    <div className="workout-grid" aria-label="Workouts this week">
      {days.map((day) => {
        const done = progress.done.get(day.day);
        const upNext = day.day === progress.upNext;
        const photo = workoutPhoto[day.day];
        const name = `Workout ${day.day}, ${day.title}${done ? `, done ${done.weekday}` : upNext ? ', up next' : ''}`;
        return <button type="button" key={day.day} className="workout-tile" aria-label={name}
          data-done={done ? true : undefined} onClick={() => open(day)}>
          {photo && <Image src={photo} alt="" fill sizes="180px" />}
          <span className="workout-tile-scrim" aria-hidden="true" />
          {(done || upNext) && <span className="workout-tile-pill" data-done={done ? true : undefined} data-next={upNext || undefined}>
            {done ? `✓ ${done.weekday}` : 'Up next'}
          </span>}
          <span className="workout-tile-copy" aria-hidden="true">
            <span>WORKOUT {day.day}</span>
            <strong>{day.title}</strong>
          </span>
        </button>;
      })}
      <div className="week-tile" aria-label={`${progress.count} of 7 workouts done this week, resets Monday`}>
        <span>This week</span>
        <span className="week-count">{progress.count}<span> of 7</span></span>
        <span className="week-bars" aria-hidden="true">
          {days.map((day) => <span key={day.day} data-done={progress.done.has(day.day) || undefined} />)}
        </span>
        <span>Resets Monday</span>
      </div>
    </div>
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}

function WeekHome({ today, data, programme, firstName, openWorkout, layout, onLayout }: {
  today: string; data: TrainingData; programme: ProgrammeSnapshot; firstName: string;
  openWorkout: (id: string, date: string) => void;
  layout: HomeLayout; onLayout: (layout: HomeLayout) => void;
}) {
  const [previewDate, setPreviewDate] = useState(today);
  const [weekOf, setWeekOf] = useState(() => weekStart(today));
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekOf, index));
  const day = scheduledProgrammeDay(previewDate, data);
  const revision = revisionCovering(programme.state, previewDate);
  const current = previewDate === today;
  const future = previewDate > today;
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  const currentWeek = weekOf === thisWeek;
  const viewingNext = weekOf === nextWeek;
  const weekday = displayDate(previewDate, { weekday: 'long' });
  const definition = dayOn(programme, data, previewDate);
  const kind = definition ? dayKind(definition.type) : 'strength';
  const plans = weekPlans(data, previewDate, undefined, programme);
  const plan = plans.find((item) => item.day === day);
  const session = plan && data.sessions[sessionKey(previewDate, plan.id)];
  const latest = Object.values(data.sessions).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const resume = latest && !latest.finishedAt && latest !== session ? latest : undefined;
  const resumePlan = resume && workoutPlan(data, resume.date, resume.planId, programme);
  const activePlan = session?.plan ?? plan;
  const title = activePlan ? dayTitle(activePlan) : definition?.title ?? '';
  const coachWeek = availableWeek(data, previewDate);
  const summary = activePlan
    ? `${sessionExerciseNames(activePlan, session).map((name) => compactName(name)).join(', ').replace(/^./, (letter) => letter.toUpperCase())}. ${activePlan.exercises.reduce((sum, item) => sum + item.sets, 0)} sets.`
    : definition?.guidance?.[0] ?? definition?.options?.join(' · ') ?? definition?.note;
  const completed = new Set(Object.values(data.sessions).filter((entry) => entry.finishedAt && entry.date >= weekOf && entry.date <= addDays(weekOf, 6)).map((entry) => entry.planId));
  function open() {
    if (plan) openWorkout(plan.id, previewDate);
  }
  function shiftWeek(days: number) {
    const shifted = addDays(weekOf, days);
    if (shifted > nextWeek) return;
    setWeekOf(shifted);
    setPreviewDate(addDays(previewDate, days));
  }
  const when = current ? 'Today' : currentWeek ? weekday : displayDate(previewDate, { weekday: 'short', day: 'numeric', month: 'short' });
  const photo = mixPhotos(weekOf)[Math.max(0, dates.indexOf(previewDate))] ?? { src: 'glass.webp' };
  const action = session?.finishedAt ? 'View session' : session ? 'Resume workout' : future ? 'Preview session' : current ? 'View workout' : 'Log this day';
  const weekLabel = currentWeek ? 'This week' : viewingNext ? 'Next week'
    : `${displayDate(weekOf)} – ${displayDate(addDays(weekOf, 6))}`;
  const dayLabel = kind === 'cardio' ? 'Cardio' : kind === 'rest' ? 'Rest' : `Day ${day}`;
  const greeting = firstName ? `Hi, ${firstName}.` : 'Hi.';

  return <section className="screen screen-nav screen-today">
    <div className="screen-toolbar">
      <span />
      <HomeLayoutSwitch layout={layout} onLayout={onLayout} />
    </div>
    <HeadingSentence className="heading-small" lead={current ? greeting : viewingNext ? `${weekday}, next week.` : future ? `${weekday} preview.` : `${weekday} ${displayDate(previewDate)}.`} follow={summary} />
    <PhotoHero src={`/images/days/${photo.src}`} position={photo.position} title={title} label={`${when} · ${dayLabel}`} onClick={plan ? open : undefined} />
    {resume && resumePlan && <Pill className="pill-white" onClick={() => openWorkout(resume.planId, resume.date)}>
      Resume {dayTitle(resumePlan)} · {displayDate(resume.date)}
    </Pill>}
    <div className="row-stack">
      <section className="week-row" aria-label="Training week">
        <div className="week-switch">
          <RoundButton className="round-muted" aria-label="Previous week" onClick={() => shiftWeek(-7)}><ChevronLeft size={18} /></RoundButton>
          <span>{weekLabel}</span>
          <RoundButton className="round-muted" aria-label="Next week" onClick={() => shiftWeek(7)} disabled={viewingNext}><ChevronRight size={18} /></RoundButton>
        </div>
        <div className="week-caption"><span>Tap a day</span><strong>{completed.size} of {plans.length} strength</strong></div>
        <ChipGroup label="Day of the week" className="week-strip" value={previewDate} onChange={setPreviewDate}
          options={dates.map((dayDate) => {
            const item = dayOn(programme, data, dayDate);
            const itemKind = item ? dayKind(item.type) : 'strength';
            const name = displayDate(dayDate, { weekday: 'long' });
            const logged = Object.values(data.sessions).some((entry) => entry.date === dayDate && entry.finishedAt)
              || (data.completions ?? []).some((entry) => todayKey(new Date(entry.completedAt)) === dayDate);
            const mark = itemKind === 'cardio' ? 'Cardio' : itemKind === 'rest' ? 'Rest' : (item?.title ?? '').replace(/\s+body$/i, '');
            const role = itemKind === 'cardio' ? 'cardio day' : itemKind === 'rest' ? 'rest day' : `Day ${item?.day ?? day}, ${item?.title ?? ''}`;
            return {
              value: dayDate, accessibleLabel: `${name} ${displayDate(dayDate)}, ${role}${dayDate === today ? ', today' : ''}${logged ? ', logged' : ''}`,
              label: <><strong data-kind={itemKind}>{name[0]}</strong><small>{mark}</small></>,
            };
          })} />
      </section>
    </div>
    {revision?.deload && <p className="fine">Deload week.</p>}
    {revision?.weekNote ? <details className="disclosure"><summary>Programme note</summary><p>{revision.weekNote}</p></details>
      : !!coachWeek?.notes?.length && <details className="disclosure"><summary>Brenna’s notes · Week {coachWeek.number}</summary>{coachWeek.notes.map((note, index) => <p key={index}>{note}</p>)}</details>}
    <div className="screen-actions">
      {plan && <PrimaryButton onClick={open}>{action}</PrimaryButton>}
      <WeeklyCheckInLink />
    </div>
  </section>;
}

export function Today({ today, data, programme, initials, firstName, openWorkout, openHabits, mutate }: {
  today: string; data: TrainingData; programme: ProgrammeSnapshot; initials: string; firstName: string;
  openWorkout: (id: string, date: string) => void; openHabits: () => void; mutate: Mutate;
}) {
  const [layout, setLayout] = useState(rememberedLayout);
  useEffect(() => {
    const saved = readLayout();
    rememberedLayout = saved;
    setLayout((current) => current === saved ? current : saved);
  }, []);
  function onLayout(next: HomeLayout) {
    rememberedLayout = next;
    setLayout(next);
    try { localStorage.setItem(layoutKey, next); } catch { /* The choice still applies to this visit. */ }
  }
  const shared = { today, data, programme, openWorkout, layout, onLayout };
  if (layout === 'week') return <WeekHome {...shared} firstName={firstName} />;
  return <GridHome {...shared} initials={initials} openHabits={openHabits} mutate={mutate} />;
}
