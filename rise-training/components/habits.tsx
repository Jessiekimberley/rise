'use client';

import { Droplets, Footprints, Moon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { displayDate } from '@/lib/insights';
import { emptyHabits, type HabitLog, type TrainingData } from '@/lib/model';
import type { Mutate } from './training-app';

const metrics = [
  { key: 'steps', title: 'Steps', unit: 'steps', goal: '8,000–10,000 steps', step: '1', max: 200_000, icon: Footprints },
  { key: 'water', title: 'Hydration', unit: 'litres', goal: '3–4 L', step: '0.01', max: 30, icon: Droplets },
  { key: 'sleep', title: 'Sleep', unit: 'hours', goal: '7–8 hours', step: '0.1', max: 24, icon: Moon },
] as const;

export function Habits({ date, data, mutate }: { date: string; data: TrainingData; mutate: Mutate }) {
  const [draft, setDraft] = useState<HabitLog>(() => data.habits[date] ?? emptyHabits);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof HabitLog>(key: K, value: HabitLog[K]) {
    setSaved(false);
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try { await mutate({ type: 'habits', date, data: draft }); setSaved(true); } catch { /* The app shows the error. */ } finally { setSaving(false); }
  }

  return <>
    <p className="eyebrow">{displayDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}</p><h1 className="page-title">Daily habits</h1>
    <form onSubmit={save} className="habits-form">
      <fieldset disabled={saving}>
        {metrics.map(({ key, title, unit, goal, ...item }) => <label className="habit-row" key={key}>
          <item.icon size={21} aria-hidden="true" /><span><strong>{title}</strong><small>Goal {goal}</small></span>
          <input aria-label={`${title} (${unit})`} type="number" inputMode={key === 'steps' ? 'numeric' : 'decimal'} step={item.step} min={0} max={item.max}
            value={draft[key] ?? ''} onChange={(event) => update(key, event.target.value === '' ? null : Number(event.target.value))} />
        </label>)}
        <div className="habit-text">
          <label className="input-group"><span>Nutrition</span><textarea rows={3} maxLength={2_000} placeholder="Meals, protein or how you fuelled training" value={draft.nutrition} onChange={(event) => update('nutrition', event.target.value)} /></label>
          <label className="input-group"><span>Recovery</span><textarea rows={3} maxLength={2_000} placeholder="Energy, soreness and sleep quality" value={draft.recovery} onChange={(event) => update('recovery', event.target.value)} /></label>
        </div>
        <button type="submit" className="primary full" disabled={saving}>{saving ? 'Saving…' : 'Save daily habits'}</button>
      </fieldset>
      <p className="fine" role="status">{saved && 'Daily habits saved.'}</p>
    </form>
  </>;
}
