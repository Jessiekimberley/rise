'use client';

import Image from 'next/image';
import { MessageSquare } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { displayDate, workoutsDoneThisWeek } from '@/lib/insights';
import { dayKind, programmeDays } from '@/lib/programme';
import { revisionCovering, type ProgrammeSnapshot } from '@/lib/prescription';
import type { TrainingData } from '@/lib/model';
import { weekPlans } from '@/lib/weeks';
import { BottomSheet, HeadingSentence, PrimaryButton, RoundButton } from './ui';
import type { Mutate } from './training-app';

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

function startLabel(number: number, type: string, title: string) {
  const kind = dayKind(type);
  const detail = kind === 'cardio' ? 'cardio' : kind === 'rest' ? 'active rest' : title.toLowerCase();
  return `Start Workout ${number} · ${detail}`;
}

export function Today({ today, data, programme, initials, openWorkout, openCheckIn, openHabits, mutate }: {
  today: string; data: TrainingData; programme: ProgrammeSnapshot; initials: string;
  openWorkout: (id: string, date: string) => void; openCheckIn: () => void; openHabits: () => void; mutate: Mutate;
}) {
  const progress = workoutsDoneThisWeek(data, today);
  const [selected, setSelected] = useState<number | null>(progress.upNext);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const group = useId();
  const titleId = useId();
  const live = revisionCovering(programme.state, today)?.days;
  const days = programmeDays.map((day) => {
    const current = live?.find((item) => item.day === day.day);
    return { day: day.day, type: current?.type ?? day.type, title: current?.title || day.title };
  }).sort((a, b) => a.day - b.day);
  const current = days.find((day) => day.day === selected);

  function choose(number: number) {
    const done = progress.done.has(number);
    if (done && selected !== number) setConfirming(number);
    else { setSelected(number); setConfirming(null); }
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const numbers = days.map((day) => day.day);
    const index = Math.max(0, numbers.indexOf(selected ?? progress.upNext ?? numbers[0]));
    const next = numbers[(index + delta + numbers.length) % numbers.length];
    choose(next);
    if (!progress.done.has(next) || next === selected) requestAnimationFrame(() => document.getElementById(`${group}-${next}`)?.focus());
  }

  async function start(day: (typeof days)[number]) {
    if (busy) return;
    setError('');
    if (dayKind(day.type) === 'strength') {
      const plan = weekPlans(data, today, undefined, programme).find((item) => item.day === day.day);
      if (!plan) { setError('This workout is not in the programme.'); return; }
      openWorkout(plan.id, today);
      return;
    }
    setBusy(true);
    try {
      const saved = await mutate({ type: 'logWorkout', workoutNumber: day.day });
      setSelected(workoutsDoneThisWeek(saved.data, today).upNext);
      openHabits();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save. Try again.');
    } finally { setBusy(false); }
  }

  const confirmed = confirming == null ? undefined : days.find((day) => day.day === confirming);
  const confirmedDone = confirmed ? progress.done.get(confirmed.day) : undefined;

  return <section className="screen screen-nav screen-home">
    <div className="home-bar">
      <span className="home-avatar" aria-hidden="true">{initials}</span>
      <time className="home-date" dateTime={today}>{homeDate(today)}</time>
      <RoundButton aria-label="Check-in" onClick={openCheckIn}><MessageSquare size={20} /></RoundButton>
    </div>
    <HeadingSentence className="heading-small home-heading" lead="Pick today's." follow="Any order." />
    <div className="workout-grid" role="radiogroup" aria-label="Choose today's workout" onKeyDown={onKey}>
      {days.map((day) => {
        const done = progress.done.get(day.day);
        const upNext = day.day === progress.upNext;
        const checked = day.day === selected;
        const photo = workoutPhoto[day.day];
        const name = `Workout ${day.day}, ${day.title}${done ? `, done ${done.weekday}` : upNext ? ', up next' : ''}${checked ? ', selected' : ''}`;
        return <button type="button" role="radio" id={`${group}-${day.day}`} key={day.day} className="workout-tile"
          aria-checked={checked} aria-label={name} tabIndex={checked || (selected == null && upNext) ? 0 : -1}
          data-done={done ? true : undefined} onClick={() => choose(day.day)}>
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
    <div className="screen-actions">
      <PrimaryButton disabled={!current || busy} onClick={() => current && void start(current)}>
        {busy ? 'Saving…' : current ? startLabel(current.day, current.type, current.title) : 'All 7 done this week'}
      </PrimaryButton>
    </div>
    {confirmed && confirmedDone && <BottomSheet className="again-sheet" labelId={titleId} onClose={() => setConfirming(null)}>
      <HeadingSentence id={titleId} className="heading-small" lead={`Do Workout ${confirmed.day} again?`} follow={`You did ${confirmed.title.toLowerCase()} on ${confirmedDone.weekdayLong}.`} />
      <p className="again-note">It'll be logged as an extra session. Your week still counts it once.</p>
      <PrimaryButton onClick={() => { setSelected(confirmed.day); setConfirming(null); }}>Do again</PrimaryButton>
      <PrimaryButton className="button-muted" onClick={() => setConfirming(null)}>Pick another</PrimaryButton>
    </BottomSheet>}
  </section>;
}
