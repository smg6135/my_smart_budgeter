import { BudgetPlan, id, State, today } from './finance';
import { supportedCurrency } from './currency';

export function projectPlan(state: State, plan?: BudgetPlan | null): State {
  const selected = plan === undefined ? state.plans?.find((p) => p.status === 'active') : plan;
  return {
    ...state,
    income: selected?.income ?? 0,
    savePercent: selected?.savePercent ?? 30,
    bills: selected?.bills ?? [],
    goals: selected?.goals ?? [],
  };
}

export function migratePlans(state: State): State {
  const preferredCurrencies = [
    ...new Set([
      state.currency,
      state.displayCurrency || state.currency,
      ...(state.preferredCurrencies ||
        state.entries.map((e) => e.original?.currency || state.currency)),
    ]),
  ].filter(supportedCurrency);
  if (state.plans) return { ...projectPlan(state), preferredCurrencies };
  const legacy: BudgetPlan = {
    id: 'legacy-budget',
    name: 'Monthly budget',
    status: 'active',
    income: state.income,
    savePercent: state.savePercent,
    bills: state.bills,
    goals: state.goals,
  };
  const hasBudget = !!(state.income || state.bills.length || state.goals.length);
  return {
    ...state,
    preferredCurrencies,
    plans: hasBudget ? [legacy] : [],
    planHistory: hasBudget ? [{ from: '0001-01-01', plan: legacy }] : [],
  };
}

function recordActive(state: State, date: string): State {
  const active = state.plans?.find((p) => p.status === 'active') || null;
  const history = (state.planHistory || []).filter((p) => p.from !== date);
  return {
    ...projectPlan(state),
    planHistory: [...history, { from: date, plan: active }].sort((a, b) =>
      a.from.localeCompare(b.from),
    ),
  };
}

export function addPlan(state: State, name: string, income: number, savePercent: number): State {
  return projectPlan({
    ...state,
    plans: [
      ...(state.plans || []),
      {
        id: id(),
        name,
        income,
        savePercent,
        status: 'draft',
        bills: [],
        goals: [],
      },
    ],
  });
}

export function editPlan(
  state: State,
  planId: string,
  change: (plan: BudgetPlan) => BudgetPlan,
  date = today(),
): State {
  const plan = state.plans?.find((p) => p.id === planId);
  if (!plan) throw new Error('Select a plan first.');
  const next = {
    ...state,
    plans: state.plans!.map((p) =>
      p.id === planId ? { ...change(p), id: p.id, status: p.status } : p,
    ),
  };
  return plan.status === 'active' ? recordActive(next, date) : next;
}

export function setPlanStatus(
  state: State,
  planId: string,
  status: BudgetPlan['status'],
  date = today(),
): State {
  if (!state.plans?.some((p) => p.id === planId)) throw new Error('Plan not found.');
  const next = {
    ...state,
    plans: state.plans.map((p) =>
      p.id === planId
        ? { ...p, status }
        : status === 'active' && p.status === 'active'
          ? { ...p, status: 'inactive' as const }
          : p,
    ),
  };
  return recordActive(next, date);
}

export function planAtDate(state: State, date: string): State {
  const period = [...(state.planHistory || [])]
    .sort((a, b) => b.from.localeCompare(a.from))
    .find((p) => p.from <= date);
  return period ? projectPlan(state, period.plan) : projectPlan(state, null);
}

export function monthEnd(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return `${month}-${new Date(year, number, 0).getDate()}`;
}

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
