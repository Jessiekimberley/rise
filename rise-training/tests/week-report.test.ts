import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWeekReport, formatWeekReport, presentCheckIn } from '../lib/week-report';
import { emptyHabits, type Session, type SetLog, type TrainingData } from '../lib/model';
import { emptyProgramme, type ProgrammeSnapshot } from '../lib/prescription';
import type { Plan } from '../lib/programme';

const programme: ProgrammeSnapshot = { revision: 0, state: emptyProgramme() };
const today = '2026-11-26';
const blank = (): TrainingData => ({ sessions: {}, habits: {}, checkIns: {} });

function logged(partial: Partial<SetLog> & Pick<SetLog, 'exerciseId' | 'weight' | 'reps'>): SetLog {
  return { variant: '', seconds: null, effort: null, ...partial };
}

const lower: Plan = {
  id: 'lower-1', day: 1, name: 'Lower body',
  exercises: [
    { id: 'leg-press', name: 'Leg Press', target: '8 reps', sets: 4, rest: 120, cue: '' },
    { id: 'rdl', name: 'RDL', target: '8 reps', sets: 3, rest: 120, cue: '' },
  ],
};

test('an empty week shows dashes and the workouts still left', () => {
  const report = buildWeekReport(blank(), programme, today);
  assert.equal(report.label, 'Mon 23 – Sun 29 Nov · this week');
  assert.equal(report.stats.every((stat) => stat.value === '—'), true);
  assert.equal(report.stats[0].note, 'No workouts logged');
  assert.equal(report.days[0].state, 'empty');
  assert.equal(report.days[3].state, 'today');
  assert.equal(report.days[3].subtitle, 'Today · nothing logged yet');
  assert.equal(report.days[4].state, 'future');
  assert.equal(report.days[4].subtitle, 'Left this week: Workouts 1, 2, 3, 4, 5, 6 and 7');
  assert.equal(report.days[6].subtitle, 'Weekly check-in due');
  assert.equal(report.due, 'Weekly check-in due Sunday');
  assert.equal(report.lifts.length, 0);
});

test('the week report is built from logged sets, habits and check-ins', () => {
  const monday: Session = {
    date: '2026-11-23', planId: 'lower-1', startedAt: '2026-11-23T18:00:00.000Z', finishedAt: '2026-11-23T19:00:00.000Z', plan: lower,
    slots: {
      'leg-press': {
        exerciseId: 'leg-press', variant: '', note: 'Leg press felt strong, last two sets were a grind.',
        sets: {
          0: logged({ exerciseId: 'leg-press', weight: 60, reps: 8, effort: 8 }),
          1: logged({ exerciseId: 'leg-press', weight: 62.5, reps: 7, effort: 9 }),
        },
      },
      rdl: {
        exerciseId: 'rdl', variant: 'Barbell', note: '',
        sets: { 0: logged({ exerciseId: 'rdl', variant: 'Barbell', weight: 40, reps: 10, effort: 8 }) },
      },
    },
  };
  const previous: Session = {
    date: '2026-11-16', planId: 'lower-1', startedAt: '2026-11-16T18:00:00.000Z', finishedAt: '2026-11-16T19:00:00.000Z', plan: lower,
    slots: {
      'leg-press': {
        exerciseId: 'leg-press', variant: '', note: '',
        sets: { 0: logged({ exerciseId: 'leg-press', weight: 60, reps: 8, effort: 8 }) },
      },
      rdl: {
        exerciseId: 'rdl', variant: 'Barbell', note: '',
        sets: { 0: logged({ exerciseId: 'rdl', variant: 'Barbell', weight: 40, reps: 8, effort: 8 }) },
      },
    },
  };
  const cardio: Session = {
    date: '2026-11-25', planId: 'cardio', startedAt: '2026-11-25T08:00:00.000Z', finishedAt: '2026-11-25T09:00:00.000Z',
    plan: { id: 'cardio', day: 6, name: 'Cardio', exercises: [] }, slots: {},
  };
  const current: Session = {
    date: '2026-11-26', planId: 'lower-2', startedAt: '2026-11-26T18:00:00.000Z',
    plan: { id: 'lower-2', day: 4, name: 'Lower body', exercises: [{ id: 'squat', name: 'Back squat', target: '8 reps', sets: 4, rest: 120, cue: '' }] },
    slots: {
      squat: {
        exerciseId: 'squat', variant: 'Barbell', note: '',
        warmup: logged({ exerciseId: 'squat', variant: 'Barbell', weight: 20, reps: 8 }),
        sets: { 0: logged({ exerciseId: 'squat', variant: 'Barbell', weight: 42.5, reps: 8, effort: 8 }) },
      },
    },
  };
  const habit = (steps: number, waterHitTarget: boolean, sleep: number, extra: Partial<TrainingData['habits'][string]> = {}) => ({
    ...emptyHabits, steps, waterHitTarget, sleep, ...extra,
  });
  const data: TrainingData = {
    sessions: {
      '2026-11-16:lower-1': previous,
      '2026-11-23:lower-1': monday,
      '2026-11-25:cardio': cardio,
      '2026-11-26:lower-2': current,
    },
    habits: {
      '2026-11-23': habit(9120, true, 7.5, { sleepNote: 'Slept straight through.', fuellingNote: null }),
      '2026-11-24': habit(8050, false, 6, { sleepQuality: 'Broken', sleepNote: 'Woke at 3am.', water: 1 }),
      '2026-11-25': habit(11400, true, 7, { fuellingNote: 'Oats and eggs before training.' }),
      '2026-11-22': habit(1000, true, 9),
    },
    checkIns: {
      mid: {
        id: '6f1c3e8a-1c2b-4d5e-8f90-123456789abc', kind: 'midweek', start: '2026-11-23', end: '2026-11-25',
        text: 'Wins: Leg press up to 62.5 kg.\nWhat\'s been hard: Sleep was broken on Tuesday night.\nQuestion for you: Can I add weight on squats next week?',
      },
    },
    dayNotes: { '2026-11-23': 'Easy session.' },
  };
  const report = buildWeekReport(data, programme, today);
  assert.equal(report.stats[0].value, '2');
  assert.equal(report.stats[0].unit, ' of 7');
  assert.equal(report.stats[0].note, '+ Workout 4 in progress');
  assert.equal(report.stats[1].value, '9,523');
  assert.equal(report.stats[1].note, 'Goal 8,000–10,000');
  assert.equal(report.stats[2].value, '2');
  assert.equal(report.stats[2].unit, ' of 3 days');
  assert.equal(report.stats[3].value, '6.8');
  assert.match(report.stats[3].note, /1 broken night/);
  assert.equal(report.stats[4].value, '5');
  assert.equal(report.stats[4].note, 'Workout, sleep and fuelling');

  const mondayReport = report.days[0];
  assert.equal(mondayReport.title, 'Workout 1 · Lower body');
  assert.equal(mondayReport.subtitle, 'Done · 2 exercises · 3 sets');
  assert.equal(mondayReport.chips[0].tone, 'good');
  assert.equal(mondayReport.chips[1].label, 'Water ✓');
  assert.equal(mondayReport.exercises[0].sets, '60 × 8 (2) · 62.5 × 7 (1)');
  assert.match(mondayReport.notes[0].text, /Easy session/);
  assert.match(mondayReport.notes[0].text, /Leg press felt strong/);
  assert.equal(report.days[1].chips[1].label, 'Water ✗');
  assert.equal(report.days[1].chips[1].tone, 'plain');
  assert.equal(report.days[2].title, 'Workout 6 · Cardio');
  assert.equal(report.days[2].subtitle, 'Done · swapped forward from Saturday');
  assert.equal(report.days[3].state, 'today');
  assert.equal(report.days[3].subtitle, 'Today · in progress · 2 of 4 sets');
  assert.equal(report.days[3].exercises[0].sets, '20 × 8 (warm-up) · 42.5 × 8 (2)');
  assert.equal(report.days[4].subtitle, 'Left this week: Workouts 2, 3, 5 and 7');

  assert.equal(report.lifts.find((lift) => lift.name === 'Leg Press')?.now, '62.5 × 7');
  assert.equal(report.lifts.find((lift) => lift.name === 'Leg Press')?.delta, '+2.5 kg');
  assert.equal(report.lifts.find((lift) => lift.name === 'RDL')?.delta, 'same');
  assert.equal(report.lifts.find((lift) => lift.name === 'Back squat')?.delta, '—');
  assert.equal(report.checkIns[0].wins, 'Leg press up to 62.5 kg.');
  assert.equal(report.checkIns[0].question, 'Can I add weight on squats next week?');
  assert.equal(presentCheckIn('Monday, 23 Nov · Lower body\nLeg Press, set 1: 60 kg').logOnly, true);
  assert.match(formatWeekReport(report), /Leg Press: 60 × 8 \(2\)/);
  assert.doesNotMatch(formatWeekReport(report), /1,000 steps/);
});
