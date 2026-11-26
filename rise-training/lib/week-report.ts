import type { CheckIn, HabitLog, Session, SetLog, SlotLog, TrainingData } from './model';
import { orderedSlots } from './model';
import { findExercise, findPlan } from './programme';
import { habitGoals, type ProgrammeSnapshot } from './prescription';
import {
  addDays, datesThrough, displayDate, formatCount, goalSpan, rirDisplay, scheduledProgrammeDay, weekStart,
  type HabitGoals,
} from './insights';

const empty = '—';

export type WeekChip = { label: string; tone: 'good' | 'plain' };
export type WeekExercise = { name: string; sets: string };
export type WeekNote = { label: string; text: string };
export type WeekDayState = 'done' | 'today' | 'future' | 'empty';
export type WeekDay = {
  date: string;
  weekday: string;
  day: string;
  title: string;
  subtitle: string;
  state: WeekDayState;
  chips: WeekChip[];
  exercises: WeekExercise[];
  notes: WeekNote[];
};
export type WeekCheckIn = {
  id: string;
  heading: string;
  wins?: string;
  hard?: string;
  question?: string;
  body?: string;
  logOnly: boolean;
};
export type WeekLift = { name: string; now: string; delta: string; improved: boolean };
export type WeekStat = { label: string; value: string; unit: string; note: string };
export type WeekReport = {
  start: string;
  end: string;
  label: string;
  thisWeek: boolean;
  stats: WeekStat[];
  days: WeekDay[];
  checkIns: WeekCheckIn[];
  due: string;
  lifts: WeekLift[];
};

const sectionHeads = [
  ['wins', /^(?:wins|what went well)\b\s*[:.\-–—]?\s*/i],
  ['hard', /^what(?:'|’)s been hard\b\s*[:.\-–—]?\s*/i],
  ['question', /^questions?(?: for (?:you|brenna))?\b\s*[:.\-–—]?\s*/i],
] as const;

export function presentCheckIn(text: string): Pick<WeekCheckIn, 'wins' | 'hard' | 'question' | 'body' | 'logOnly'> {
  const buckets = new Map<string, string[]>();
  let current: string | undefined;
  for (const line of text.split('\n')) {
    const head = sectionHeads.find(([, pattern]) => pattern.test(line.trim()));
    if (head) {
      current = head[0];
      const rest = line.trim().replace(head[1], '').trim();
      const lines = buckets.get(current) ?? [];
      if (rest) lines.push(rest);
      buckets.set(current, lines);
    } else if (current) {
      (buckets.get(current) ?? []).push(line);
    }
  }
  const take = (key: string) => buckets.get(key)?.join('\n').trim() || undefined;
  if (buckets.size) {
    return { wins: take('wins'), hard: take('hard'), question: take('question'), logOnly: false };
  }
  const body = text.trim();
  return { body: body || undefined, logOnly: body.length > 280 || /\bset \d+:/i.test(body) };
}

function joinAnd(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function average(values: number[]) {
  if (!values.length) return;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
}

function amount(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

export function weekRangeLabel(start: string, end: string, today: string) {
  const leftMonth = displayDate(start, { month: 'short' });
  const rightMonth = displayDate(end, { month: 'short' });
  const left = leftMonth === rightMonth
    ? `${displayDate(start, { weekday: 'short' })} ${displayDate(start, { day: 'numeric' })}`
    : `${displayDate(start, { weekday: 'short' })} ${displayDate(start, { day: 'numeric' })} ${leftMonth}`;
  const year = end.slice(0, 4) === today.slice(0, 4) ? '' : ` ${end.slice(0, 4)}`;
  const current = start === weekStart(today) ? ' · this week' : '';
  return `${left} – ${displayDate(end, { weekday: 'short' })} ${displayDate(end, { day: 'numeric' })} ${rightMonth}${year}${current}`;
}

function workoutNumber(session: Session) {
  return session.plan?.day ?? findPlan(session.planId)?.day;
}

type SetKind = 'warm-up' | 'upper' | 'lower';

function loggedSets(slot: SlotLog): { set: SetLog; kind?: SetKind }[] {
  const extras: { set: SetLog; kind?: SetKind }[] = [];
  if (slot.warmup) extras.push({ set: slot.warmup, kind: 'warm-up' });
  if (slot.upper) extras.push({ set: slot.upper, kind: 'upper' });
  if (slot.lower) extras.push({ set: slot.lower, kind: 'lower' });
  const working = Object.keys(slot.sets).map(Number).filter((index) => index >= 0 && slot.sets[index]).sort((a, b) => a - b);
  return [...extras, ...working.map((index) => ({ set: slot.sets[index] }))];
}

function formatSet(set: SetLog, kind?: SetKind) {
  const effort = kind ? '' : set.effort != null ? ` (${rirDisplay(10 - set.effort)})` : '';
  const tag = kind ? ` (${kind})` : '';
  if (set.seconds != null) return `${set.seconds} s${effort}${tag}`;
  const side = set.perSide === 'leg' ? '/leg' : set.perSide === 'side' ? '/side' : '';
  if (set.weight != null && set.reps != null) return `${amount(set.weight)} × ${set.reps}${side}${effort}${tag}`;
  if (set.reps != null) return `${set.reps}${side} reps${effort}${tag}`;
  if (set.weight != null) return `${amount(set.weight)} kg${effort}${tag}`;
  return empty;
}

function slotName(session: Session, slotId: string, slot: SlotLog) {
  const planned = session.plan?.exercises.find((exercise) => exercise.id === slotId);
  const logged = loggedSets(slot)[0]?.set;
  const name = planned?.name ?? logged?.exerciseName ?? findExercise(logged?.exerciseId ?? slot.exerciseId)?.name ?? findExercise(slotId)?.name ?? slotId;
  const variant = (logged?.variant || slot.variant || '').trim();
  return variant ? `${name} · ${variant}` : name;
}

function daySessions(data: TrainingData, date: string) {
  return Object.values(data.sessions).filter((session) => session.date === date)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function primarySession(sessions: Session[]) {
  return sessions.find((session) => !session.finishedAt) ?? sessions.at(-1);
}

function bestSets(data: TrainingData, start: string, end: string) {
  const best = new Map<string, { name: string; weight: number; reps: number; order: number }>();
  let order = 0;
  const sessions = Object.values(data.sessions).filter((session) => session.date >= start && session.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt));
  for (const session of sessions) {
    for (const [slotId, slot] of orderedSlots(session)) {
      for (const { set } of loggedSets(slot)) {
        if (set.weight == null) continue;
        const name = slotName(session, slotId, slot).replace(/ · .+$/, '');
        const reps = set.reps ?? 0;
        const current = best.get(set.exerciseId);
        order += 1;
        if (!current || set.weight > current.weight || (set.weight === current.weight && reps > current.reps)) {
          best.set(set.exerciseId, { name, weight: set.weight, reps, order: current?.order ?? order });
        }
      }
    }
  }
  return best;
}

function noteKinds(workout: number, sleep: number, fuel: number) {
  const names = [workout ? 'Workout' : '', sleep ? 'sleep' : '', fuel ? 'fuelling' : ''].filter(Boolean);
  if (!names.length) return '';
  if (names.length === 1) return names[0] === 'Workout' ? 'Workout' : `${names[0][0].toUpperCase()}${names[0].slice(1)}`;
  return joinAnd(names);
}

function habitChips(habit: HabitLog | undefined, goals: HabitGoals): WeekChip[] {
  if (!habit) return [];
  const chips: WeekChip[] = [];
  if (habit.steps != null) {
    const hit = habit.steps >= goals.steps.min && habit.steps <= goals.steps.max;
    chips.push({ label: `${formatCount(habit.steps)} steps`, tone: hit ? 'good' : 'plain' });
  }
  if (typeof habit.waterHitTarget === 'boolean') {
    chips.push({ label: habit.waterHitTarget ? 'Water ✓' : 'Water ✗', tone: habit.waterHitTarget ? 'good' : 'plain' });
  }
  if (habit.sleep != null) {
    const hit = habit.sleep >= goals.sleepHours.min && habit.sleep <= goals.sleepHours.max;
    chips.push({ label: `${roundTo(habit.sleep, 1)} h sleep`, tone: hit ? 'good' : 'plain' });
  }
  return chips;
}

export function buildWeekReport(data: TrainingData, programme: ProgrammeSnapshot, today: string, start = weekStart(today)): WeekReport {
  const end = addDays(start, 6);
  const dates = datesThrough(start, end);
  const goals = habitGoals(programme.state, end);
  const finished = new Set<number>();
  const progressing = new Set<number>();
  for (const date of dates) {
    for (const session of daySessions(data, date)) {
      const number = workoutNumber(session);
      if (!number) continue;
      if (session.finishedAt) finished.add(number);
      else progressing.add(number);
    }
  }
  for (const number of finished) progressing.delete(number);
  const left = [1, 2, 3, 4, 5, 6, 7].filter((number) => !finished.has(number) && !progressing.has(number));
  const checkIns = Object.values(data.checkIns).filter((entry) => entry.start <= end && entry.end >= start)
    .sort((a, b) => b.end.localeCompare(a.end) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  const hasWeekly = checkIns.some((entry) => entry.kind === 'weekly');
  const viewingCurrent = start <= today && today <= end;
  const due = !hasWeekly && viewingCurrent ? 'Weekly check-in due Sunday' : !hasWeekly && today > end ? 'No weekly check-in for this week' : '';

  let firstFuture = true;
  let workoutNotes = 0;
  let sleepNotes = 0;
  let fuelNotes = 0;
  let brokenNights = 0;
  const stepValues: number[] = [];
  let waterHits = 0;
  let waterAnswers = 0;
  const sleepValues: number[] = [];

  const days: WeekDay[] = dates.map((date) => {
    const habit = data.habits[date];
    const goalsForDay = habitGoals(programme.state, date);
    if (habit?.steps != null) stepValues.push(habit.steps);
    if (typeof habit?.waterHitTarget === 'boolean') {
      waterAnswers += 1;
      if (habit.waterHitTarget) waterHits += 1;
    }
    if (habit?.sleep != null) sleepValues.push(habit.sleep);
    if (habit?.sleepQuality === 'Broken') brokenNights += 1;
    if (habit?.sleepNote?.trim()) sleepNotes += 1;
    if (habit?.fuellingNote?.trim()) fuelNotes += 1;
    const dayNote = data.dayNotes?.[date]?.trim() ?? '';
    const sessions = daySessions(data, date);
    const session = primarySession(sessions);
    const slotNotes: string[] = [];
    const exercises: WeekExercise[] = [];
    let logged = 0;
    if (session) {
      for (const [slotId, slot] of orderedSlots(session)) {
        const sets = loggedSets(slot);
        if (sets.length) {
          logged += sets.length;
          exercises.push({ name: slotName(session, slotId, slot), sets: sets.map(({ set, kind }) => formatSet(set, kind)).join(' · ') });
        }
        const note = slot.note?.trim();
        if (note) slotNotes.push(note);
      }
    }
    if (dayNote || slotNotes.length) workoutNotes += (dayNote ? 1 : 0) + slotNotes.length;
    const notes: WeekNote[] = [];
    const workoutText = [dayNote, slotNotes.join('\n\n')].filter(Boolean).join('\n\n');
    if (workoutText) notes.push({ label: 'Workout note', text: workoutText });
    if (habit?.sleepNote?.trim()) notes.push({ label: 'Sleep note', text: habit.sleepNote.trim() });
    if (habit?.fuellingNote?.trim()) notes.push({ label: 'Fuelling note', text: habit.fuellingNote.trim() });

    const future = date > today;
    const chips = habitChips(habit, goalsForDay);
    const number = session ? workoutNumber(session) : undefined;
    const plan = session ? session.plan ?? findPlan(session.planId) : undefined;
    const name = plan?.name ?? (number ? `Workout ${number}` : '');
    const title = session && number ? `Workout ${number} · ${name}` : 'Nothing logged yet';
    const usual = number ? dates.find((day) => scheduledProgrammeDay(day, data) === number) : undefined;
    const swapped = session && usual && usual !== date;
    const swapText = swapped && usual
      ? `${usual > date ? 'swapped forward from' : 'swapped from'} ${displayDate(usual, { weekday: 'long' })}`
      : '';
    const exerciseCount = exercises.length;
    const prescribed = plan?.exercises.reduce((sum, exercise) => sum + exercise.sets, 0) ?? 0;
    const inProgress = Boolean(session && !session.finishedAt);
    let subtitle = '';
    if (session && inProgress) {
      const progress = prescribed ? `${logged} of ${prescribed} ${prescribed === 1 ? 'set' : 'sets'}` : `${logged} ${logged === 1 ? 'set' : 'sets'}`;
      subtitle = `${date === today ? 'Today · ' : ''}in progress · ${progress}`;
    } else if (session?.finishedAt) {
      const detail = exerciseCount
        ? `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'} · ${logged} ${logged === 1 ? 'set' : 'sets'}`
        : '';
      subtitle = ['Done', swapText, detail].filter(Boolean).join(' · ');
    } else if (future) {
      const bits: string[] = [];
      if (firstFuture && left.length) bits.push(`Left this week: Workouts ${joinAnd(left.map(String))}`);
      if (date === end && !hasWeekly && viewingCurrent) bits.push('Weekly check-in due');
      subtitle = bits.join(' · ');
      firstFuture = false;
    } else if (date === today) {
      subtitle = 'Today · nothing logged yet';
    } else if (chips.length || notes.length) {
      subtitle = 'No workout logged';
    }
    if (!session && date === end && !hasWeekly && viewingCurrent && !subtitle.includes('Weekly check-in due')) {
      subtitle = [subtitle, 'Weekly check-in due'].filter(Boolean).join(' · ');
    }

    if (inProgress && !chips.length) chips.push({ label: 'In progress', tone: 'plain' });
    const state: WeekDayState = future && !session ? 'future' : date === today ? 'today' : session ? 'done' : 'empty';
    return {
      date,
      weekday: displayDate(date, { weekday: 'short' }),
      day: displayDate(date, { day: 'numeric' }),
      title,
      subtitle,
      state,
      chips,
      exercises,
      notes,
    };
  });

  const stepAverage = average(stepValues);
  const sleepAverage = average(sleepValues);
  const progressList = [...progressing].sort((a, b) => a - b);
  const progressNote = progressList.length
    ? `+ ${progressList.length === 1 ? `Workout ${progressList[0]}` : `Workouts ${joinAnd(progressList.map(String))}`} in progress`
    : finished.size ? '' : 'No workouts logged';
  const noteCount = workoutNotes + sleepNotes + fuelNotes;
  const sleepNote = [`Goal ${goalSpan(goals.sleepHours.min, goals.sleepHours.max)} h`];
  if (brokenNights) sleepNote.push(`${brokenNights} broken ${brokenNights === 1 ? 'night' : 'nights'}`);
  else if (sleepNotes) sleepNote.push(`${sleepNotes} ${sleepNotes === 1 ? 'night' : 'nights'} with a sleep note`);

  const thisWeekSets = bestSets(data, start, end);
  const lastWeekSets = bestSets(data, addDays(start, -7), addDays(start, -1));
  const lifts = [...thisWeekSets.entries()].sort((a, b) => a[1].order - b[1].order).map(([id, current]) => {
    const earlier = lastWeekSets.get(id);
    let delta = empty;
    let improved = false;
    if (earlier) {
      const diff = Math.round((current.weight - earlier.weight) * 1000) / 1000;
      if (diff === 0) delta = 'same';
      else {
        improved = diff > 0;
        delta = `${diff > 0 ? '+' : '−'}${amount(Math.abs(diff))} kg`;
      }
    }
    return { name: current.name, now: `${amount(current.weight)} × ${current.reps}`, delta, improved };
  });

  const presented = checkIns.map((entry) => ({ ...checkInHeading(entry), ...presentCheckIn(entry.text) }));

  return {
    start, end, label: weekRangeLabel(start, end, today), thisWeek: start === weekStart(today),
    stats: [
      { label: 'Workouts', value: finished.size ? String(finished.size) : empty, unit: finished.size ? ' of 7' : '', note: progressNote },
      { label: 'Avg steps', value: stepAverage == null ? empty : formatCount(Math.round(stepAverage)), unit: '', note: `Goal ${goalSpan(goals.steps.min, goals.steps.max)}` },
      { label: 'Water target hit', value: waterAnswers ? String(waterHits) : empty, unit: waterAnswers ? ` of ${waterAnswers} ${waterAnswers === 1 ? 'day' : 'days'}` : '', note: `Goal ${goalSpan(goals.hydrationLitres.min, goals.hydrationLitres.max)} L` },
      { label: 'Avg sleep', value: sleepAverage == null ? empty : roundTo(sleepAverage, 1), unit: sleepAverage == null ? '' : ' h', note: sleepNote.join(' · ') },
      { label: 'Notes', value: noteCount ? String(noteCount) : empty, unit: '', note: noteKinds(workoutNotes, sleepNotes, fuelNotes) },
    ],
    days, checkIns: presented, due, lifts,
  };
}

function checkInHeading(entry: CheckIn): Pick<WeekCheckIn, 'id' | 'heading'> {
  const kind = entry.kind === 'midweek' ? 'Midweek' : 'Weekly';
  return {
    id: entry.id,
    heading: `${kind} · ${displayDate(entry.end, { weekday: 'short' })} ${displayDate(entry.end, { day: 'numeric' })} ${displayDate(entry.end, { month: 'short' })}`,
  };
}

export function formatWeekReport(report: WeekReport) {
  const lines = [`Jessie's week · ${report.label}`, ''];
  for (const stat of report.stats) {
    lines.push(`${stat.label}: ${stat.value}${stat.unit}`);
    if (stat.note) lines.push(stat.note);
  }
  lines.push('');
  for (const day of report.days) {
    lines.push(`${day.weekday} ${day.day} · ${day.title}`);
    if (day.subtitle) lines.push(day.subtitle);
    if (day.chips.length) lines.push(day.chips.map((chip) => chip.label).join(' · '));
    for (const exercise of day.exercises) lines.push(`${exercise.name}: ${exercise.sets}`);
    for (const note of day.notes) lines.push(`${note.label}: ${note.text}`);
    lines.push('');
  }
  if (report.checkIns.length) {
    lines.push('Check-ins');
    for (const entry of report.checkIns) {
      lines.push(entry.heading);
      if (entry.wins) lines.push(`Wins: ${entry.wins}`);
      if (entry.hard) lines.push(`What's been hard: ${entry.hard}`);
      if (entry.question) lines.push(`Question for you: ${entry.question}`);
      if (entry.logOnly) lines.push('Training log saved for this check-in.');
      else if (entry.body) lines.push(entry.body);
    }
    if (report.due) lines.push(report.due);
    lines.push('');
  } else if (report.due) {
    lines.push(report.due, '');
  }
  if (report.lifts.length) {
    lines.push('Top sets vs last week');
    for (const lift of report.lifts) lines.push(`${lift.name}: ${lift.now} (${lift.delta})`);
  } else lines.push('No weighted sets logged this week.');
  return lines.join('\n').trim();
}
