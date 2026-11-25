import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const dir = await mkdtemp(join(tmpdir(), 'rise-rest-'));
const port = 9334;
const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${dir}`,
  '--window-size=1200,900',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let version;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) { version = await response.json(); break; }
    } catch { /* Chrome is still starting. */ }
    await sleep(200);
  }
  if (!version) throw new Error('Chrome did not start');

  const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await created.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:3001/#train' });
  await sleep(2500);

  const evalJs = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };

  const labels = await evalJs(`(() => [...document.querySelectorAll('button, a')].map((node) => node.innerText.trim()).filter(Boolean).slice(0, 40))()`);
  console.log('LABELS', JSON.stringify(labels));

  const opened = await evalJs(`(() => {
    const click = (match) => {
      const node = [...document.querySelectorAll('button, a')].find((item) => match(item.innerText.trim()) && !item.disabled);
      if (!node) return false;
      node.click();
      return node.innerText.trim();
    };
    return click((text) => text.startsWith('Continue with ')) || click((text) => text === 'Start workout') || 'none';
  })()`);
  console.log('OPENED', opened);
  if (opened === 'Start workout') {
    console.log('Started a workout to reach the timer. It can be discarded from Workout options.');
    await sleep(1200);
  } else await sleep(800);

  const rested = await evalJs(`(() => {
    const node = [...document.querySelectorAll('button')].find((item) => /rest$/i.test(item.innerText.trim()) && !item.disabled);
    if (!node) return 'no rest button: ' + [...document.querySelectorAll('button')].map((item) => item.innerText.trim()).filter(Boolean).slice(0, 20).join(' | ');
    node.click();
    return node.innerText.trim();
  })()`);
  console.log('REST', rested);
  await sleep(700);

  const metrics = await evalJs(`(() => {
    const dialog = document.querySelector('dialog.rest-screen');
    if (!dialog) return { missing: true, text: document.body.innerText.slice(0, 400) };
    const box = dialog.getBoundingClientRect();
    const style = getComputedStyle(dialog);
    return {
      heading: dialog.querySelector('h2')?.textContent,
      title: dialog.querySelector('.rest-toolbar > span')?.textContent,
      breathe: dialog.innerText.includes('Breathe'),
      upNext: dialog.querySelector('.rest-next')?.innerText,
      vw: innerWidth,
      vh: innerHeight,
      top: Math.round(box.top),
      height: Math.round(box.height),
      left: Math.round(box.left),
      width: Math.round(box.width),
      radius: style.borderRadius,
      bottomGap: Math.round(innerHeight - box.bottom),
    };
  })()`);
  console.log('METRICS', JSON.stringify(metrics));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(tmpdir(), 'rise-rest-timer.png');
  await writeFile(file, Buffer.from(shot.data, 'base64'));
  console.log('SHOT', file);
  ws.close();
} finally {
  proc.kill();
  await sleep(300);
  await rm(dir, { recursive: true, force: true });
}
