import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expenseCategories,
  validateClassification,
  applyCategorySuggestion,
} from '../src/classification';

test('classification accepts only the fixed category set, including a genuine Other decision', () => {
  for (const category of expenseCategories)
    assert.deepEqual(validateClassification({ status: 'classified', category }), {
      status: 'classified',
      category,
    });
});
test('unknown or malformed AI categories require input instead of a rules/default classifier', () => {
  for (const value of [
    null,
    {},
    { status: 'classified', category: 'Investments' },
    { status: 'classified' },
    { category: 'Food & drinks' },
  ])
    assert.equal(validateClassification(value).status, 'needs-input');
  assert.deepEqual(validateClassification({ status: 'unavailable', reason: 'Model disabled' }), {
    status: 'unavailable',
    reason: 'Model disabled',
  });
});
test('classification results never carry model-supplied amounts, dates or currency changes', () => {
  assert.deepEqual(
    validateClassification({
      status: 'classified',
      category: 'Entertainment',
      amount: 9999,
      currency: 'XYZ',
      date: '2099-01-01',
    }),
    { status: 'classified', category: 'Entertainment' },
  );
});

test('late category suggestions preserve manual choices, newer descriptions and non-expense entries', () => {
  const draft = {
    type: 'entry',
    kind: 'expense',
    title: 'Taxi',
    category: 'Other',
    categoryEdited: false,
    amount: '12.50',
    currency: 'SGD',
  };
  assert.deepEqual(applyCategorySuggestion(draft, 'Taxi', 'Transport'), {
    ...draft,
    category: 'Transport',
  });
  assert.equal(applyCategorySuggestion(draft, 'Cinema', 'Entertainment'), draft);
  const manual = { ...draft, category: 'Shopping', categoryEdited: true };
  assert.equal(applyCategorySuggestion(manual, 'Taxi', 'Transport'), manual);
  const income = { ...draft, kind: 'income' };
  assert.equal(applyCategorySuggestion(income, 'Taxi', 'Transport'), income);
  assert.equal(applyCategorySuggestion(null, 'Taxi', 'Transport'), null);
});
