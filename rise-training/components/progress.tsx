'use client';

import { ArrowRight } from 'lucide-react';
import { useId, useState } from 'react';
import { addDays, displayDate, progressPoints, scheduledProgrammeDay, trainingWeekStart } from '@/lib/insights';
import type { TrainingData } from '@/lib/model';
import { canonicalVariant, dayTitle, exerciseOptions } from '@/lib/programme';
import { programmeExercises, weekPlans } from '@/lib/weeks';
import { ChipGroup, HeadingSentence, Row } from './ui';

type WeekPoint = { index: number; value: number };
const format = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 2 });
const labels = Array.from({ length: 8 }, (_, index) => `W${index + 1}`);

function Chart({ points, unit }: { points: WeekPoint[]; unit: string }) {
  const fill = useId();
  const left = 12, right = 303, top = 16, bottom = 137;
  const low = Math.min(...points.map((item) => item.value));
  const high = Math.max(...points.map((item) => item.value));
  const padding = (high - low) * .15 || Math.max(1, high * .1);
  const x = (index: number) => left + index * (right - left) / 7;
  const y = (value: number) => top + (high + padding - value) * (bottom - top) / (high - low + 2 * padding);
  const coordinates = points.map((item) => [x(item.index), y(item.value)]);
  const line = coordinates.map(([cx, cy], index) => `${index ? 'L' : 'M'} ${cx} ${cy}`).join(' ');
  const first = coordinates[0];
  const end = coordinates.at(-1);

  return <>
    {end && first ? <svg className="strength-chart" viewBox="0 0 315 169" role="img"
      aria-label={points.map(({ index, value }) => `Week ${index + 1}: ${format.format(value)} ${unit}`).join(', ')}>
      <defs><linearGradient id={fill} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--color-peach)" /><stop offset="1" stopColor="var(--color-peach)" stopOpacity="0" /></linearGradient></defs>
      {[50, 90, bottom].map((cy) => <path key={cy} className="chart-grid" d={`M ${left} ${cy} H ${right}`} />)}
      {points.length > 1 && <path fill={`url(#${fill})`} d={`${line} L ${end[0]} ${bottom} H ${first[0]} Z`} />}
      <path className="chart-line" d={line} />
      <circle className="chart-dot" r="4.5" cx={end[0]} cy={end[1]} />
      {labels.map((label, index) => <text key={label} x={x(index)} y="158" textAnchor="middle">{label}</text>)}
    </svg> : <div className="strength-empty"><p>No sets logged for this lift in the last eight weeks.</p><div>{labels.map((label) => <span key={label}>{label}</span>)}</div></div>}
  </>;
}

export function Progress({ data, date, openWorkout }: { data: TrainingData; date: string; openWorkout: (id: string, date: string) => void }) {
  const exercises = programmeExercises(data, weekPlans(data, date));
  const [exerciseId, select] = useState(exercises[0]?.id ?? '');
  const [variant, setVariant] = useState('');
  const [kind, setKind] = useState<'weight' | 'reps'>('weight');
  const exercise = exercises.find((item) => item.id === exerciseId) ?? exercises[0];
  if (!exercise) return <section className="screen screen-nav screen-progress"><HeadingSentence lead="Strength." follow="No lifts in your programme yet." /></section>;

  const week = trainingWeekStart(date, data.startedOn);
  const start = addDays(week, -49);
  const metric = exercise.metric === 'seconds' ? 'seconds' : exercise.metric === 'bodyweight' ? 'reps' : kind;
  const unit = { seconds: 's', reps: 'reps', weight: 'kg' }[metric];
  const byDate = progressPoints(data, exercise.id, variant, metric);
  const buckets = new Map<number, number>();
  for (const point of byDate) {
    if (point.date < start || point.date > date) continue;
    const index = Math.floor((Date.parse(point.date) - Date.parse(start)) / (7 * 86_400_000));
    buckets.set(index, Math.max(buckets.get(index) ?? 0, point.value));
  }
  const points = Array.from(buckets, ([index, value]) => ({ index, value }));
  const latest = points.at(-1)?.value;
  const first = points[0]?.value;
  const delta = points.length > 1 && latest != null && first != null ? latest - first : null;
  const upcoming = Array.from({ length: 14 }, (_, offset) => addDays(date, offset)).flatMap((day) => {
    const scheduled = scheduledProgrammeDay(day, data);
    const plan = weekPlans(data, day).find((item) => item.day === scheduled && item.exercises.some((lift) => lift.id === exercise.id));
    return plan ? [{ date: day, plan }] : [];
  })[0];
  const variants = new Set(exerciseOptions(exercise.id));
  for (const session of Object.values(data.sessions)) {
    for (const slot of Object.values(session.slots)) {
      for (const set of Object.values(slot.sets)) {
        if (set.exerciseId === exercise.id && set.variant) variants.add(canonicalVariant(exercise.id, set.variant));
      }
    }
  }
  const heading = metric === 'weight' ? 'Your heaviest sets over the last 8 weeks.' : `Your best ${metric === 'seconds' ? 'holds' : 'rep counts'} over the last 8 weeks.`;

  return <section className="screen screen-nav screen-progress">
    <HeadingSentence lead="Strength." follow={heading} />
    <ChipGroup className="lift-chips" label="Lift" value={exercise.id} onChange={(id) => { select(id); setVariant(''); setKind('weight'); }}
      options={exercises.map((item) => ({ value: item.id, label: item.name }))} />
    <section className="strength-panel" aria-label="Eight-week strength progress">
      <div className="strength-stats">
        <div><span className="row-label">Top set now</span><strong>{latest == null ? '—' : format.format(latest)} {latest != null && <small>{unit}</small>}</strong></div>
        <div><span className="row-label">{points[0]?.index ? `Since week ${points[0].index + 1}` : 'Since week 1'}</span>
          <strong>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${format.format(delta)}`} {delta != null && <small>{unit}</small>}</strong></div>
      </div>
      <Chart points={points} unit={unit} />
    </section>
    {upcoming && <Row label="Next time" value={`Day ${upcoming.plan.day} · ${dayTitle(upcoming.plan)}`} onClick={() => openWorkout(upcoming.plan.id, upcoming.date)}
      end={<span className="round-button round-muted" aria-hidden="true"><ArrowRight size={19} /></span>} />}
    <details className="disclosure">
      <summary>Training history and chart options</summary>
      {!!variants.size && <label className="input-group"><span>Variation</span>
        <select value={variant} onChange={(event) => setVariant(event.target.value)}><option value="">Unspecified</option>{[...variants].map((item) => <option key={item}>{item}</option>)}</select>
      </label>}
      {!exercise.metric && <ChipGroup className="chips-two" label="Metric" value={kind} onChange={(choice) => setKind(choice === 'reps' ? 'reps' : 'weight')}
        options={[{ value: 'weight', label: 'Weight' }, { value: 'reps', label: 'Reps' }]} />}
      <RowStackForPoints points={byDate} unit={unit} />
    </details>
  </section>;
}

function RowStackForPoints({ points, unit }: { points: ReturnType<typeof progressPoints>; unit: string }) {
  return points.length ? <ol className="chart-data">{points.map((point) => <li key={point.date}>
    <span>{displayDate(point.date)}</span><strong>{format.format(point.value)} {unit}</strong>
  </li>)}</ol> : <p className="fine">No logged values for this selection.</p>;
}
