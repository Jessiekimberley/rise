'use client';

import { ChartNoAxesCombined, Check, ChevronLeft, Play, Timer } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { compactSet, displayDate, matchingSets, pastSessions, restDisplay } from '@/lib/insights';
import type { SetLog, TrainingData } from '@/lib/model';
import { canonicalVariant, exerciseOptions, prescribedReps, type Exercise } from '@/lib/programme';
import { PrimaryButton, RoundButton } from './ui';

const plateSizes = [25, 20, 15, 10, 5, 2.5, 1.25];
const barKg = 20;
export const warmupIndex = -1;

export const equipmentLabel = (exercise: Exercise, variant: string) =>
  canonicalVariant(exercise.id, variant) || exerciseOptions(exercise.id)[0] || '';
const isWeighted = (exercise: Exercise) => exercise.metric !== 'bodyweight' && exercise.metric !== 'seconds';
export const usesBarbell = (exercise: Exercise, variant: string) =>
  isWeighted(exercise) && /\bbarbell\b/i.test(equipmentLabel(exercise, variant) || exercise.name);

export type LogSetRow = {
  index: number;
  exercise: Exercise;
  variant: string;
  logged?: SetLog;
  last?: SetLog;
  fallback?: SetLog;
};

type Draft = { count: string; weight: string };
type Panel = 'history' | 'plates';
const asText = (value: number | null | undefined) => value == null ? '' : String(value);
const rowKey = ({ index, exercise, variant }: LogSetRow) => JSON.stringify([index, exercise.id, variant]);
const weightLabel = (exercise: Exercise) => exercise.coachWeight ?? (exercise.coachKg != null
  ? `${exercise.coachKg} kg` : exercise.metric === 'bodyweight' ? 'bodyweight' : 'no weight set');

function defaultDraft({ index, exercise, logged, fallback }: LogSetRow): Draft {
  const count = exercise.metric === 'seconds'
    ? logged ? logged.seconds : fallback?.seconds
    : logged ? logged.reps : prescribedReps(exercise) ?? fallback?.reps;
  const weight = logged ? logged.weight : index === warmupIndex ? barKg : fallback?.weight ?? exercise.coachKg;
  return { count: asText(count), weight: asText(weight) };
}

function Trend({ label, value, previous, unit = '' }: { label: string; value: number | null; previous?: number | null; unit?: string }) {
  const change = value == null || previous == null ? null : Math.round((value - previous) * 100) / 100;
  return <span>{label} <b data-up={change != null && change > 0}>{change == null ? '—' : change === 0 ? 'same'
    : `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}${unit}`}</b></span>;
}

function PlateCalculator({ name, weight }: { name: string; weight: number | null }) {
  let remaining = weight == null ? 0 : Math.max(0, Math.round((weight - barKg) * 50));
  const plates = plateSizes.flatMap((plate) => {
    const cents = plate * 100;
    const quantity = Math.floor(remaining / cents);
    remaining -= quantity * cents;
    return Array<number>(quantity).fill(plate);
  });
  const summary = weight == null ? 'Enter a weight to calculate plates.'
    : weight < barKg ? 'Less than an empty bar'
    : weight === barKg ? 'Empty bar, no plates'
    : `Each side: ${plates.length ? plates.map((plate) => `${plate} kg`).join(' + ') : 'no matching plates'}${remaining ? ` (+${remaining / 100} kg unmatched)` : ''}`;

  return <section className="logger-card plate-card" aria-label="Plate calculator">
    <span>{`Plates for ${name.toLowerCase()} · ${weight == null ? '' : `${weight} kg on `}a ${barKg} kg bar`}</span>
    <strong>{summary}</strong>
    <div className="plate-bars" aria-hidden="true">
      {plates.map((plate, index) => <i key={index} style={{
        width: plate >= 10 ? 9 : 6,
        height: Math.max(16, Math.min(40, 14 + plate * 1.1)),
        background: plate >= 15 ? 'var(--color-ink)' : plate >= 5 ? 'var(--color-accent)' : 'var(--color-peach)',
      }} />)}
    </div>
  </section>;
}

export function LogSet({ rows, active, exerciseNumber, exerciseCount, workSetCount, date, data, close, choose, cues, rest,
  nextExercise, finishing, review, complete, save, remove }: {
  rows: LogSetRow[]; active: LogSetRow; exerciseNumber: number; exerciseCount: number; workSetCount: number; date: string; data: TrainingData;
  close: () => void; choose: (index: number) => void; cues: () => void; rest?: () => void;
  nextExercise?: string; finishing: boolean; review?: () => void;
  complete: () => Promise<void>; save: (set: SetLog) => Promise<void>; remove: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [panel, setPanel] = useState<Panel>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { exercise, variant, index, logged, last } = active;
  const activeKey = rowKey(active);
  const draftFor = (row: LogSetRow) => drafts[rowKey(row)] ?? defaultDraft(row);
  const draft = draftFor(active);
  const warmup = index === warmupIndex;
  const timed = exercise.metric === 'seconds';
  const weighted = isWeighted(exercise);
  const countLabel = timed ? 'Seconds' : exercise.perSide ? `Reps per ${exercise.perSide}` : 'Reps';
  const name = warmup ? 'Warm-up' : `Set ${index + 1}`;
  const barbell = usesBarbell(exercise, variant);
  const history = panel === 'history';
  const plates = barbell && panel === 'plates';
  const sessions = history ? pastSessions(data, date).flatMap((entry) => {
    const sets = matchingSets(entry, exercise.id, variant);
    return sets.length ? [{ entry, sets }] : [];
  }) : [];
  const weightText = draft.weight.trim();
  const weight = /^[\d]*[.,]?\d+$|^\d+[.,]$/.test(weightText) ? Number(weightText.replace(',', '.')) : null;
  const kg = weight != null && weight <= 5_000 ? weight : null;
  const count = /^\d+$/.test(draft.count.trim()) ? Number(draft.count) : null;

  function select(position: number) {
    if (busy || (!finishing && index === position)) return;
    choose(position);
    setError('');
  }

  function update(row: LogSetRow, field: keyof Draft, value: string) {
    const key = rowKey(row);
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? defaultDraft(row)), [field]: value } }));
  }

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      setDrafts((current) => {
        const next = { ...current };
        delete next[activeKey];
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save. Try again.');
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (finishing) {
      void perform(() => complete());
      return;
    }
    if (weighted && weightText && kg == null) {
      setError('Enter a weight from 0 to 5,000 kg.');
      return;
    }
    if (count == null || count < 1 || count > (timed ? 86_400 : 1_000)) {
      setError(timed ? 'Enter the whole seconds you held, from 1 to 86,400.' : 'Enter the whole reps you completed, from 1 to 1,000.');
      return;
    }
    void perform(() => save({ exerciseId: exercise.id, variant, weight: weighted ? kg : null,
      reps: timed ? null : count, seconds: timed ? count : null, effort: logged?.effort ?? null }));
  }

  return <form className="screen screen-logger" aria-labelledby="log-heading" onSubmit={submit}>
    <div className="screen-toolbar">
      <RoundButton className="logger-close" aria-label="Back to exercises" onClick={close} disabled={busy}><ChevronLeft size={20} aria-hidden="true" /></RoundButton>
      <span className="logger-position">Exercise {exerciseNumber} of {exerciseCount}</span>
    </div>
    <div className="logger-heading">
      <h1 id="log-heading">{exercise.name}</h1>
      {equipmentLabel(exercise, variant) && <span className="logger-pill logger-equipment">{equipmentLabel(exercise, variant)}</span>}
    </div>
    <div className="logger-content">
      <div className="logger-tools" aria-label="Exercise tools">
        {exercise.rest > 0 && rest && <button type="button" className="logger-pill" onClick={rest} disabled={busy}>
          <Timer size={16} strokeWidth={1.8} aria-hidden="true" />{restDisplay(exercise.rest)} rest
        </button>}
        <button type="button" className="logger-pill" aria-pressed={history} onClick={() => setPanel(history ? undefined : 'history')} disabled={busy}>
          <ChartNoAxesCombined size={16} strokeWidth={1.8} aria-hidden="true" />History
        </button>
        {barbell && <button type="button" className="logger-pill" aria-pressed={plates} onClick={() => setPanel(plates ? undefined : 'plates')} disabled={busy}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 12h20M6 7v10M9 5v14M15 5v14M18 7v10" />
          </svg>Plates
        </button>}
        <button type="button" className="logger-pill" onClick={cues} disabled={busy}><Play size={16} strokeWidth={1.8} aria-hidden="true" />Cues</button>
      </div>
      {plates ? <PlateCalculator name={name} weight={kg} /> : <section className="logger-card logger-target" aria-label="Brenna’s target">
        <strong>Brenna’s target · {workSetCount} × {exercise.target.replace(/ reps\b/, '')} · {weightLabel(exercise)}</strong>
        {exercise.cue && <p>{exercise.cue}</p>}
        <div className="logger-trends">
          <span>vs last time</span>
          <Trend label={timed ? 'Seconds' : 'Reps'} value={count} previous={timed ? last?.seconds : last?.reps} />
          {weighted && <Trend label="Weight" value={kg} previous={last?.weight} unit=" kg" />}
        </div>
      </section>}
      <div className="logger-columns" data-weighted={weighted} aria-hidden="true">
        <span /><span>{countLabel}</span>{weighted && <span>Weight (kg)</span>}
      </div>
      {history ? <div className="logger-history" aria-label={`Past ${exercise.name} sessions`} role="list">
        {sessions.length ? sessions.map(({ entry, sets }, position) => <div role="listitem" key={`${entry.date}:${entry.planId}`}>
          <span>{displayDate(entry.date, { weekday: 'short', day: 'numeric', month: 'short' })}{position === 0 ? ' · last session' : ''}</span>
          <strong>{sets.map(compactSet).join(' · ')}</strong>
        </div>) : <div role="listitem"><span>No past sets for this exercise yet.</span></div>}
      </div> : <div className="logger-sets" role="list" aria-label="Sets">
        {rows.map((row) => {
          const current = !finishing && row.index === index;
          const rowWarmup = row.index === warmupIndex;
          const rowName = rowWarmup ? 'Warm-up' : `Set ${row.index + 1}`;
          const setDraft = draftFor(row);
          const previousCount = timed ? row.last?.seconds : row.last?.reps;
          return <div className="logger-set" role="listitem" key={row.index}
            data-weighted={weighted} data-current={current} data-done={Boolean(row.logged)}>
            <button type="button" className="logger-set-mark" onClick={() => select(row.index)}
              aria-current={current ? 'step' : undefined} aria-label={`${finishing ? 'Edit ' : ''}${rowName}${row.logged ? ', logged' : ''}`} disabled={busy}>
              {row.logged ? <Check size={14} strokeWidth={2.6} aria-hidden="true" /> : rowWarmup ? 'W' : row.index + 1}
            </button>
            <label className="logger-value">
              <input aria-label={`${rowName} ${countLabel.toLowerCase()}`} type="text" inputMode="numeric" maxLength={5}
                value={setDraft.count} readOnly={finishing} tabIndex={finishing ? -1 : undefined}
                onClick={() => select(row.index)} onFocus={() => { if (!finishing) select(row.index); }}
                onChange={(event) => update(row, 'count', event.target.value)} disabled={busy} />
              <span>{rowWarmup ? 'optional' : `last ${previousCount ?? '—'}`}</span>
            </label>
            {weighted && <label className="logger-value">
              <input aria-label={`${rowName} weight in kg`} type="text" inputMode="decimal" maxLength={12}
                value={setDraft.weight} readOnly={finishing} tabIndex={finishing ? -1 : undefined}
                onClick={() => select(row.index)} onFocus={() => { if (!finishing) select(row.index); }}
                onChange={(event) => update(row, 'weight', event.target.value)} disabled={busy} />
              <span>{rowWarmup ? 'bar' : `last ${row.last?.weight ?? '—'}`}</span>
            </label>}
          </div>;
        })}
      </div>}
    </div>
    <div className="logger-footer">
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="logger-status">
        <strong role="status">{finishing ? 'All working sets logged' : warmup ? 'Warm-up' : `${name} of ${workSetCount}`}</strong>
        <span>Up next · {nextExercise ?? 'Submit record'}</span>
      </div>
      <PrimaryButton type="submit" disabled={busy}>
        {busy ? 'Saving…' : finishing ? 'Done' : logged ? `Update ${name.toLowerCase()}` : `Log ${name.toLowerCase()}`}
      </PrimaryButton>
      {!finishing && logged && <button type="button" className="logger-remove" onClick={() => void perform(remove)} disabled={busy}>Remove {name.toLowerCase()}</button>}
      {!finishing && review && <button type="button" className="logger-remove" onClick={review} disabled={busy}>Back to exercise summary</button>}
    </div>
  </form>;
}
