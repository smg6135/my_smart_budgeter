import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseCategories, validateClassification } from '../src/classification';

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
