'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckIns } from './check-ins';
import { Habits } from './habits';
import { Progress } from './progress';
import { StepSync } from './step-sync';
import { Today } from './today';
import { Workout } from './workout';
import { scheduledProgrammeDay, todayKey, weekStart } from '@/lib/insights';
import { sessionKey, type Command, type TrainingData, type TrainingSnapshot } from '@/lib/model';
import { weekPlans } from '@/lib/weeks';
import { docUrl, type DocTarget } from '@/lib/coach-doc';
import type { ProgrammeReview } from '@/lib/programme-review';
import { BottomSheet, FloatingNav, HeadingSentence, PageGradient, Pill, PrimaryButton, tabs, type Tab } from './ui';

export type Mutate = (command: Command) => Promise<TrainingSnapshot>;
type WorkoutSelection = { planId: string; date?: string; previewOnly?: boolean };

function ProgrammeSettings({ data, date, today, defaults, canManageDocs, docsReady, serviceEmail, mutate, changeDate, checkUpdates, saveDoc, close }: {
  data: TrainingData; date: string; today: string; defaults?: DocTarget; canManageDocs: boolean; docsReady: boolean; serviceEmail?: string;
  mutate: Mutate; changeDate: (date: string) => void; checkUpdates: () => void;
  saveDoc: (mode: 'programme' | 'checkIns', url: string) => Promise<TrainingSnapshot>; close: () => void;
}) {
  const savedStart = data.startedOn ?? weekStart(today);
  const programme = data.docs?.programme ?? defaults;
  const checkIns = data.docs?.checkIns ?? defaults;
  const [start, setStart] = useState(savedStart);
  const [source, setSource] = useState(programme ? docUrl(programme) : '');
  const [destination, setDestination] = useState(checkIns ? docUrl(checkIns) : '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function run(action: () => Promise<TrainingSnapshot>, message: string) {
    setBusy(true);
    setStatus('');
    setError('');
    try { await action(); setStatus(message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your settings.'); }
    finally { setBusy(false); }
  }

  function linkForm(event: FormEvent<HTMLFormElement>, mode: 'programme' | 'checkIns', url: string) {
    event.preventDefault();
    void run(() => saveDoc(mode, url), 'Google Doc saved.');
  }

  return <BottomSheet labelId="settings-heading" onClose={() => { if (!busy) close(); }} className="settings-sheet">
    <HeadingSentence id="settings-heading" className="heading-small" lead="Programme settings." />
    <label className="input-group"><span>Log date</span>
      <input type="date" value={date} max={today} required onChange={(event) => {
        if (event.currentTarget.validity.valid && event.currentTarget.value) changeDate(event.currentTarget.value);
      }} />
    </label>
    <form onSubmit={(event) => { event.preventDefault(); void run(() => mutate({ type: 'programmeStart', date: start }), 'Programme start saved.'); }}>
      <label className="input-group"><span>Programme start date</span><input type="date" max={today} required value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <button className="pill" disabled={busy || start === savedStart}>Save start date</button>
    </form>
    {canManageDocs && <>
      <div className="section-line"><h2>Coaching Docs</h2>{programme && <Pill href={docUrl(programme)}>Open programme Doc</Pill>}</div>
      {serviceEmail && <p className="fine">Share a new Doc with <strong>{serviceEmail}</strong>. Give it view access for the programme or edit access for check-ins.</p>}
      <form onSubmit={(event) => linkForm(event, 'programme', source)}>
        <label className="input-group"><span>Programme Doc link</span><input type="url" required value={source} onChange={(event) => setSource(event.target.value)} /></label>
        <button className="pill" disabled={!docsReady || busy || source === (programme ? docUrl(programme) : '')}>Save programme Doc</button>
      </form>
      <form onSubmit={(event) => linkForm(event, 'checkIns', destination)}>
        <label className="input-group"><span>Check-in Doc link</span><input type="url" required value={destination} onChange={(event) => setDestination(event.target.value)} /></label>
        <button className="pill" disabled={!docsReady || busy || destination === (checkIns ? docUrl(checkIns) : '')}>Save check-in Doc</button>
      </form>
    </>}
    {error && <p className="notice" role="alert">{error}</p>}
    <p role="status" className="fine">{status || (canManageDocs && !docsReady ? 'Google Docs setup is pending.' : '')}</p>
    {canManageDocs && <Pill disabled={!docsReady || !programme || busy} onClick={checkUpdates}>Check for programme updates</Pill>}
    <PrimaryButton onClick={close} disabled={busy}>Done</PrimaryButton>
  </BottomSheet>;
}

function ReviewSheet({ result, checking, applying, error, status, close, check, apply }: {
  result?: ProgrammeReview; checking: boolean; applying: boolean; error: string; status: string;
  close: () => void; check: () => void; apply: () => void;
}) {
  return <BottomSheet labelId="review-heading" className="review-sheet" onClose={() => { if (!applying) close(); }}>
    <HeadingSentence id="review-heading" className="heading-small" lead="Programme updates." />
    <p className="fine">Applied changes take effect in workouts you haven’t started. Started workouts keep their original prescriptions.</p>
    {checking && <p role="status">Checking Brenna’s Google Doc…</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    {result && !checking && (result.changes.length ? <div className="row-stack">
      {result.changes.map((change, index) => <details className="programme-change" key={index}>
        <summary><small>Week {change.week}{change.day && ` · Day ${change.day}`}</small><strong>{change.exercise}</strong></summary>
        <dl><dt>Current programme</dt><dd>{change.before || '—'}</dd><dt>From Google Docs</dt><dd>{change.after || '—'}</dd></dl>
      </details>)}
    </div> : !status && <p role="status">Your programme is up to date.</p>)}
    {result?.changes.length ? <PrimaryButton onClick={apply} disabled={checking || applying || !!error}>{applying ? 'Applying…' : 'Apply these updates'}</PrimaryButton>
      : <PrimaryButton onClick={close} disabled={applying}>Done</PrimaryButton>}
    {error && <Pill onClick={check} disabled={checking || applying}>Check again</Pill>}
    {!!result?.changes.length && <Pill onClick={close} disabled={applying}>Decide later</Pill>}
  </BottomSheet>;
}

function tabFromHash(): Tab {
  return tabs.find((tab) => `#${tab.id}` === window.location.hash)?.id ?? 'today';
}

function workoutFor(date: string, data: TrainingData) {
  const active = Object.values(data.sessions).filter((session) => session.date === date && !session.finishedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  return active?.planId ?? weekPlans(data, date).find((plan) => plan.day === scheduledProgrammeDay(date, data))?.id ?? '';
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? 'Could not save. Try again.');
  return result;
}

export function TrainingApp({ initial, today: initialToday, configuredDoc, canManageDocs, docsReady, serviceEmail, firstName, initials, coachText }: {
  initial: TrainingSnapshot; today: string; configuredDoc?: DocTarget; canManageDocs: boolean; docsReady: boolean; serviceEmail?: string;
  firstName: string; initials: string; coachText?: string;
}) {
  const router = useRouter();
  const [savedSnapshot, setSavedSnapshot] = useState<TrainingSnapshot>();
  const snapshot = savedSnapshot && savedSnapshot.revision > initial.revision ? savedSnapshot : initial;
  const [tab, setTab] = useState<Tab>('today');
  const [today, setToday] = useState(initialToday);
  const [logDate, setLogDate] = useState<string>();
  const [workout, setWorkout] = useState<WorkoutSelection>();
  const [focused, setFocused] = useState(false);
  const [settings, setSettings] = useState(false);
  const [stepSyncOpen, setStepSyncOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<ProgrammeReview>();
  const [reviewError, setReviewError] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const lastCheck = useRef(0);
  const checkingRef = useRef(false);

  const data = snapshot.data;
  const date = logDate ?? today;
  const fixedWorkoutDate = workout ? workout.date : logDate;
  const workoutDate = fixedWorkoutDate ?? today;
  const planId = workout?.planId ?? workoutFor(workoutDate, data);
  const source = data.docs?.programme ?? configuredDoc;
  const sourceKey = source ? docUrl(source) : '';
  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    lastCheck.current = Date.now();
    setChecking(true);
    setReviewError('');
    setReviewStatus('');
    try {
      const result: ProgrammeReview = await post('/api/programme/refresh', {});
      setReview(result);
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : 'Could not check for updates.');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    function sync() {
      const current = tabFromHash();
      setTab(current);
      setWorkout(current === 'train' ? window.history.state?.riseWorkout : undefined);
      setFocused(false);
    }
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  useEffect(() => {
    function refreshLog() {
      if (document.visibilityState === 'visible') router.refresh();
    }
    document.addEventListener('visibilitychange', refreshLog);
    return () => document.removeEventListener('visibilitychange', refreshLog);
  }, [router]);

  useEffect(() => {
    let timer: number;
    function refreshDate() {
      window.clearTimeout(timer);
      setToday(todayKey());
      timer = window.setTimeout(refreshDate, 60_000 - Date.now() % 60_000);
    }
    refreshDate();
    window.addEventListener('focus', refreshDate);
    document.addEventListener('visibilitychange', refreshDate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refreshDate);
      document.removeEventListener('visibilitychange', refreshDate);
    };
  }, []);

  useEffect(() => {
    if (!docsReady || !sourceKey) return;
    void check();
    function refreshOnReturn() {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > 300_000) void check();
    }
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => document.removeEventListener('visibilitychange', refreshOnReturn);
  }, [docsReady, sourceKey, check]);

  async function request(path: string, body: unknown) {
    const saved: TrainingSnapshot = await post(path, body);
    setSavedSnapshot((current) => !current || saved.revision >= current.revision ? saved : current);
    return saved;
  }

  async function applyUpdates() {
    if (!review?.changes.length || checking || applying) return;
    setApplying(true);
    setReviewError('');
    try {
      await request('/api/programme/refresh', { approve: review.fingerprint });
      setReview(undefined);
      setReviewStatus('Programme updates applied.');
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : 'Could not apply the updates. Try again.');
    } finally { setApplying(false); }
  }

  const mutate: Mutate = (command) => request('/api/training', command);
  function navigate(to: Tab, selected?: WorkoutSelection) {
    setTab(to);
    setWorkout(selected);
    setFocused(false);
    const state = { ...window.history.state, riseWorkout: selected };
    if (window.location.hash !== `#${to}`) window.history.pushState(state, '', `#${to}`);
    else window.history.replaceState(state, '');
    window.scrollTo(0, 0);
  }

  function selectWorkout(selected: WorkoutSelection) {
    setWorkout(selected);
    window.history.replaceState({ ...window.history.state, riseWorkout: selected }, '');
  }

  function openWorkout(id: string, selected: string) {
    setToday(todayKey());
    navigate('train', { planId: id, date: selected, previewOnly: selected !== logDate });
  }

  function pinWorkout(id: string) {
    const current = todayKey();
    setToday(current);
    if (workoutDate > current || (workoutDate !== current && !data.sessions[sessionKey(workoutDate, id)] && workoutDate !== logDate)) return false;
    selectWorkout({ planId: id, date: workoutDate, previewOnly: workoutDate !== logDate });
    return true;
  }

  function changeDate(selected: string) {
    setLogDate(selected === today ? undefined : selected);
    setWorkout(undefined);
  }

  function openReview(force = false) {
    setSettings(false);
    setReviewOpen(true);
    if (force || !review || reviewError) void check();
  }

  return <PageGradient className={tab === 'today' ? 'page-today' : ''}>
    <main id="main-content">
      {tab === 'today' && <Today key={`${date}:${data.startedOn}`} date={date} today={today} data={data} firstName={firstName} initials={initials} openWorkout={openWorkout} openHabits={() => navigate('habits')}
        openCheckIn={() => navigate('check-ins')} openSettings={() => setSettings(true)}
        reviewLabel={review?.changes.length ? 'Review programme changes' : reviewError ? 'Check programme updates' : undefined} openReview={() => openReview()} />}
      {tab === 'train' && <Workout key={`${workoutDate}:${planId}`} date={workoutDate} today={today} planId={planId} data={data} coachText={coachText}
        previewOnly={workout?.previewOnly} onOpen={pinWorkout} onLogToday={(id) => openWorkout(id, today)}
        onPlan={(id) => selectWorkout({ ...workout, planId: id, date: fixedWorkoutDate })}
        mutate={mutate} onBack={() => navigate('today')} setFocused={setFocused} />}
      {tab === 'habits' && <Habits date={date} steps={data.habits[date]?.steps}
        openStepSync={() => setStepSyncOpen(true)} />}
      {tab === 'progress' && <Progress data={data} date={date} openWorkout={openWorkout} />}
      {tab === 'check-ins' && <CheckIns key={date} date={date} data={data} mutate={mutate} canManageDocs={canManageDocs} docsReady={docsReady}
        destination={data.docs?.checkIns ?? configuredDoc} publish={(id) => request('/api/check-in/publish', { id })} setFocused={setFocused} done={() => navigate('today')} />}
    </main>
    {!focused && <FloatingNav tab={tab} onNavigate={(to) => {
      if (to === tab) { window.scrollTo(0, 0); return; }
      if (to === 'train') setToday(todayKey());
      navigate(to);
    }} />}
    {settings && <ProgrammeSettings data={data} date={date} today={today} defaults={configuredDoc} canManageDocs={canManageDocs} docsReady={docsReady} serviceEmail={serviceEmail} mutate={mutate}
      close={() => setSettings(false)} changeDate={changeDate} checkUpdates={() => openReview(true)}
      saveDoc={(mode, url) => request('/api/programme/doc-target', { mode, url })} />}
    {stepSyncOpen && <StepSync unlocked={canManageDocs} close={() => setStepSyncOpen(false)} />}
    {reviewOpen && <ReviewSheet result={review} checking={checking} applying={applying} error={reviewError} status={reviewStatus}
      close={() => setReviewOpen(false)} check={() => void check()} apply={() => void applyUpdates()} />}
  </PageGradient>;
}
