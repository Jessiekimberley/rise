'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { displayDate, progressPoints } from '@/lib/insights';
import type { TrainingData } from '@/lib/model';
import { programmeExercises } from '@/lib/weeks';

type Point = { date: string; value: number };

function Chart({ points, unit }: { points: Point[]; unit: string }) {
  const chart = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = chart.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !points.length) return;
    const target = canvas;
    const cx = context;
    function draw() {
      const { width, height } = target.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      target.width = Math.round(width * dpr);
      target.height = Math.round(height * dpr);
      cx.scale(dpr, dpr);
      const values = points.map(({ value }) => value);
      const high = Math.max(...values);
      const low = Math.min(...values);
      const pad = (high - low) * .16 || Math.max(1, high * .1);
      const min = Math.max(0, low - pad);
      const max = high + pad;
      const left = 40, top = 14, right = 16, bottom = 25;
      const chartHeight = height - top - bottom;
      const chartWidth = width - left - right;
      const times = points.map(({ date }) => Date.parse(date));
      const x = (index: number) => left + (times.length === 1 ? .5 : (times[index] - times[0]) / (times.at(-1)! - times[0])) * chartWidth;
      const y = (value: number) => top + (1 - (value - min) / (max - min)) * chartHeight;
      cx.font = '11px system-ui';
      cx.fillStyle = '#615851';
      for (let i = 0; i <= 4; i++) {
        const v = min + (max - min) * i / 4;
        cx.strokeStyle = '#e5dcd3'; cx.lineWidth = 1;
        cx.beginPath(); cx.moveTo(left, y(v)); cx.lineTo(width - right, y(v)); cx.stroke();
        cx.fillText(v.toLocaleString('en-NZ', { maximumFractionDigits: 1 }), 1, y(v) + 4);
      }
      cx.strokeStyle = '#a54b43'; cx.lineWidth = 2.5; cx.beginPath();
      points.forEach(({ value }, i) => { if (i) cx.lineTo(x(i), y(value)); else cx.moveTo(x(i), y(value)); });
      cx.stroke();
      cx.fillStyle = '#a54b43';
      points.forEach(({ value }, i) => { cx.beginPath(); cx.arc(x(i), y(value), 4, 0, Math.PI * 2); cx.fill(); });
      cx.fillStyle = '#615851';
      const first = displayDate(points[0].date);
      const last = displayDate(points.at(-1)!.date);
      cx.fillText(first, left, height - 5);
      if (points.length > 1) cx.fillText(last, width - right - cx.measureText(last).width, height - 5);
    }
    draw();
    const watcher = new ResizeObserver(draw);
    watcher.observe(target);
    return () => watcher.disconnect();
  }, [points]);

  if (!points.length) return <p className="empty">Log sets for this exercise to see your progression.</p>;
  return <>
    <canvas ref={chart} className="chart" role="img" aria-label={`Progression from ${points[0].value} to ${points.at(-1)?.value} ${unit}`} />
    <details className="exercise-details"><summary>See logged values</summary>
      <ol className="chart-data">{points.map((point) => <li key={point.date}><span>{displayDate(point.date)}</span><strong>{point.value} {unit}</strong></li>)}</ol>
    </details>
  </>;
}

export function Progress({ data }: { data: TrainingData }) {
  const exercises = programmeExercises(data);
  const [exerciseId, setExerciseId] = useState(exercises[0].id);
  const [variant, setVariant] = useState('');
  const [kind, setKind] = useState<'weight' | 'reps'>('weight');
  const exercise = exercises.find(({ id }) => id === exerciseId) ?? exercises[0];
  const metric = exercise.metric === 'seconds' ? 'seconds' : exercise.metric === 'bodyweight' ? 'reps' : kind;
  const unit = { seconds: 'sec', reps: 'reps', weight: 'kg' }[metric];
  const points = useMemo(() => progressPoints(data, exercise.id, variant, metric), [data, exercise.id, variant, metric]);
  const best = points.length ? Math.max(...points.map(({ value }) => value)) : null;
  return <>
    <h1 className="page-title">Progress</h1>
    <label className="input-group workout-picker"><span>Exercise</span><select value={exercise.id} onChange={(event) => { setExerciseId(event.target.value); setVariant(''); }}>{exercises.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {!!exercise.variants?.length && <label className="input-group workout-picker"><span>Variation</span><select value={variant} onChange={(event) => setVariant(event.target.value)}><option value="">Unspecified</option>{exercise.variants.map((item) => <option key={item}>{item}</option>)}</select></label>}
    {!exercise.metric && <div className="segment"><button type="button" aria-pressed={kind === 'weight'} onClick={() => setKind('weight')}>Weight</button><button type="button" aria-pressed={kind === 'reps'} onClick={() => setKind('reps')}>Reps</button></div>}
    <section className="progress-panel"><div className="section-line"><h2>Best per day</h2>{best !== null && <strong>{best} {unit}</strong>}</div><Chart points={points} unit={unit} /></section>
  </>;
}
