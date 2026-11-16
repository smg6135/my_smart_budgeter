import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, summary } from '../src/finance';
import {
  addPlan,
  editPlan,
  migratePlans,
  monthEnd,
  planAtDate,
  projectPlan,
  setPlanStatus,
  shiftMonth,
} from '../src/plans';
test('migration preserves budget, preferences and historical values', () => {
  const legacy = {
    ...initialState,
    income: 500000,
    displayCurrency: 'USD',
    bills: [{ id: 'rent', title: 'Rent', amount: 100000, date: '2026-01-01', recurring: true }],
  };
  const state = migratePlans(legacy);
  assert.equal(state.plans?.[0].status, 'active');
  assert.deepEqual(state.bills, legacy.bills);
  assert.deepEqual(state.preferredCurrencies, ['SGD', 'USD']);
  assert.equal(summary(planAtDate(state, '2026-10-31'), '2026-10-31').remaining, 280000);
  assert.deepEqual(migratePlans(state), state);
});
test('drafts are isolated, activation is exclusive, and deactivation clears projection', () => {
  let state = migratePlans({ ...initialState, income: 500000 });
  state = addPlan(state, 'Travel year', 300000, 50);
  const draftId = state.plans![1].id;
  state = editPlan(state, draftId, (p) => ({ ...p, income: 600000 }), '2026-11-10');
  assert.equal(summary(projectPlan(state), '2026-11-10').remaining, 350000);
  state = setPlanStatus(state, draftId, 'active', '2026-11-11');
  assert.equal(state.plans!.filter((p) => p.status === 'active').length, 1);
  assert.equal(state.income, 600000);
  assert.equal(state.plans![0].status, 'inactive');
  state = setPlanStatus(state, draftId, 'inactive', '2026-11-12');
  assert.equal(state.income, 0);
  assert.equal(state.plans![1].income, 600000);
  state = setPlanStatus(state, draftId, 'draft', '2026-11-12');
  assert.equal(state.plans![1].status, 'draft');
});
test('later edits preserve historical summaries and the ledger', () => {
  let state = migratePlans({
    ...initialState,
    income: 500000,
    entries: [
      {
        id: 'e',
        kind: 'expense' as const,
        amount: 10000,
        title: 'Lunch',
        category: 'Food',
        date: '2026-10-10',
      },
    ],
  });
  const first = state.plans![0].id;
  state = editPlan(state, first, (p) => ({ ...p, income: 700000 }), '2026-11-01');
  assert.equal(summary(planAtDate(state, '2026-10-31'), '2026-10-31').remaining, 340000);
  assert.equal(summary(planAtDate(state, '2026-11-01'), '2026-11-01').remaining, 490000);
  state = setPlanStatus(state, first, 'inactive', '2026-11-02');
  assert.equal(planAtDate(state, '2026-11-02').income, 0);
  assert.equal(planAtDate(state, '2026-11-01').income, 700000);
  assert.equal(state.entries.length, 1);
});
test('old plan payments still count as spending', () => {
  const totals = summary(
    {
      ...initialState,
      income: 100000,
      entries: [
        {
          id: 'e',
          kind: 'expense' as const,
          billId: 'old-plan-bill',
          amount: 10000,
          title: 'Bill',
          category: 'Bills',
          date: '2026-11-10',
        },
      ],
    },
    '2026-11-10',
  );
  assert.equal(totals.spending, 10000);
  assert.equal(totals.paid, 0);
  assert.equal(totals.cash, 90000);
  assert.equal(totals.remaining, 60000);
});
test('calendar handles year boundaries and leap years', () => {
  assert.equal(monthEnd('2028-02'), '2028-02-29');
  assert.equal(monthEnd('2026-02'), '2026-02-28');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});
