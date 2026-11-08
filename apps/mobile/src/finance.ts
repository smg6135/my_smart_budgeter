import { defaultApiUrl } from './lib/config';
import { FxSnapshot, OriginalAmount, parseAmount, formatMoney } from './currency';
export type Kind = 'expense' | 'income' | 'saving';
export type Entry = {
  id: string;
  kind: Kind;
  amount: number;
  title: string;
  category: string;
  date: string;
  goalId?: string;
  billId?: string;
  original?: OriginalAmount;
};
export type Bill = { id: string; title: string; amount: number; recurring: boolean; date: string };
export type Goal = {
  id: string;
  title: string;
  target: number;
  initial: number;
  deadline: string;
  emoji: string;
};
export type Message = { role: 'user' | 'assistant'; content: string };
export type State = {
  version: 1;
  currency: string;
  displayCurrency?: string;
  fx?: FxSnapshot;
  income: number;
  savePercent: number;
  bills: Bill[];
  entries: Entry[];
  goals: Goal[];
  messages: Message[];
  apiUrl: string;
  aiMode?: 'planning' | 'conversation';
  research: boolean;
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export const initialState: State = {
  version: 1,
  currency: 'SGD',
  income: 0,
  savePercent: 30,
  bills: [],
  entries: [],
  goals: [],
  messages: [],
  apiUrl: defaultApiUrl,
  research: true,
};
export const cents = (value: string) => parseAmount(value);
export function validDate(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s)) &&
    new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s
  );
}
export const money = formatMoney;
export function monthLabel(date = today()) {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-SG', {
    month: 'long',
    year: 'numeric',
  });
}
export function addMonths(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function summary(s: State, now = today()) {
  const month = now.slice(0, 7),
    entries = s.entries.filter((e) => e.date.startsWith(month) && e.date <= now);
  const bills = s.bills.filter((b) =>
    b.recurring ? b.date <= `${month}-31` : b.date.startsWith(month),
  );
  const sum = (kind: Kind) =>
    entries.filter((e) => e.kind === kind).reduce((a, e) => a + e.amount, 0);
  const fixed = bills.reduce(
    (a, b) =>
      a +
      Math.max(
        b.amount,
        entries.filter((e) => e.billId === b.id).reduce((total, e) => total + e.amount, 0),
      ),
    0,
  );
  const income = s.income + sum('income');
  // A linked bill payment consumes its reservation, never the variable spending envelope.
  const spending = entries
    .filter((e) => e.kind === 'expense' && !e.billId)
    .reduce((a, e) => a + e.amount, 0);
  const paid = entries
    .filter((e) => e.kind === 'expense' && e.billId)
    .reduce((a, e) => a + e.amount, 0);
  const disposable = Math.max(0, income - fixed),
    savingsBudget = Math.round((disposable * s.savePercent) / 100),
    spendingBudget = disposable - savingsBudget;
  const saved = sum('saving'),
    remaining = spendingBudget - spending - Math.max(0, saved - savingsBudget);
  const d = new Date(now + 'T12:00:00'),
    days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
  return {
    entries,
    bills,
    income,
    fixed,
    paid,
    disposable,
    savingsBudget,
    spendingBudget,
    spending,
    saved,
    remaining,
    days,
    daily: Math.max(0, Math.floor(remaining / days)),
    cash: income - spending - paid - saved,
    overcommitted: fixed > income,
  };
}
export function savedFor(s: State, g: Goal, now = today()) {
  return (
    g.initial +
    s.entries
      .filter((e) => e.kind === 'saving' && e.goalId === g.id && e.date <= now)
      .reduce((a, e) => a + e.amount, 0)
  );
}
export function trajectory(s: State, now = today()) {
  const m = summary(s, now),
    month = now.slice(0, 7);
  const rows = s.goals.map((g) => {
    const saved = savedFor(s, g, now),
      remaining = Math.max(0, g.target - saved);
    const contributed = m.entries
      .filter((e) => e.kind === 'saving' && e.goalId === g.id)
      .reduce((a, e) => a + e.amount, 0);
    const beforeMonth =
      g.initial +
      s.entries
        .filter((e) => e.kind === 'saving' && e.goalId === g.id && e.date.slice(0, 7) < month)
        .reduce((a, e) => a + e.amount, 0);
    const d = new Date(g.deadline + 'T12:00:00'),
      n = new Date(now + 'T12:00:00');
    const months = Math.max(
      1,
      (d.getFullYear() - n.getFullYear()) * 12 + d.getMonth() - n.getMonth() + 1,
    );
    const required = Math.ceil(Math.max(0, g.target - beforeMonth) / months);
    return {
      ...g,
      saved,
      remaining,
      months,
      contributed,
      required,
      needed: Math.max(0, required - contributed),
      overdue: g.deadline < now && remaining > 0,
    };
  });
  const required = rows.reduce((a, g) => a + g.required, 0),
    needed = rows.reduce((a, g) => a + g.needed, 0),
    savingLeft = Math.max(0, m.savingsBudget - m.saved);
  const percent =
    m.disposable > 0 ? Math.ceil((required / m.disposable) * 100) : required > 0 ? 101 : 0;
  return {
    rows: rows.map((g) => {
      const allocation = needed
        ? Math.min(g.remaining, Math.floor((savingLeft * g.needed) / needed))
        : 0;
      const monthlyAllocation = required
        ? Math.floor((m.savingsBudget * g.required) / required)
        : 0;
      const projected = Math.min(
        g.target,
        g.saved + allocation + monthlyAllocation * (g.months - 1),
      );
      return {
        ...g,
        allocation,
        onTrack: !g.overdue && (g.remaining === 0 || projected >= g.target - 1),
        projected,
      };
    }),
    required,
    percent,
    feasible: percent <= 100,
    available: savingLeft,
  };
}
export function demoState(): State {
  const date = today(),
    month = date.slice(0, 7);
  return {
    ...initialState,
    income: 580000,
    bills: [
      {
        id: 'rent',
        title: 'Home & utilities',
        amount: 160000,
        recurring: true,
        date: month + '-01',
      },
      {
        id: 'transport',
        title: 'Transport pass',
        amount: 12000,
        recurring: true,
        date: month + '-01',
      },
    ],
    goals: [
      {
        id: 'travel',
        title: 'Hong Kong trip',
        target: 240000,
        initial: 68000,
        deadline: addMonths(4),
        emoji: '✈️',
      },
      {
        id: 'buffer',
        title: 'Emergency fund',
        target: 600000,
        initial: 240000,
        deadline: addMonths(12),
        emoji: '🌱',
      },
    ],
    entries: [
      {
        id: '1',
        kind: 'expense',
        amount: 1850,
        title: 'Lunch',
        category: 'Food & drinks',
        date,
      },
      {
        id: '2',
        kind: 'expense',
        amount: 7680,
        title: 'Groceries',
        category: 'Groceries',
        date,
      },
      {
        id: '3',
        kind: 'expense',
        amount: 4200,
        title: 'Home supplies',
        category: 'Shopping',
        date,
      },
      {
        id: '4',
        kind: 'saving',
        amount: 22000,
        title: 'Savings deposit',
        category: 'Savings',
        date,
        goalId: 'travel',
      },
    ],
  };
}
