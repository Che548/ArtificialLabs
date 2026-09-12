import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterInput } from './input-format';

test('integer fields filter typing, paste and full-width digits', () => {
  assert.equal(filterInput('цикл 28 дней', 'integer'), '28');
  assert.equal(filterInput('２０', 'integer'), '20');
  assert.equal(filterInput('letters', 'integer'), '');
  assert.equal(filterInput('', 'integer'), '');
});
test('measurements preserve one decimal separator and incomplete drafts', () => {
  assert.equal(filterInput('36,6 °C', 'decimal'), '36,6');
  assert.equal(filterInput('72.5 кг', 'decimal'), '72.5');
  assert.equal(filterInput('36,6.7', 'decimal'), '36,67');
  assert.equal(filterInput('0,', 'decimal'), '0,');
});
test('names support Unicode, compound names and apostrophes, not digits', () => {
  assert.equal(filterInput('Анна-Мария 123', 'name'), 'Анна-Мария ');
  assert.equal(filterInput("O’Connor José 李", 'name'), "O’Connor José 李");
  assert.equal(filterInput('Иван🙂42', 'name'), 'Иван');
});
test('phone permits only a leading plus and digits', () => {
  assert.equal(filterInput('+7 (999) 123-45-67 abc', 'phone'), '+79991234567');
  assert.equal(filterInput('7+99++9', 'phone'), '7999');
});
test('mixed input is preserved for email, password, medicines, codes and notes', () => {
  for (const input of ['anna42@example.com', 'P@ss123!', 'Витамин B12', 'Диабет 2 типа', 'RB-2026-01', 'Давление 120/80']) {
    assert.equal(filterInput(input, 'text'), input);
  }
});
