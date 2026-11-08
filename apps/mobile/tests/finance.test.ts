import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cents, initialState, State, summary, trajectory, validDate } from '../src/finance';
const state = (extra: Partial<State> = {}): State => ({
  ...initialState,
  income: 500000,
  entries: [],
  goals: [],
  bills: [],
  ...extra,
});
const now = '2026-10-15';
test('money input is exact cents and rejects unsafe or malformed values', () => {
  assert.equal(cents('12.34'), 1234);
  assert.equal(cents('0.29'), 29);
  for (const v of ['-1', '1.234', 'NaN', '1e6', '', '99999999999999'])
    assert.throws(() => cents(v));
});
test('dates reject rollover days and respect leap years', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-10-32'), false);
});
test('reserves essentials before percentage allocation and never double counts paid bills', () => {
  const s = state({
    bills: [{ id: 'rent', title: 'Rent', amount: 100000, recurring: true, date: '2026-01-01' }],
    entries: [
      {
        id: 'paid',
        kind: 'expense',
        title: 'Rent',
        category: 'Bills',
        amount: 100000,
        date: now,
        billId: 'rent',
      },
      { id: 'food', kind: 'expense', title: 'Lunch', category: 'Food', amount: 2500, date: now },
    ],
  });
  const m = summary(s, now);
  assert.equal(m.disposable, 400000);
  assert.equal(m.savingsBudget, 120000);
  assert.equal(m.remaining, 277500);
  assert.equal(m.cash, 397500);
});
test('paid bills still reserve their actual amount after a downward plan edit', () => {
  const m = summary(
    state({
      bills: [{ id: 'b', title: 'Rent', amount: 50000, recurring: true, date: now }],
      entries: [
        {
          id: 'e',
          title: 'Rent',
          amount: 100000,
          kind: 'expense',
          category: 'Bills',
          date: now,
          billId: 'b',
        },
      ],
    }),
    now,
  );
  assert.equal(m.fixed, 100000);
});
test('extra income, oversaving, and month boundaries are accounted for', () => {
  const m = summary(
    state({
      income: 10000,
      entries: [
        { id: 'i', kind: 'income', amount: 10000, title: 'Extra', category: 'Income', date: now },
        { id: 's', kind: 'saving', amount: 8000, title: 'Save', category: 'Savings', date: now },
        {
          id: 'past',
          kind: 'expense',
          amount: 99999,
          title: 'Old',
          category: 'Other',
          date: '2026-09-01',
        },
        {
          id: 'future',
          kind: 'expense',
          amount: 99999,
          title: 'Future',
          category: 'Other',
          date: '2026-11-01',
        },
      ],
    }),
    now,
  );
  assert.equal(m.income, 20000);
  assert.equal(m.savingsBudget, 6000);
  assert.equal(m.remaining, 12000);
  assert.equal(m.days, 17);
  assert.equal(m.daily, 705);
});
test('one-time outgoings and future recurring start dates are scoped to month', () => {
  const m = summary(
    state({
      bills: [
        { id: 'a', title: 'Past', amount: 100, recurring: false, date: '2026-09-01' },
        { id: 'b', title: 'Future', amount: 100, recurring: true, date: '2026-11-01' },
        { id: 'c', title: 'Current', amount: 300, recurring: false, date: '2026-10-31' },
      ],
    }),
    now,
  );
  assert.equal(m.fixed, 300);
});
test('overcommitted plan clamps spending and reports the shortfall', () => {
  const m = summary(
    state({
      income: 100,
      bills: [{ id: 'a', title: 'Rent', amount: 200, recurring: true, date: now }],
    }),
    now,
  );
  assert.equal(m.overcommitted, true);
  assert.equal(m.spendingBudget, 0);
});
test('multiple goals share one savings pool; impossible deadlines are flagged', () => {
  const t = trajectory(
    state({
      income: 10000,
      goals: [
        { id: 'a', title: 'A', target: 20000, initial: 0, deadline: '2026-10-31', emoji: 'a' },
        { id: 'b', title: 'B', target: 20000, initial: 0, deadline: '2026-10-31', emoji: 'b' },
      ],
    }),
    now,
  );
  assert.equal(t.percent, 400);
  assert.equal(t.feasible, false);
  assert.equal(
    t.rows.reduce((a, g) => a + g.allocation, 0),
    3000,
  );
  assert(t.rows.every((g) => !g.onTrack));
});
test('actual current contributions count toward trajectory instead of penalizing progress', () => {
  const s = state({
    income: 10000,
    savePercent: 50,
    goals: [{ id: 'a', title: 'A', target: 10000, initial: 0, deadline: '2026-11-30', emoji: 'a' }],
    entries: [
      {
        id: 'e',
        title: 'Save',
        amount: 5000,
        kind: 'saving',
        category: 'Savings',
        date: now,
        goalId: 'a',
      },
    ],
  });
  const t = trajectory(s, now);
  assert.equal(t.required, 5000);
  assert.equal(t.rows[0].saved, 5000);
  assert.equal(t.rows[0].allocation, 0);
  assert.equal(t.rows[0].projected, 10000);
  assert.equal(t.rows[0].onTrack, true);
});
test('overdue goal remains off track even when there is budget capacity', () => {
  const t = trajectory(
    state({
      goals: [{ id: 'a', title: 'A', target: 100, initial: 0, deadline: '2026-09-30', emoji: 'a' }],
    }),
    now,
  );
  assert.equal(t.rows[0].overdue, true);
  assert.equal(t.rows[0].onTrack, false);
});

test('foreign expenses use booked budget amounts and keep their original amount', () => {
  const s = state({
    entries: [
      {
        id: 'fx',
        kind: 'expense',
        amount: 13000,
        title: 'US lunch',
        category: 'Food',
        date: now,
        original: {
          amount: 10000,
          currency: 'USD',
          rate: 1.3,
          fetchedAt: '2026-10-01T00:00:00Z',
          source: 'Manual',
        },
      },
    ],
  });
  assert.equal(summary(s, now).spending, 13000);
  assert.equal(summary(s, now).remaining, 337000);
});
