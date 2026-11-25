import { existsSync } from 'node:fs';
import playwright from 'file:///C:/Users/JessiePeters/AppData/Local/Temp/rise-shots/node_modules/playwright-core/index.js';

const { chromium } = playwright;
const edge = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((path) => existsSync(path));
if (!edge) throw new Error('Edge is not installed.');

const browser = await chromium.launch({ executablePath: edge, headless: true });
const failures = [];
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${detail}`);
  console.log(`${ok ? 'ok' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function measure(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.page-gradient');
    const split = document.querySelector('.programme-split');
    const stage = document.querySelector('.programme-stage');
    const days = document.querySelector('.programme-day-toggle');
    const body = document.querySelector('.programme-day-body');
    const box = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { w: Math.round(rect.width), x: Math.round(rect.x), y: Math.round(rect.y), h: Math.round(rect.height), display: style.display };
    };
    return { shell: box(shell), split: box(split), stage: box(stage), days: box(days), body: box(body), wide: shell?.classList.contains('page-wide') ?? false };
  });
}

async function openFirstDay(page) {
  const day = page.locator('.programme-day-toggle').first();
  await day.waitFor();
  await day.click();
  await page.locator('.programme-day-body').waitFor();
}

const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await desktop.goto('http://localhost:3000/#programme', { waitUntil: 'networkidle' });
await desktop.getByRole('heading', { name: /Programme/ }).waitFor();
await openFirstDay(desktop);
let layout = await measure(desktop);
check('desktop shell width', layout.shell.w === 1120, JSON.stringify(layout.shell));
check('desktop day list left of editor', layout.days && layout.body && layout.body.x > layout.days.x + 200, JSON.stringify({ days: layout.days, body: layout.body }));
check('desktop editor beside list', layout.body && layout.days && Math.abs(layout.body.y - layout.days.y) < 40, JSON.stringify({ days: layout.days, body: layout.body }));
await desktop.locator('.programme-exercise-toggle').first().click();
const exercise = await desktop.getByRole('textbox', { name: 'Exercise' }).boundingBox();
check('desktop exercise field fits the editor', exercise && exercise.x >= 416 && exercise.x + exercise.width <= 1200, JSON.stringify(exercise));
await desktop.getByRole('radio', { name: 'History' }).click();
await desktop.getByText(/No saved versions|Edit a copy|Applies from/).first().waitFor();
await desktop.getByRole('radio', { name: /Notes/ }).click();
await desktop.getByRole('textbox', { name: 'Note' }).waitFor();
const noteBox = await desktop.getByRole('textbox', { name: 'Note' }).boundingBox();
const thread = await desktop.locator('.coach-thread, .programme-messages .fine').first().boundingBox();
check('desktop note composer sits to the right', noteBox && thread && noteBox.x > thread.x + 200, JSON.stringify({ noteBox, thread }));
const notes = await measure(desktop);
check('desktop notes stay wide', notes.shell.w === 1120, JSON.stringify(notes.shell));
await desktop.getByRole('link', { name: 'Today' }).click();
await desktop.locator('.page-today, .screen').first().waitFor();
const today = await measure(desktop);
check('today stays phone width', today.shell && today.shell.w === 520 && !today.wide, JSON.stringify(today.shell));

const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto('http://localhost:3000/#programme', { waitUntil: 'networkidle' });
await phone.getByRole('heading', { name: /Programme/ }).waitFor();
await openFirstDay(phone);
layout = await measure(phone);
check('phone shell fits', layout.shell.w <= 390, JSON.stringify(layout.shell));
check('phone editor under the day', layout.body && layout.days && layout.body.y > layout.days.y, JSON.stringify({ days: layout.days, body: layout.body }));
check('phone editor not beside the list', layout.body && layout.days && layout.body.x < layout.days.x + 40, JSON.stringify({ days: layout.days, body: layout.body }));
await phone.locator('.programme-day-toggle').nth(1).click();
const third = await phone.evaluate(() => {
  const buttons = [...document.querySelectorAll('.programme-day-toggle')];
  const body = document.querySelector('.programme-day-body').getBoundingClientRect();
  const chosen = buttons[1].getBoundingClientRect();
  const next = buttons[2]?.getBoundingClientRect();
  return {
    under: body.y >= chosen.y + chosen.height - 2,
    beforeNext: !next || body.y + body.height <= next.y + 2,
  };
});
check('phone editor follows the open day', third.under && third.beforeNext, JSON.stringify(third));
await phone.locator('.programme-exercise-toggle').first().click();
const phoneExercise = await phone.getByRole('textbox', { name: 'Exercise' }).boundingBox();
check('phone exercise field fits', phoneExercise && phoneExercise.width > 200 && phoneExercise.x >= 0 && phoneExercise.x + phoneExercise.width <= 390, JSON.stringify(phoneExercise));
await phone.getByRole('radio', { name: /Notes/ }).click();
const phoneNote = await phone.getByRole('textbox', { name: 'Note' }).boundingBox();
check('phone note field stacks full width', phoneNote && phoneNote.width > 280 && phoneNote.x < 40, JSON.stringify(phoneNote));

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
