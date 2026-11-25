import { habits } from './plan.js';
import { dateKey, makeReport, restTime } from './report.js';
import { prepareGoogleDocs } from './google-doc.js';

const storageKey = 'rise-gym-log-v1';
const startDate = dateKey(new Date());
const dateInput = document.querySelector('#log-date');
const main = document.querySelector('#main');
const timer = document.querySelector('#timer');
const notice = document.querySelector('#notice');

let records = {};
let activeDate = startDate;
let noticeTimeout;
let restInterval;
let saving = false;
let connecting = false;
let googleDocs;
let planData;
let connectionMessage = 'Checking Google Docs setup…';
const reportDrafts = new Map();

try {
  records = JSON.parse(localStorage.getItem(storageKey)) ?? {};
  planData = JSON.parse(localStorage.getItem('rise-gym-plan-v1'));
} catch {
  showNotice('The saved log could not be loaded.');
}

function showNotice(message) {
  notice.textContent = message;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { notice.textContent = ''; }, 6200);
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    showNotice('This browser could not save your log. Keep this tab open and copy your check-in.');
  }
}

function currentEntry() {
  return records[activeDate] ??= { selectedDay: 0, workouts: {}, habits: {} };
}

function currentWorkout() {
  const entry = currentEntry();
  const index = entry.selectedDay;
  return entry.workouts[index] ??= { day: planData.days[index], exercises: {} };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function setField(label, field, value, step, a11yLabel) {
  return `<label class="field"><span>${label}</span><input aria-label="${escapeHtml(a11yLabel)}" type="number" min="0" step="${step}" inputmode="${step === '1' ? 'numeric' : 'decimal'}" data-set-field="${field}" value="${escapeHtml(value)}"></label>`;
}

function exerciseCard(exercise, index, sets = {}) {
  const rows = Array.from({ length: exercise.sets }, (_, setIndex) => {
    const set = sets[setIndex] ?? {};
    const description = `${exercise.name}, set ${setIndex + 1}`;
    const repsLabel = exercise.perSide ? `Reps / ${exercise.perSide}` : 'Reps';
    const fields = exercise.metric === 'seconds'
      ? setField('Seconds', 'seconds', set.seconds, '1', `${description}, seconds`)
      : [exercise.metric !== 'bodyweight' ? setField('kg', 'weight', set.weight, 'any', `${description}, weight in kilograms`) : '',
          setField(repsLabel, 'reps', set.reps, '1', `${description}, ${repsLabel}`)].join('');
    return `<div class="set-row" data-set="${setIndex}">
      <span class="set-number">Set ${setIndex + 1}</span>${fields}
      <button class="set-toggle" type="button" aria-label="${escapeHtml(`Mark ${description} done`)}" aria-pressed="${Boolean(set.done)}" data-toggle-set>✓</button>
    </div>`;
  }).join('');
  return `<section class="card" data-exercise="${index}">
    <div class="exercise-head"><div><h2>${escapeHtml(exercise.name)}</h2><p class="meta">${exercise.sets} sets · ${escapeHtml(exercise.target)}${exercise.metric === 'bodyweight' ? ' · Bodyweight' : ''}</p></div>
      ${exercise.rest ? `<button class="button secondary" type="button" data-rest="${exercise.rest}" aria-label="${escapeHtml(`Start rest for ${exercise.name}`)}">Rest ${restTime(exercise.rest)}</button>` : ''}
    </div>
    ${exercise.cue || exercise.restNote ? `<details><summary>Coach’s cues${exercise.restNote ? ' and rest' : ''}</summary><p>${escapeHtml(exercise.cue)}${exercise.restNote ? ` Rest ${escapeHtml(exercise.restNote)}.` : ''}</p></details>` : ''}
    ${rows}
  </section>`;
}

function updateProgress() {
  const progress = main.querySelector('progress');
  if (!progress) return;
  const exercises = currentWorkout().exercises;
  const count = Object.values(exercises).flatMap(Object.values).filter((set) => set.done).length;
  progress.value = count;
  main.querySelector('#set-count').textContent = `${count} / ${progress.max}`;
}

function workoutView() {
  if (!planData) {
    return `<h1>Workout plan</h1><section class="card panel"><p>Connect your shared Google Doc to load your coach’s plan.</p>${connectionControls()}</section>`;
  }
  const index = currentEntry().selectedDay;
  const workout = currentWorkout();
  const day = workout.day;
  const total = day.exercises?.reduce((sum, exercise) => sum + exercise.sets, 0);
  const planDays = planData.days.map((item, dayIndex) => `<button type="button" data-day="${dayIndex}" aria-label="Day ${item.number}, ${escapeHtml(item.name)}" aria-pressed="${dayIndex === index}">${item.number}<small>${escapeHtml(item.name.split(' ')[0])}</small></button>`).join('');
  const exerciseList = day.exercises?.map((exercise, i) => exerciseCard(exercise, i, workout.exercises[i])).join('');
  return `<p class="eyebrow">Day ${day.number} of ${planData.days.length}</p><h1>${escapeHtml(day.name)}</h1>
    <div class="day-picker" role="group" aria-label="Plan day">${planDays}</div>
    ${exerciseList ? `<div class="progress-block"><div class="progress-label"><span>Sets completed</span><strong id="set-count"></strong></div><progress aria-label="Sets completed" max="${total}" value="0"></progress></div>${exerciseList}` :
      `<section class="card"><p>${escapeHtml(day.activity)}</p><div class="actions"><button class="button ${workout.activityDone ? 'primary' : 'secondary'}" type="button" data-activity aria-pressed="${Boolean(workout.activityDone)}">${workout.activityDone ? '✓ Completed' : 'Mark complete'}</button></div></section>`}
    <label class="field notes"><span>Workout notes</span><textarea rows="3" maxlength="2000" data-workout-note>${escapeHtml(workout.note)}</textarea></label>${connectionControls()}`;
}

function connectionControls() {
  return `<div class="actions"><button type="button" class="button ${planData ? 'secondary' : 'primary'}" data-connect ${googleDocs && !connecting ? '' : 'disabled'}>${planData ? 'Refresh plan from Google' : 'Connect Google Doc'}</button>
    ${googleDocs ? `<a href="${googleDocs.documentUrl}" target="_blank" rel="noopener noreferrer">Open shared Doc</a>` : ''}</div>
    <p class="meta" id="connection-status" aria-live="polite">${escapeHtml(connectionMessage)}</p>`;
}

function habitsView() {
  const dailyHabits = currentEntry().habits;
  const fields = habits.map(({ key, label, unit, step }) => {
    const goal = planData?.goals[key];
    return `<label class="habit"><div><strong>${label}</strong>${goal ? `<span class="meta">Goal ${escapeHtml(goal)}</span>` : ''}</div><input aria-label="${label} (${unit})" type="number" min="0" step="${step}" inputmode="${step === '1' ? 'numeric' : 'decimal'}" data-habit="${key}" value="${escapeHtml(dailyHabits[key])}"></label>`;
  }).join('');
  return `<h1>Daily habits</h1><section class="card panel habits">${fields}</section>
    <label class="field notes"><span>Habit notes</span><textarea rows="3" maxlength="2000" placeholder="Sleep quality, energy, or anything for your coach" data-habit="note">${escapeHtml(dailyHabits.note)}</textarea></label>`;
}

function checkInView() {
  const report = makeReport(records, activeDate);
  report.text = reportDrafts.get(activeDate) ?? report.text;
  return `<h1>Coach check-in</h1><section class="card panel"><h2>${report.title}</h2>
    <p class="meta">Seven days ending on the log date. Review or edit your check-in before saving.</p>
    <label class="field notes"><span>Check-in for your coach</span><textarea class="report" id="report" maxlength="24000" placeholder="Your completed sets, activities, and habits will appear here.">${escapeHtml(report.text)}</textarea></label>
    <div class="actions">
      <button class="button primary" type="button" data-doc-save>Save to Google Doc</button>
      <button class="button secondary" type="button" data-copy>Copy check-in</button>
      ${googleDocs ? `<a href="${googleDocs.documentUrl}" target="_blank" rel="noopener noreferrer">Open shared Doc</a>` : ''}
    </div>
    <p class="meta" id="doc-status" aria-live="polite">${googleDocs && planData ? 'Saving appends a dated entry to your shared Google Doc.' : 'Connect your shared Doc from Workout to enable direct saving.'}</p>
    </section>`;
}

function render() {
  const views = { '#workout': workoutView, '#habits': habitsView, '#check-in': checkInView };
  const hash = Object.hasOwn(views, location.hash) ? location.hash : '#workout';
  document.querySelectorAll('.tabs a').forEach((link) => {
    if (link.getAttribute('href') === hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  main.innerHTML = views[hash]();
  updateProgress();
  updateReportButtons();
}

function setAt(element) {
  const exercise = element.closest('[data-exercise]').dataset.exercise;
  const set = element.closest('[data-set]').dataset.set;
  const sets = currentWorkout().exercises[exercise] ??= {};
  return sets[set] ??= {};
}

function updateReportButtons() {
  const report = main.querySelector('#report');
  if (!report) return;
  const hasText = Boolean(report.value.trim());
  main.querySelector('[data-copy]').disabled = !hasText;
  const write = main.querySelector('[data-doc-save]');
  if (write) write.disabled = saving || !hasText || !googleDocs || !planData;
}

function stopRest() {
  clearInterval(restInterval);
  timer.hidden = true;
}

function startRest(seconds, label) {
  stopRest();
  const end = Date.now() + seconds * 1000;
  const time = timer.querySelector('#timer-time');
  timer.querySelector('#timer-label').textContent = label;
  timer.hidden = false;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    time.textContent = restTime(remaining);
    if (remaining === 0) {
      stopRest();
      showNotice('Rest complete.');
    }
  };
  restInterval = setInterval(tick, 250);
  tick();
}

async function connectGoogle() {
  if (!googleDocs || connecting) return;
  connecting = true;
  main.querySelector('[data-connect]').disabled = true;
  main.querySelector('#connection-status').textContent = 'Connecting to Google…';
  try {
    planData = await googleDocs.connect();
    for (const record of Object.values(records)) {
      for (const [index, workout] of Object.entries(record.workouts)) {
        if (!workout.note && !workout.activityDone && !Object.keys(workout.exercises).length) delete record.workouts[index];
      }
    }
    localStorage.setItem('rise-gym-plan-v1', JSON.stringify(planData));
    save();
    connectionMessage = 'Plan loaded from your shared Google Doc.';
  } catch (error) {
    connectionMessage = error.message;
  } finally {
    connecting = false;
    render();
    showNotice(connectionMessage);
  }
}

async function copyReport() {
  const report = main.querySelector('#report');
  const { title } = makeReport(records, activeDate);
  try {
    await navigator.clipboard.writeText(`${title}\n\n${report.value.trim()}`);
    showNotice('Check-in copied.');
  } catch {
    report.focus();
    report.select();
    showNotice('Check-in selected. Use your device’s Copy command.');
  }
}

async function writeReport() {
  const text = main.querySelector('#report').value.trim();
  if (saving || !googleDocs || !planData || !text) return;
  const { title } = makeReport(records, activeDate);
  saving = true;
  updateReportButtons();
  const status = main.querySelector('#doc-status');
  status.textContent = 'Saving to your shared Doc…';
  try {
    const { duplicate } = await googleDocs.appendCheckIn(title, text);
    status.textContent = duplicate ? 'This check-in is already in your shared Doc.' : 'Check-in saved to your shared Doc.';
  } catch (error) {
    status.textContent = error.message || 'Google didn’t confirm the save. Check the Doc before trying again.';
  } finally {
    saving = false;
    showNotice(status.textContent);
    updateReportButtons();
  }
}

dateInput.value = startDate;
dateInput.addEventListener('change', () => {
  if (!dateInput.value) { dateInput.value = activeDate; return; }
  activeDate = dateInput.value;
  render();
});
window.addEventListener('hashchange', render);
timer.querySelector('#timer-stop').addEventListener('click', stopRest);

main.addEventListener('input', ({ target }) => {
  if (target.id === 'report') {
    reportDrafts.set(activeDate, target.value);
    updateReportButtons();
    return;
  }
  if (target.type === 'number' && !target.validity.valid) return;
  if (target.dataset.setField) setAt(target)[target.dataset.setField] = target.value;
  else if (target.dataset.habit) currentEntry().habits[target.dataset.habit] = target.value;
  else if (Object.hasOwn(target.dataset, 'workoutNote')) currentWorkout().note = target.value;
  else return;
  save();
});

main.addEventListener('click', ({ target }) => {
  const button = target.closest('button');
  if (!button) return;
  if (button.dataset.day !== undefined) {
    currentEntry().selectedDay = Number(button.dataset.day);
    save();
    render();
    main.querySelector(`[data-day="${button.dataset.day}"]`).focus();
  } else if (Object.hasOwn(button.dataset, 'toggleSet')) {
    const invalid = button.closest('[data-set]').querySelector('input:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    const set = setAt(button);
    set.done = !set.done;
    button.setAttribute('aria-pressed', set.done);
    save();
    updateProgress();
  } else if (Object.hasOwn(button.dataset, 'activity')) {
    const workout = currentWorkout();
    workout.activityDone = !workout.activityDone;
    save();
    render();
    main.querySelector('[data-activity]').focus();
  } else if (button.dataset.rest) {
    startRest(Number(button.dataset.rest), button.closest('section').querySelector('h2').textContent);
  } else if (Object.hasOwn(button.dataset, 'copy')) {
    copyReport();
  } else if (Object.hasOwn(button.dataset, 'connect')) {
    connectGoogle();
  } else if (Object.hasOwn(button.dataset, 'docSave')) {
    writeReport();
  }
});

render();

fetch('/api/google-config', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error('Google Docs setup is pending.');
    return response.json();
  })
  .then(prepareGoogleDocs)
  .then((connection) => {
    googleDocs = connection;
    connectionMessage = planData ? 'Saved plan ready.' : 'Sign in with the Google account you use for the shared Doc.';
  })
  .catch((error) => { connectionMessage = error.message; })
  .finally(render);
