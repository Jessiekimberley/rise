'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { addDays, weekStart } from '@/lib/insights';
import type { TrainingData } from '@/lib/model';
import type { ProgrammeSnapshot } from '@/lib/prescription';
import { buildWeekReport, weekRangeLabel, type WeekDay } from '@/lib/week-report';

export function WeekControls({ start, today, onStart, onAdjust }: {
  start: string; today: string; onStart: (start: string) => void; onAdjust: () => void;
}) {
  const end = addDays(start, 6);
  const earliest = addDays(weekStart(today), -52 * 7);
  return <div className="week-controls">
    <button type="button" className="round-button" aria-label="Previous week" disabled={start <= earliest} onClick={() => onStart(addDays(start, -7))}>
      <ChevronLeft size={18} aria-hidden="true" />
    </button>
    <span className="week-label">{weekRangeLabel(start, end, today)}</span>
    <button type="button" className="round-button" aria-label="Next week" disabled={start >= weekStart(today)} onClick={() => onStart(addDays(start, 7))}>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
    <button type="button" className="admin-commit" onClick={onAdjust}>Adjust the plan</button>
  </div>;
}

function DayBody({ day }: { day: WeekDay }) {
  return <div className="week-day-body">
    <div>
      <p className="admin-kicker">Sets logged · weight × reps (RIR)</p>
      {day.exercises.length ? day.exercises.map((exercise) => <div key={exercise.name} className="week-set">
        <span>{exercise.name}</span>
        <span>{exercise.sets}</span>
      </div>) : <p className="fine">No sets logged.</p>}
    </div>
    {day.notes.length > 0 && <div className="week-notes">
      {day.notes.map((note) => <p key={note.label}><span>{note.label}</span><strong>{note.text}</strong></p>)}
    </div>}
  </div>;
}

export function WeekReport({ today, data, programme, start }: {
  today: string; data: TrainingData; programme: ProgrammeSnapshot; start: string;
}) {
  const report = buildWeekReport(data, programme, today, start);
  const preferred = report.days.find((day) => day.date === today && day.state === 'today' && (day.exercises.length || day.notes.length || day.subtitle.includes('progress')));
  const fallback = [...report.days].reverse().find((day) => day.state !== 'future' && (day.exercises.length || day.notes.length));
  const [open, setOpen] = useState(preferred?.date ?? fallback?.date);
  const baseId = useId();
  return <div className="week-report">
    <section className="week-stats" aria-label="Week summary">
      {report.stats.map((stat) => <article key={stat.label} className="week-stat">
        <span>{stat.label}</span>
        <strong>{stat.value}{stat.unit && <small>{stat.unit}</small>}</strong>
        {stat.note && <span className="fine">{stat.note}</span>}
      </article>)}
    </section>
    <div className="week-layout">
      <section className="week-days" aria-label="Day by day">
        <p className="admin-kicker">Day by day · tap a day to open it</p>
        {report.days.map((day) => {
          const expanded = open === day.date && day.state !== 'future';
          const panelId = `${baseId}-${day.date}`;
          return <article key={day.date} className={`week-day is-${day.state}`}>
            {day.state === 'future' ? <div className="week-day-toggle">
              <DayFace day={day} open={false} />
            </div> : <button type="button" className="week-day-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? undefined : day.date)}>
              <DayFace day={day} open={expanded} />
            </button>}
            {expanded && <div id={panelId}><DayBody day={day} /></div>}
          </article>;
        })}
      </section>
      <aside className="week-side">
        <section className="week-card" aria-label="Check-ins">
          <header>
            <p className="admin-kicker">Check-ins</p>
            {report.checkIns[0] && <span className="fine">{report.checkIns[0].heading}</span>}
          </header>
          {report.checkIns.length ? report.checkIns.map((entry, index) => <div key={entry.id} className="week-check">
            {index > 0 && <p className="fine">{entry.heading}</p>}
            {entry.wins && <p><span>Wins</span><strong>{entry.wins}</strong></p>}
            {entry.hard && <p><span>What&apos;s been hard</span><strong>{entry.hard}</strong></p>}
            {entry.question && <p className="week-question"><span>Question for you</span><strong>{entry.question}</strong></p>}
            {entry.logOnly && <p className="week-serif">Training log saved for this check-in.</p>}
            {!entry.logOnly && entry.body && <p className="week-serif">{entry.body}</p>}
          </div>) : <p className="week-serif">No check-in yet this week.</p>}
          {report.due && <p className="fine">{report.due}</p>}
        </section>
        <section className="week-card" aria-label="Main lifts versus last week">
          <p className="admin-kicker">Top sets vs last week</p>
          {report.lifts.length ? report.lifts.map((lift) => <div key={lift.name} className="week-lift">
            <span>{lift.name}</span>
            <span>{lift.now}</span>
            <span className={lift.improved ? 'week-delta is-up' : 'week-delta'}>{lift.delta}</span>
          </div>) : <p className="fine">No weighted sets logged this week.</p>}
        </section>
      </aside>
    </div>
  </div>;
}

function DayFace({ day, open }: { day: WeekDay; open: boolean }) {
  return <>
    <span className="week-date"><span>{day.weekday}</span><strong>{day.day}</strong></span>
    <span className="week-copy"><strong>{day.title}</strong>{day.subtitle && <small>{day.subtitle}</small>}</span>
    <span className="week-chips">{day.chips.map((chip) => <span key={chip.label} className={chip.tone === 'good' ? 'week-chip is-good' : 'week-chip'}>{chip.label}</span>)}</span>
    <ChevronDown size={18} aria-hidden="true" className={open ? 'week-chev is-open' : 'week-chev'} />
  </>;
}
