'use client';

import { Activity, ArrowUpRight, CalendarDays, Dumbbell, House, NotebookPen, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckIns } from './check-ins';
import { Habits } from './habits';
import { Progress } from './progress';
import { Workout } from './workout';
import { addDays, displayDate, programmeDay, restDisplay, trainingWeekStart, weekStart } from '@/lib/insights';
import { sessionKey, type Command, type TrainingData, type TrainingSnapshot } from '@/lib/model';
import { cardioDay, plans, restDay } from '@/lib/programme';
import { availableWeek, programmeWeek, weekPlans } from '@/lib/weeks';
import { docUrl, type DocTarget } from '@/lib/coach-doc';
import { scheduleRestChime } from '@/lib/rest-audio';

const tabs = [
  { id: 'today', label: 'Today', icon: House },
  { id: 'train', label: 'Train', icon: Dumbbell },
  { id: 'habits', label: 'Habits', icon: Activity },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'check-ins', label: 'Check-ins', icon: NotebookPen },
] as const;
type Tab = typeof tabs[number]['id'];
export type Mutate = (command: Command) => Promise<TrainingSnapshot>;

function RestTimer({ deadline, stop }: { deadline: number; stop: () => void }) {
  const [seconds, setSeconds] = useState(() => Math.ceil((deadline - Date.now()) / 1_000));
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000))), 200);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return <aside className="rest-timer" aria-label="Rest timer">
    <div><strong role="timer">{restDisplay(Math.max(0, seconds))}</strong> <span>{seconds > 0 ? 'Rest' : 'Rest complete'}</span></div>
    <button className="secondary" onClick={stop}>{seconds > 0 ? 'Stop' : 'Dismiss'}</button>
  </aside>;
}

function useRest() {
  const [deadline, setDeadline] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const voices = useRef<OscillatorNode[]>([]);

  function cancel() {
    for (const voice of voices.current) { try { voice.stop(); } catch { /* The tone has ended. */ } }
    voices.current = [];
  }

  function primeAudio() {
    try {
      audio.current ??= new AudioContext();
      if (audio.current.state !== 'running') void audio.current.resume().catch(() => {});
    } catch { /* A visual countdown is still available. */ }
  }

  function start(seconds: number) {
    if (seconds <= 0) return;
    cancel();
    setDeadline(Date.now() + seconds * 1_000);
    const context = audio.current;
    if (context) voices.current = scheduleRestChime(context, seconds);
  }

  return { deadline, primeAudio, start, stop: () => { cancel(); setDeadline(0); } };
}

function Week({ date, data }: { date: string; data: TrainingData }) {
  const start = trainingWeekStart(date, data.startedOn);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const programme = weekPlans(data, date);
  const done = new Set(Object.values(data.sessions).filter((session) => session.finishedAt && session.date >= start && session.date <= dates[6]).map((session) => session.planId));
  return <section className="week-section" aria-label="Weekly strength progress">
    <div className="section-line"><h2>This week</h2><span>{done.size} of {programme.length} strength sessions</span></div>
    <ol className="week-track">
      {dates.map((dayDate, index) => {
        const any = Object.values(data.sessions).some((session) => session.date === dayDate && session.finishedAt);
        const scheduled = programme.some((item) => item.day === index + 1);
        return <li key={dayDate} aria-current={dayDate === date ? 'date' : undefined} className={any ? 'complete' : scheduled ? 'scheduled' : ''}>
          <span>{displayDate(dayDate, { weekday: 'short' }).slice(0, 2)}</span>
          <strong aria-label={`${displayDate(dayDate)}, ${any ? 'workout completed' : scheduled ? 'strength planned' : 'no strength planned'}`}>{dayDate.slice(-2).replace(/^0/, '')}</strong>
        </li>;
      })}
    </ol>
  </section>;
}

function Dashboard({ date, today, data, onTrain }: { date: string; today: string; data: TrainingData; onTrain: (id: string) => void }) {
  const day = programmeDay(date, data.startedOn);
  const programme = weekPlans(data, date, weekStart(today));
  const week = programmeWeek(date, data.startedOn ?? weekStart(today));
  const coachWeek = availableWeek(data, date, weekStart(today));
  const plan = programme.find((item) => item.day === day);
  const session = plan ? data.sessions[sessionKey(date, plan.id)] : undefined;
  return <>
    <div className="eyebrow"><CalendarDays size={16} />{displayDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    <h1 className="page-title">Today</h1>
    <section className="today-panel">
      <p className="eyebrow">Week {week} · Day {day} · Brenna’s programme</p>
      <h2>{plan?.name ?? (day === 6 ? 'Cardio' : 'Active rest')}</h2>
      <p>{plan ? `${plan.exercises.length} exercises · ${plan.exercises.reduce((sum, item) => sum + item.sets, 0)} planned sets` : day === 6 ? cardioDay : restDay}</p>
      {plan && <button className="dark-button" onClick={() => onTrain(plan.id)}>{session?.finishedAt ? 'View session' : session ? 'Resume workout' : 'Open workout'}<ArrowUpRight size={18} /></button>}
    </section>
    <Week date={date} data={data} />
    {!!coachWeek?.notes?.length && <section className="coach-notes"><h2>Brenna’s notes · Week {coachWeek.number}</h2>{coachWeek.notes.map((note, index) => <p key={index}>{note}</p>)}</section>}
    <section className="training-list" aria-label="Strength programme">
      <div className="section-line"><h2>Strength programme</h2></div>
      {programme.map((item) => <button className="list-row" key={item.id} onClick={() => onTrain(item.id)}>
        <span><strong>{item.name}</strong><small>Day {item.day} · {item.exercises.length} exercises</small></span><ArrowUpRight size={20} /></button>)}
    </section>
  </>;
}

function ProgrammeSettings({ data, today, defaults, docsReady, serviceEmail, mutate, refresh, saveDoc }: {
  data: TrainingData; today: string; defaults?: DocTarget; docsReady: boolean; serviceEmail?: string;
  mutate: Mutate; refresh: () => Promise<TrainingSnapshot>; saveDoc: (mode: 'programme' | 'checkIns', url: string) => Promise<TrainingSnapshot>;
}) {
  const savedStart = data.startedOn ?? weekStart(today);
  const programme = data.docs?.programme ?? defaults;
  const checkIns = data.docs?.checkIns ?? defaults;
  const [start, setStart] = useState(savedStart);
  const [source, setSource] = useState(programme ? docUrl(programme) : '');
  const [destination, setDestination] = useState(checkIns ? docUrl(checkIns) : '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function run(action: () => Promise<TrainingSnapshot>, message: string) {
    setBusy(true);
    setStatus('');
    try { await action(); setStatus(message); } catch { /* The app shows the error. */ } finally { setBusy(false); }
  }

  function linkForm(event: FormEvent<HTMLFormElement>, mode: 'programme' | 'checkIns', url: string) {
    event.preventDefault();
    void run(() => saveDoc(mode, url), 'Google Doc saved.');
  }

  return <details className="settings"><summary>Programme settings</summary>
    <form onSubmit={(event) => { event.preventDefault(); void run(() => mutate({ type: 'programmeStart', date: start }), 'Programme start saved.'); }}>
      <label className="input-group"><span>Programme start date</span><input aria-label="Programme start date" type="date" max={today} required value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <button className="secondary" disabled={busy || start === savedStart}>Save start date</button>
    </form>
    <div className="section-line"><h2>Coaching Docs</h2>{programme && <a href={docUrl(programme)} target="_blank" rel="noreferrer">Open programme Doc</a>}</div>
    {serviceEmail && <p className="fine">Share a new Doc with <strong>{serviceEmail}</strong>. Give it view access for the programme or edit access for check-ins.</p>}
    <form onSubmit={(event) => linkForm(event, 'programme', source)}>
      <label className="input-group"><span>Programme Doc link</span><input type="url" required value={source} onChange={(event) => setSource(event.target.value)} /></label>
      <button className="secondary" disabled={!docsReady || busy || source === (programme ? docUrl(programme) : '')}>Save programme Doc</button>
    </form>
    <form onSubmit={(event) => linkForm(event, 'checkIns', destination)}>
      <label className="input-group"><span>Check-in Doc link</span><input type="url" required value={destination} onChange={(event) => setDestination(event.target.value)} /></label>
      <button className="secondary" disabled={!docsReady || busy || destination === (checkIns ? docUrl(checkIns) : '')}>Save check-in Doc</button>
    </form>
    <button type="button" className="secondary" disabled={!docsReady || busy} onClick={() => void run(refresh, 'Programme refreshed from Google Docs.')}>Refresh Brenna’s programme</button>
    <p role="status" className="fine">{docsReady ? status : 'Google Docs setup is pending.'}</p>
  </details>;
}

export function TrainingApp({ initial, today, configuredDoc, docsReady, serviceEmail }: {
  initial: TrainingSnapshot; today: string; configuredDoc?: DocTarget; docsReady: boolean; serviceEmail?: string;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [tab, setTab] = useState<Tab>('today');
  const [date, setDate] = useState(today);
  const [planId, setPlanId] = useState<string>(() => plans.find((item) => item.day === programmeDay(today, initial.data.startedOn))?.id ?? plans[0].id);
  const [notice, setNotice] = useState('');
  const rest = useRest();
  const didRefresh = useRef(false);

  useEffect(() => {
    const week = programmeWeek(today, initial.data.startedOn ?? weekStart(today));
    if (!docsReady || didRefresh.current || initial.data.weeks?.[week]) return;
    didRefresh.current = true;
    void fetch('/api/programme/refresh', { method: 'POST' }).then(async (response) => {
      if (!response.ok) return;
      const fresh = await response.json() as TrainingSnapshot;
      setSnapshot((current) => fresh.revision >= current.revision ? fresh : current);
    }).catch(() => {});
  }, [docsReady, initial, today]);

  async function request(path: string, body: unknown) {
    setNotice('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not save. Try again.');
      const saved = result as TrainingSnapshot;
      setSnapshot((current) => saved.revision >= current.revision ? saved : current);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save. Try again.';
      setNotice(message);
      throw new Error(message);
    }
  }

  const mutate: Mutate = (command) => request('/api/training', command);
  const data = snapshot.data;
  function navigate(to: Tab) {
    setNotice('');
    setTab(to);
    window.scrollTo(0, 0);
  }
  function openWorkout(id: string) { setPlanId(id); navigate('train'); }
  function changeDate(input: HTMLInputElement) { if (input.validity.valid && input.value) setDate(input.value); }

  return <>
    <header className="app-header"><div className="shell flex items-center justify-between">
      <button type="button" className="wordmark" onClick={() => navigate('today')} aria-label="Rise Training home">rise<span>.</span></button>
      <label className="date-control"><CalendarDays size={16} aria-hidden="true" /><span className="sr-only">Log date</span>
        <input aria-label="Log date" type="date" value={date} max={today} onInput={(event) => changeDate(event.currentTarget)} onChange={(event) => changeDate(event.currentTarget)} />
      </label>
    </div></header>
    <main className="shell app-body" id="main-content">
      {notice && <p className="notice" role="alert">{notice}</p>}
      {tab === 'today' && <><Dashboard date={date} today={today} data={data} onTrain={openWorkout} /><ProgrammeSettings data={data} today={today} defaults={configuredDoc} docsReady={docsReady} serviceEmail={serviceEmail} mutate={mutate}
        refresh={() => request('/api/programme/refresh', {})} saveDoc={(mode, url) => request('/api/programme/doc-target', { mode, url })} /></>}
      {tab === 'train' && <Workout key={`${date}:${planId}`} date={date} planId={planId} onPlan={setPlanId} data={data} mutate={mutate} startRest={rest.start} primeAudio={rest.primeAudio} />}
      {tab === 'habits' && <Habits key={date} date={date} data={data} mutate={mutate} />}
      {tab === 'progress' && <Progress data={data} />}
      {tab === 'check-ins' && <CheckIns key={date} date={date} data={data} mutate={mutate} destination={data.docs?.checkIns ?? configuredDoc} publish={(id) => request('/api/check-in/publish', { id })} />}
    </main>
    {rest.deadline > 0 && <RestTimer key={rest.deadline} deadline={rest.deadline} stop={rest.stop} />}
    <nav className="bottom-nav" aria-label="Main navigation"><div className="shell nav-grid">
      {tabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => navigate(id)} aria-current={tab === id ? 'page' : undefined}><Icon size={21} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></button>)}
    </div></nav>
  </>;
}
