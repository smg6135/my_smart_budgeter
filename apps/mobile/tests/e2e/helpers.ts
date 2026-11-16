import { Page } from '@playwright/test';
import { expect } from './fixtures';
export async function select(page: Page, label: string, current: string, next: string) {
  await page.getByRole('button', { name: `${label} ${current}`, exact: true }).click();
  await page.getByRole('button', { name: `Select ${next}`, exact: true }).click();
}
export async function setBudget(page: Page, income = '5000') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set budget', exact: true }).click();
  await page.getByLabel('Monthly take-home income').fill(income);
  await page.getByLabel('Savings percentage (0–100)').fill('30');
  await page.getByRole('button', { name: 'Save budget plan', exact: true }).click();
}
export async function openPlan(page: Page, name = 'Monthly budget') {
  await page.goto('/plan');
  await page.getByRole('button', { name: `Open plan ${name}`, exact: true }).click();
}
export async function newEntry(page: Page) {
  await page.goto('/activity');
  await page.getByRole('button', { name: 'Add an entry', exact: true }).click();
}
export async function addCurrency(page: Page, currency: string) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add currency', exact: true }).click();
  await select(page, 'Add currency', 'Select', currency);
  await expect(page.getByRole('button', { name: `Remove currency ${currency}` })).toBeVisible();
}
