import { expect, test } from './fixtures';
import { newEntry, select } from './helpers';

test('unsupported OCR and AI never upload receipt data or use a cloud classifier', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/v1/receipts/scan', (route) => {
    calls++;
    return route.abort();
  });
  await page.route('**/v1/planner/chat', (route) => {
    calls++;
    return route.abort();
  });
  await page.goto('/tools');
  await expect(page.getByRole('button', { name: 'Upload receipts' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try cloud analysis' })).toHaveCount(0);
  expect(calls).toBe(0);
});
test('manual category selection works when the device model is unavailable', async ({ page }) => {
  await newEntry(page);
  await page.getByLabel('Name', { exact: true }).fill('Cinema tickets');
  await page.getByLabel('Amount', { exact: true }).fill('24');
  await select(page, 'Category', 'Other', 'Entertainment');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('button', { name: 'Edit Cinema tickets' })).toBeVisible();
  const entry = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pocket-budget.local.v1')!).entries[0],
  );
  expect(entry.category).toBe('Entertainment');
  expect(entry.amount).toBe(2400);
});
test('Plan includes budget controls and goals; old goal URL redirects', async ({ page }) => {
  await page.goto('/goals');
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole('heading', { name: 'Plan & goals', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New plan', exact: true })).toBeVisible();
});
