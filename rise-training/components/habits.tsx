import Image from 'next/image';
import { displayDate } from '@/lib/insights';
import { habitTargets } from '@/lib/programme';
import { HeadingSentence, Pill, Row } from './ui';

const format = new Intl.NumberFormat('en-NZ');
const range = ({ min, max }: { min: number; max: number }) => `${format.format(min)}–${format.format(max)}`;
const stepsGoal = { label: 'Steps', value: `${range(habitTargets.steps)} steps` };

const otherHabitGoals = [
  { label: 'Water', value: `${range(habitTargets.hydrationLitres)} L` },
  { label: 'Sleep', value: `${range(habitTargets.sleepHours)} hours`, note: habitTargets.sleepHours.note },
];
export const dailyHabitGoals = [stepsGoal, ...otherHabitGoals];

export function Habits({ date, steps, openStepSync }: { date: string; steps?: number | null; openStepSync: () => void }) {
  return <section className="screen screen-nav screen-habits">
    <div className="habits-photo">
      <Image src="/images/days/swim.webp" alt="" fill sizes="(max-width: 520px) 100vw, 520px" loading="eager" />
      <div className="habits-scrim" aria-hidden="true" />
      <header><HeadingSentence lead="Daily habits." /></header>
    </div>
    <ul className="row-stack habits-rows" role="list">
      <li><Row label={`Steps · ${displayDate(date)}`} value={<>
        {steps == null ? 'No steps logged' : `${format.format(steps)} steps`}
        <span className="habit-note">Goal {stepsGoal.value}</span>
      </>} end={<Pill onClick={openStepSync}>Apple Health</Pill>} /></li>
      {otherHabitGoals.map(({ label, value, note }) => <li key={label}>
        <Row label={label} value={<>{value}{note && <span className="habit-note">{note}</span>}</>} />
      </li>)}
      <li><Row label="Recovery" value="Pay attention to soreness or tightness." /></li>
    </ul>
    <section className="fuelling">
      <h2 className="row-label">Fuelling</h2>
      <ul>
        {habitTargets.nutrition.habits.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
      </ul>
    </section>
  </section>;
}
