import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';

const source = new URL('../design-handover/programme.json', import.meta.url);
const output = new URL('../lib/programme-data.generated.json', import.meta.url);
const { days, habits } = JSON.parse(await readFile(source, 'utf8'));

// Only send the prescription and habit targets in the browser bundle.
const { trackDaily, steps, hydrationLitres, sleepHours, nutrition } = habits;
const data = { days, habits: { trackDaily, steps, hydrationLitres, sleepHours, nutrition: { habits: nutrition.habits } } };
const content = `${JSON.stringify(data, null, 2)}\n`;
const previous = await readFile(output, 'utf8').catch((error) => {
  if (error.code !== 'ENOENT') throw error;
  return undefined;
});

if (previous !== content) {
  const temporary = new URL(`../lib/.programme-data-${randomUUID()}.json`, import.meta.url);
  try {
    await writeFile(temporary, content);
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}
