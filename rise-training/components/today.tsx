'use client';

import { MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { addDays, displayDate, scheduledProgrammeDay, weekStart } from '@/lib/insights';
import { sessionKey, type TrainingData } from '@/lib/model';
import { dayTitle, programmeDays } from '@/lib/programme';
import { availableWeek, weekPlans, workoutPlan } from '@/lib/weeks';
import { dailyHabitGoals } from './habits';
import { ChipGroup, HeadingSentence, PhotoHero, Pill, PrimaryButton, RoundButton } from './ui';

const photos = ['glass', 'shoulder', 'swim', 'liquid', 'blur', 'thermal', 'night'];
const compactName = (name: string) => /^[A-Z]{2,}$/.test(name)
  ? name : name.replace(/^Forearm /i, '').replace(/ (with dumbbells|on cable)$/i, '').toLowerCase();

export function Today({ date, today, data, firstName, initials, openWorkout, openHabits, openCheckIn, openSettings, reviewLabel, openReview }: {
  date: string; today: string; data: TrainingData; firstName: string; initials: string;
  openWorkout: (id: string, date: string) => void; openHabits: () => void;
  openCheckIn: () => void; openSettings: () => void; reviewLabel?: string; openReview: () => void;
}) {
  const [previewDate, setPreviewDate] = useState(date);
  const start = weekStart(date);
  const dates = programmeDays.map((_, index) => addDays(start, index));
  const day = scheduledProgrammeDay(previewDate, data);
  const current = previewDate === today;
  const weekday = displayDate(previewDate, { weekday: 'long' });
  const definition = programmeDays[day - 1];
  const programme = weekPlans(data, previewDate);
  const plan = programme.find((item) => item.day === day);
  const session = plan && data.sessions[sessionKey(previewDate, plan.id)];
  const latest = Object.values(data.sessions).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const resume = latest && !latest.finishedAt && latest !== session ? latest : undefined;
  const resumePlan = resume && workoutPlan(data, resume.date, resume.planId);
  const activePlan = session?.plan ?? plan;
  const title = activePlan ? dayTitle(activePlan) : definition.title;
  const coachWeek = availableWeek(data, previewDate);
  const summary = activePlan
    ? `${activePlan.exercises.map((exercise) => compactName(exercise.name)).join(', ').replace(/^./, (letter) => letter.toUpperCase())}. ${activePlan.exercises.reduce((sum, item) => sum + item.sets, 0)} sets.`
    : definition.guidance?.[0] ?? definition.options?.join(' · ') ?? definition.note;
  const completed = new Set(Object.values(data.sessions).filter((entry) => entry.finishedAt && entry.date >= start && entry.date <= addDays(start, 6)).map((entry) => entry.planId));
  function open() {
    if (plan) openWorkout(plan.id, previewDate);
    else openHabits();
  }

  return <section className="screen screen-nav screen-today">
    <div className="screen-toolbar">
      <RoundButton aria-label="Programme settings and log date" onClick={openSettings}>{initials}</RoundButton>
      <RoundButton aria-label="Start a check-in" onClick={openCheckIn}><MessageSquare size={20} /></RoundButton>
    </div>
    <HeadingSentence className="heading-small" lead={current ? `Hi, ${firstName}.` : `${weekday} preview.`} follow={summary} />
    <PhotoHero src={`/images/days/${photos[day - 1]}.webp`} title={title} label={`${current ? 'Today' : weekday} · Day ${day}`} onClick={open} />
    {resume && resumePlan && <Pill className="pill-white" onClick={() => openWorkout(resume.planId, resume.date)}>
      Resume {dayTitle(resumePlan)} · {displayDate(resume.date)}
    </Pill>}
    <div className="row-stack">
      <section className="week-row" aria-label="Training week">
        <div className="week-caption"><span>This week · tap a day to preview</span><strong>{completed.size} of {programme.length} strength</strong></div>
        <ChipGroup label="Day of the week" className="week-strip" value={previewDate} onChange={setPreviewDate}
          options={dates.map((dayDate) => {
            const item = programmeDays[scheduledProgrammeDay(dayDate, data) - 1];
            const name = displayDate(dayDate, { weekday: 'long' });
            return {
              value: dayDate, accessibleLabel: `${name}, Day ${item.day}, ${item.title}`,
              label: <><strong data-strength={item.type === 'strength'}>{name[0]}</strong><small>{dayDate === today ? 'Today' : `D${item.day}`}</small></>,
            };
          })} />
      </section>
      <button type="button" className="today-habits" onClick={openHabits}>
        <strong>Daily habits</strong>
        <span className="today-habit-goals">
          {dailyHabitGoals.map(({ label, value }) => <span key={label}>{value}</span>)}
        </span>
      </button>
    </div>
    {reviewLabel && <Pill className="review-flag" onClick={openReview}>{reviewLabel}</Pill>}
    {!!coachWeek?.notes?.length && <details className="disclosure"><summary>Brenna’s notes · Week {coachWeek.number}</summary>{coachWeek.notes.map((note, index) => <p key={index}>{note}</p>)}</details>}
    <div className="screen-actions">
      <PrimaryButton onClick={open}>{plan ? (session?.finishedAt ? 'View session' : session ? 'Resume workout' : current ? 'View workout' : 'Preview session') : 'Open daily habits'}</PrimaryButton>
    </div>
  </section>;
}
