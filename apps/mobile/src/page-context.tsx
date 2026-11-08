import { createContext, ReactNode, useContext } from 'react';
export type Tab = 'Overview' | 'Activity' | 'Plan' | 'AI planner' | 'Tools' | 'Settings';
export const routes: Record<Tab, string> = {
  Overview: '/',
  Activity: '/activity',
  Plan: '/plan',
  'AI planner': '/planner',
  Tools: '/tools',
  Settings: '/settings',
};
export const PageContext = createContext<((tab: Tab) => ReactNode) | null>(null);
export function useBudgetPage(tab: Tab) {
  const render = useContext(PageContext);
  if (!render) throw new Error('Budget page must be inside the app layout.');
  return render(tab);
}
