import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 9334;
const dir = await mkdtemp(join(tmpdir(), 'rise-clock-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;

try {
  let page;
  for (let attempt = 0; attempt < 30 && !page; attempt += 1) {
    await sleep(200);
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json()).catch(() => []);
    page = targets.find((target) => target.type === 'page');
  }
  if (!page) throw new Error('Chrome did not open a page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) pending.get(message.id)(message);
  });
  const send = (method, params = {}) => {
    const messageId = ++id;
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(messageId, (message) => {
        pending.delete(messageId);
        if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
        else resolve(message.result);
      });
    });
  };
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Script failed');
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    const started = Date.now();
    while (Date.now() - started < 10_000) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${label}\n${await evaluate('document.body.innerText.slice(0, 700)')}`);
  };
  const click = async (text) => {
    const clicked = await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].filter((item) => item.innerText.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(text)} && !item.disabled).at(-1);
      if (!button) return false;
      button.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Could not click ${text}`);
  };
  const timer = () => evaluate(`document.querySelector('[role="timer"]')?.innerText?.replace(/\\s+/g, ' ')?.trim() ?? ''`);

  const logs = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') logs.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled') logs.push(message.params.args.map((item) => item.value ?? item.description).join(' '));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:3001/' });
  await waitFor(`document.body?.innerText?.includes('Resume workout')`, 'today');
  await sleep(500);
  console.log('console', logs.slice(0, 12));
  await click('Resume workout');
  await waitFor(`document.body.innerText.includes('Stop clock') || document.body.innerText.includes('Resume clock')`, 'open workout');
  const notes = ['opened the in-progress workout'];
  const controls = await evaluate(`['Stop clock', 'Resume clock', 'Reset clock', 'Reset workout'].filter((label) => document.body.innerText.includes(label))`);
  notes.push(`controls: ${controls.join(', ')}`);
  if (!controls.includes('Reset clock') || !controls.includes('Reset workout')) throw new Error(`Missing reset controls: ${controls.join(', ')}`);

  const switched = await evaluate(`(() => {
    const select = document.querySelector('select');
    if (!select) return '';
    const option = [...select.options].find((item) => item.value && item.value !== select.value && !item.disabled);
    if (!option) return '';
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    set.call(select, option.value);
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return option.textContent;
  })()`);
  if (!switched) throw new Error('Could not choose another workout');
  await waitFor(`document.body.innerText.includes('Start workout')`, 'unstarted workout');
  notes.push(`switched to ${switched}`);

  await click('Start workout');
  await waitFor(`document.body.innerText.includes('Stop clock')`, 'running clock');
  const first = await timer();
  await sleep(1300);
  const second = await timer();
  if (first === second) throw new Error(`Clock did not advance: ${first}`);
  notes.push(`running ${first} -> ${second}`);

  await click('Stop clock');
  await waitFor(`document.body.innerText.includes('Paused') && document.body.innerText.includes('Resume clock')`, 'paused clock');
  const paused = await timer();
  await sleep(1300);
  if (await timer() !== paused) throw new Error(`Paused clock moved from ${paused}`);
  notes.push(`paused at ${paused}`);

  await click('Reset clock');
  await waitFor(`document.body.innerText.includes('stays paused')`, 'reset confirmation');
  await click('Reset clock');
  await waitFor(`document.querySelector('[role="timer"]')?.innerText?.includes('0:00') && document.body.innerText.includes('Paused')`, 'zero clock');
  notes.push(`reset clock ${await timer()}`);

  await click('Resume clock');
  await waitFor(`document.body.innerText.includes('Stop clock') && !document.body.innerText.includes('Paused')`, 'resumed clock');
  await click('Reset workout');
  await waitFor(`document.body.innerText.includes('goes back to not started')`, 'reset workout confirmation');
  await click('Reset workout');
  await waitFor(`document.body.innerText.includes('Start workout') && !document.querySelector('[role="timer"]')`, 'workout cleared');
  notes.push('reset workout returned to Start workout');
  console.log(JSON.stringify({ ok: true, notes }, null, 2));
} finally {
  ws?.close();
  chrome.kill();
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
