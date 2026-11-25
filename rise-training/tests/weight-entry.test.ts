import assert from 'node:assert/strict';
import test from 'node:test';
import { overrideWeight } from '../components/log-set.tsx';

test('the first digit replaces a prefilled weight wherever it is typed', () => {
  assert.equal(overrideWeight('60', '605'), '5');
  assert.equal(overrideWeight('60', '560'), '5');
  assert.equal(overrideWeight('60', '650'), '5');
  assert.equal(overrideWeight('42.5', '42.55'), '5');
  assert.equal(overrideWeight('42.5', '42.5.'), '.');
});

test('a weight that already replaced the selection is kept', () => {
  assert.equal(overrideWeight('60', '75'), '75');
  assert.equal(overrideWeight('60', '7'), '7');
  assert.equal(overrideWeight('20', '22.5'), '22.5');
});

test('backspace and an empty field keep what the field now shows', () => {
  assert.equal(overrideWeight('60', '6'), '6');
  assert.equal(overrideWeight('60', ''), '');
  assert.equal(overrideWeight('', '8'), '8');
});
