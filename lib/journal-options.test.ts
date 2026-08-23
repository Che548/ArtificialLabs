import assert from 'node:assert/strict';
import test from 'node:test';

import { toggleJournalOption } from './journal-options';

test('selects and deselects regular journal options', () => {
  assert.deepEqual(toggleJournalOption([], 'Головная боль'), ['Головная боль']);
  assert.deepEqual(toggleJournalOption(['Головная боль'], 'Головная боль'), []);
});

test('selecting a negative option clears positive symptom answers', () => {
  assert.deepEqual(
    toggleJournalOption(
      ['Внизу живота', 'Головная боль'],
      'Боли нет',
      'Боли нет',
    ),
    ['Боли нет'],
  );
});

test('selecting a positive symptom clears the negative option', () => {
  assert.deepEqual(toggleJournalOption(['Боли нет'], 'В спине', 'Боли нет'), [
    'В спине',
  ]);
});

test('day factors support an exclusive neutral answer', () => {
  assert.deepEqual(
    toggleJournalOption(
      ['Стресс', 'Путешествие'],
      'Особых факторов не было',
      'Особых факторов не было',
    ),
    ['Особых факторов не было'],
  );
  assert.deepEqual(
    toggleJournalOption(
      ['Особых факторов не было'],
      'Болезнь или травма',
      'Особых факторов не было',
    ),
    ['Болезнь или травма'],
  );
});
