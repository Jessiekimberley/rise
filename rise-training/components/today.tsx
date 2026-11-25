'use client';

import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { addDays, displayDate, scheduledProgrammeDay, weekStart } from '@/lib/insights';
import { sessionKey, type TrainingData } from '@/lib/model';
import { dayTitle, programmeDays } from '@/lib/programme';
import { availableWeek, weekPlans, workoutPlan } from '@/lib/weeks';
import { WeeklyCheckInLink } from './weekly-check-in';
import { ChipGroup, HeadingSentence, PhotoHero, Pill, PrimaryButton, RoundButton } from './ui';

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

export function Today({ today, data, firstName, openWorkout, openCheckIn }: {
  today: string; data: TrainingData; firstName: string;
  openWorkout: (id: string, date: string) => void; openCheckIn: () => void;
}) {
  const [previewDate, setPreviewDate] = useState(today);
  const [weekOf, setWeekOf] = useState(() => weekStart(today));
  const dates = programmeDays.map((_, index) => addDays(weekOf, index));
  const day = scheduledProgrammeDay(previewDate, data);
  const current = previewDate === today;
  const future = previewDate > today;
  const currentWeek = weekOf === weekStart(today);
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
  const completed = new Set(Object.values(data.sessions).filter((entry) => entry.finishedAt && entry.date >= weekOf && entry.date <= addDays(weekOf, 6)).map((entry) => entry.planId));
  function open() {
    if (plan) openWorkout(plan.id, previewDate);
  }
  function shiftWeek(days: number) {
    const nextWeek = addDays(weekOf, days);
    if (nextWeek > weekStart(today)) return;
    setWeekOf(nextWeek);
    setPreviewDate(addDays(previewDate, days));
  }
  const when = current ? 'Today' : currentWeek ? weekday : displayDate(previewDate, { weekday: 'short', day: 'numeric', month: 'short' });
  const photo = mixPhotos(weekOf)[Math.max(0, dates.indexOf(previewDate))];
  const action = session?.finishedAt ? 'View session' : session ? 'Resume workout' : future ? 'Preview session' : current ? 'View workout' : 'Log this day';
  const weekLabel = currentWeek
    ? 'This week'
    : `${displayDate(weekOf)} – ${displayDate(addDays(weekOf, 6))}`;

  return <section className="screen screen-nav screen-today">
    <div className="screen-toolbar">
      <span />
      <RoundButton aria-label="Send this week's log" onClick={openCheckIn}><MessageSquare size={20} /></RoundButton>
    </div>
    <HeadingSentence className="heading-small" lead={current ? `Hi, ${firstName}.` : future ? `${weekday} preview.` : `${weekday} ${displayDate(previewDate)}.`} follow={summary} />
    <PhotoHero src={`/images/days/${photo.src}`} position={photo.position} title={title} label={`${when} · Day ${day}`} onClick={open} />
    {resume && resumePlan && <Pill className="pill-white" onClick={() => openWorkout(resume.planId, resume.date)}>
      Resume {dayTitle(resumePlan)} · {displayDate(resume.date)}
    </Pill>}
    <div className="row-stack">
      <section className="week-row" aria-label="Training week">
        <div className="week-switch">
          <RoundButton className="round-muted" aria-label="Previous week" onClick={() => shiftWeek(-7)}><ChevronLeft size={18} /></RoundButton>
          <span>{weekLabel}</span>
          <RoundButton className="round-muted" aria-label="Next week" onClick={() => shiftWeek(7)} disabled={currentWeek}><ChevronRight size={18} /></RoundButton>
        </div>
        <div className="week-caption"><span>Tap a day</span><strong>{completed.size} of {programme.length} strength</strong></div>
        <ChipGroup label="Day of the week" className="week-strip" value={previewDate} onChange={setPreviewDate}
          options={dates.map((dayDate) => {
            const item = programmeDays[scheduledProgrammeDay(dayDate, data) - 1];
            const name = displayDate(dayDate, { weekday: 'long' });
            const logged = Object.values(data.sessions).some((entry) => entry.date === dayDate && entry.finishedAt);
            return {
              value: dayDate, accessibleLabel: `${name} ${displayDate(dayDate)}, Day ${item.day}, ${item.title}${logged ? ', logged' : ''}`,
              label: <><strong data-strength={item.type === 'strength'}>{name[0]}</strong><small>{dayDate === today ? 'Today' : logged ? 'Done' : `D${item.day}`}</small></>,
            };
          })} />
      </section>
    </div>
    {!!coachWeek?.notes?.length && <details className="disclosure"><summary>Brenna’s notes · Week {coachWeek.number}</summary>{coachWeek.notes.map((note, index) => <p key={index}>{note}</p>)}</details>}
    <div className="screen-actions">
      {plan && <PrimaryButton onClick={open}>{action}</PrimaryButton>}
      <WeeklyCheckInLink />
    </div>
  </section>;
}
