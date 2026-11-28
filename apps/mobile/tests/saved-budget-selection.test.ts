import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetChoices } from '../src/saved-budget-selection';
const guest = 'pocket-budget.local.v1';
const one = 'pocket-budget.v2.old%2Fone';
const two = 'pocket-budget.v2.two';
test('retains previous account namespace without token validation', () => {
  const result = budgetChoices([guest, one, two], null, 'old/one');
  assert.equal(result.selected.key, one);
  assert.equal(result.selected.uid, 'old/one');
  assert.equal(result.budgets.length, 3);
});
test('explicit local selection wins over old credentials', () => {
  assert.equal(budgetChoices([guest, one], guest, 'old/one').selected.key, guest);
});
test('guest, lone prior budget, and fresh installation selection', () => {
  assert.equal(budgetChoices([guest, one], null).selected.key, guest);
  assert.equal(budgetChoices([one], null).selected.key, one);
  assert.equal(budgetChoices([], null).selected.key, guest);
});
test('namespaces never merge and malformed keys cannot alias another budget', () => {
  const keys = [one, two, 'pocket-budget.v2.%xx', 'pocket-budget.v2.%74wo'];
  const before = [...keys];
  assert.deepEqual(
    budgetChoices(keys, 'missing').budgets.map((b) => b.key),
    [guest, one, two],
  );
  assert.deepEqual(keys, before);
});
