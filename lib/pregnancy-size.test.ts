import assert from 'node:assert/strict';
import test from 'node:test';
import { PREGNANCY_LENGTH_MM, pregnancySizeForWeek } from './pregnancy-size';
test('all requested weeks have a label, without fictional early measurements', () => {
  for (let week = 1; week <= 40; week++) assert.ok(pregnancySizeForWeek(week));
  assert.equal(PREGNANCY_LENGTH_MM.length, 41);
  for (const week of [1, 2, 3]) assert.equal(PREGNANCY_LENGTH_MM[week], null);
  for (const week of [0, -1, 43, NaN, 15.5]) assert.equal(pregnancySizeForWeek(week), null);
});
test('millimetres, centimetres, decimal comma and measurement change stay explicit', () => {
  assert.equal(pregnancySizeForWeek(5)?.label, '≈ 2 мм');
  assert.equal(pregnancySizeForWeek(8)?.label, '≈ 1,6 см');
  assert.equal(pregnancySizeForWeek(19)?.method, 'от головы до копчика');
  assert.equal(pregnancySizeForWeek(20)?.label, '≈ 25,6 см');
  assert.equal(pregnancySizeForWeek(20)?.method, 'от головы до пяток');
  assert.equal(pregnancySizeForWeek(40)?.label, '≈ 51,2 см');
  for (const week of [41,42]) assert.equal(pregnancySizeForWeek(week)?.label, 'Размер индивидуален');
});
