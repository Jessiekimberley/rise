'use client';

import Image from 'next/image';
import { displayDate } from '@/lib/insights';
import { habitTargets, programmeDays } from '@/lib/programme';
import { HeadingSentence, Row, RowStack } from './ui';

const format = new Intl.NumberFormat('en-NZ');
const range = ({ min, max }: { min: number; max: number }) => `${format.format(min)}–${format.format(max)}`;
const restDay = programmeDays.find((day) => day.type === 'active-rest');
const guidance = restDay?.guidance ?? [];
const recovery = guidance[1];
const planning = guidance[2];

function GoalCard({ label, value, unit, text }: { label: string; value: string; unit?: string; text?: boolean }) {
  return <article className="habit-goal">
    <span className="row-label">{label}</span>
    <p className={text ? 'habit-figure habit-figure-text' : 'habit-figure'}>{value}{unit && <span>{unit}</span>}</p>
  </article>;
}

export function Habits({ date }: { date: string }) {
  return <section className="screen screen-nav screen-habits">
    <div className="habits-photo">
      <Image src="/images/days/swim.webp" alt="" fill sizes="(max-width: 520px) 100vw, 520px" loading="eager" />
      <div className="habits-scrim" aria-hidden="true" />
      <header>
        <p className="habits-date">{displayDate(date, { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')}</p>
        <HeadingSentence lead="Daily habits." />
      </header>
    </div>
    <RowStack className="habits-rows">
      <GoalCard label="Steps" value={range(habitTargets.steps)} />
      <GoalCard label="Walks" value="Morning, evening, after meals" text />
      <GoalCard label="Water" value={range(habitTargets.hydrationLitres)} unit="L" />
      <Row label={`Sleep · goal ${range(habitTargets.sleepHours)} h, quality first`} value={habitTargets.sleepHours.note} />
      {recovery && <Row label="Recovery · soreness or tightness" value={recovery} />}
      {planning && <Row label="Planning" value={planning} />}
    </RowStack>
    <section className="fuelling" aria-label="Fuelling">
      <p className="row-label">Fuelling · no calorie target</p>
      <p className="row-value">Eat around maintenance, if not more.</p>
      <ul>
        {habitTargets.nutrition.habits.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  </section>;
}
