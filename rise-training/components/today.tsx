'use client';

import Image from 'next/image';
import { ChevronLeft, MessageSquare } from 'lucide-react';
import { useId, useState } from 'react';
import { displayDate, workoutsDoneThisWeek } from '@/lib/insights';
import { dayKind } from '@/lib/programme';
import { contentBefore, type ProgrammeDay, type ProgrammeSnapshot } from '@/lib/prescription';
import type { TrainingData } from '@/lib/model';
import { weekPlans } from '@/lib/weeks';
import { BottomSheet, HeadingSentence, PrimaryButton, RoundButton, Row, RowStack } from './ui';
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

function dayLines(day: ProgrammeDay) {
  if (day.exercises.length) return day.exercises.map((exercise) => exercise.name);
  return dayKind(day.type) === 'cardio' ? day.options ?? [] : day.guidance ?? [];
}

export function Today({ today, data, programme, initials, openWorkout, openCheckIn, openHabits, mutate }: {
  today: string; data: TrainingData; programme: ProgrammeSnapshot; initials: string;
  openWorkout: (id: string, date: string) => void; openCheckIn: () => void; openHabits: () => void; mutate: Mutate;
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
      <RoundButton aria-label="Check-in" onClick={openCheckIn}><MessageSquare size={20} /></RoundButton>
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
