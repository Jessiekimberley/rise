'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckIns } from './check-ins';
import { Habits } from './habits';
import { Today } from './today';
import { Workout } from './workout';
import { scheduledProgrammeDay, todayKey } from '@/lib/insights';
import { type Command, type TrainingData, type TrainingSnapshot } from '@/lib/model';
import { weekPlans } from '@/lib/weeks';
import { docUrl, type DocTarget } from '@/lib/coach-doc';
import type { ProgrammeReview } from '@/lib/programme-review';
import { FloatingNav, PageGradient, tabs, type Tab } from './ui';

export type Mutate = (command: Command) => Promise<TrainingSnapshot>;
type WorkoutSelection = { planId: string; date?: string };

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

export function TrainingApp({ initial, today: initialToday, configuredDoc, docsReady, firstName, coachText }: {
  initial: TrainingSnapshot; today: string; configuredDoc?: DocTarget; docsReady: boolean;
  firstName: string; coachText?: string;
}) {
  const router = useRouter();
  const [savedSnapshot, setSavedSnapshot] = useState<TrainingSnapshot>();
  const snapshot = savedSnapshot && savedSnapshot.revision > initial.revision ? savedSnapshot : initial;
  const [tab, setTab] = useState<Tab>('today');
  const [today, setToday] = useState(initialToday);
  const [workout, setWorkout] = useState<WorkoutSelection>();
  const [focused, setFocused] = useState(false);

  const data = snapshot.data;
  const fixedWorkoutDate = workout?.date;
  const workoutDate = fixedWorkoutDate ?? today;
  const planId = workout?.planId ?? workoutFor(workoutDate, data);
  const source = data.docs?.programme ?? configuredDoc;
  const sourceKey = source ? docUrl(source) : '';

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
    let cancelled = false;
    void (async () => {
      try {
        const result: ProgrammeReview = await post('/api/programme/refresh', {});
        if (cancelled || !result.changes.length) return;
        await post('/api/programme/refresh', { approve: result.fingerprint });
        if (!cancelled) router.refresh();
      } catch {
        // The saved programme stays available.
      }
    })();
    return () => { cancelled = true; };
  }, [docsReady, sourceKey, router]);

  async function request(path: string, body: unknown) {
    const saved: TrainingSnapshot = await post(path, body);
    setSavedSnapshot((current) => !current || saved.revision >= current.revision ? saved : current);
    return saved;
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
    const current = todayKey();
    setToday(current);
    navigate('train', { planId: id, date: selected });
  }

  function pinWorkout(id: string) {
    const current = todayKey();
    setToday(current);
    if (workoutDate > current) return false;
    selectWorkout({ planId: id, date: workoutDate });
    return true;
  }

  return <PageGradient className={tab === 'today' ? 'page-today' : ''}>
    <main id="main-content">
      {tab === 'today' && <Today key={`${today}:${data.startedOn}`} today={today} data={data} firstName={firstName} openWorkout={openWorkout}
        openCheckIn={() => navigate('check-ins')} />}
      {tab === 'train' && <Workout key={`${workoutDate}:${planId}`} date={workoutDate} today={today} planId={planId} data={data} coachText={coachText}
        onOpen={pinWorkout} onLogToday={(id) => openWorkout(id, today)}
        onPlan={(id) => selectWorkout({ ...workout, planId: id, date: fixedWorkoutDate })}
        mutate={mutate} onBack={() => navigate('today')} setFocused={setFocused} />}
      {tab === 'habits' && <Habits date={today} />}
      {tab === 'check-ins' && <CheckIns key={today} date={today} data={data} mutate={mutate} docsReady={docsReady}
        destination={data.docs?.checkIns ?? configuredDoc} publish={(id) => request('/api/check-in/publish', { id })} setFocused={setFocused} done={() => navigate('today')} />}
    </main>
    {!focused && <FloatingNav tab={tab} onNavigate={(to) => {
      if (to === tab) { window.scrollTo(0, 0); return; }
      if (to === 'train') setToday(todayKey());
      navigate(to);
    }} />}
  </PageGradient>;
}
