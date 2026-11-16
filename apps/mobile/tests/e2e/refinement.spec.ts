import { expect, test } from './fixtures';
import { demoState, today } from '../../src/finance';
import { monthEnd, shiftMonth } from '../../src/plans';
import { addCurrency, newEntry, openPlan, select, setBudget } from './helpers';
import { textProblems } from './layout-helpers';

test('plan list opens details; drafts are isolated and lifecycle updates Overview', async ({
  page,
}) => {
  await setBudget(page, '1000');
  await page.goto('/plan');
  await expect(page.getByText('Monthly take-home income', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'New plan', exact: true }).click();
  await page.getByLabel('Plan name').fill('Travel budget');
  await page.getByLabel('Monthly take-home income').fill('2000');
  await page.getByLabel('Savings percentage (0–100)').fill('50');
  await page.getByRole('button', { name: 'Save budget plan' }).click();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add outgoing', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Travel pass');
  await page.getByLabel('Amount', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Save outgoing' }).click();
  await expect(page.getByRole('button', { name: 'Mark paid' })).toBeDisabled();
  await page.goto('/');
  await expect(page.getByText('$700.00', { exact: true }).first()).toBeVisible();
  await openPlan(page, 'Travel budget');
  await page.getByRole('button', { name: 'Activate', exact: true }).click();
  await page.goto('/');
  await expect(page.getByText(/Travel budget · SGD/)).toBeVisible();
  await expect(page.getByText('$900.00', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Travel budget · SGD/)).toBeVisible();
  await openPlan(page, 'Travel budget');
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await page.getByRole('button', { name: 'Move to draft', exact: true }).click();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Set budget', exact: true })).toBeVisible();
});

test('calendar navigates past months and shows preserved summary and selected-day entries', async ({
  page,
}) => {
  const sample = demoState();
  const previous = shiftMonth(today().slice(0, 7), -1);
  const date = previous + '-10';
  sample.entries = [
    {
      id: 'past-coffee',
      title: 'Past coffee',
      amount: 500,
      kind: 'expense',
      category: 'Food & drinks',
      date,
    },
  ];
  await page.addInitScript(
    (state) => localStorage.setItem('pocket-budget.v2.test-user', JSON.stringify(state)),
    sample,
  );
  await page.goto('/');
  await expect(page.getByTestId('daily-allowance')).toBeVisible();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByText('MONTH SUMMARY', { exact: true })).toBeVisible();
  await expect(page.getByTestId('daily-allowance')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: `View ${monthEnd(previous)}`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: `View ${date}`, exact: true }).click();
  await expect(page.getByText('Past coffee', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(page.getByTestId('daily-allowance')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();
});

test('currency favorites limit entry selectors and region settings stay separate', async ({
  page,
}) => {
  await addCurrency(page, 'USD');
  await select(page, 'Display currency', 'SGD', 'USD');
  await page.getByRole('radio', { name: 'Service region Singapore' }).click();
  await expect(page.getByRole('radio', { name: 'Service region Singapore' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Display currency USD' })).toBeVisible();
  await page.getByRole('radio', { name: 'AI mode Conversation' }).click();
  await expect(
    page.getByText('Uses a more capable model for detailed questions and complex decisions.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify email' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh session' })).toHaveCount(0);
  await newEntry(page);
  await page.getByRole('button', { name: 'Entry currency USD' }).click();
  await expect(page.getByRole('button', { name: 'Select SGD', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select EUR', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select SGD', exact: true }).click();
  await page.getByRole('button', { name: 'Close form' }).click();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Remove currency USD' }).click();
  await expect(page.getByRole('button', { name: 'Display currency SGD' })).toBeVisible();
  await newEntry(page);
  await expect(page.getByRole('button', { name: 'Entry currency SGD' })).toBeVisible();
});

test('phone statistics and entry controls remain horizontal; bottom bar fills the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setBudget(page);
  await page.goto('/');
  const cards = page.getByTestId('overview-statistics').getByTestId('budget-card');
  const boxes = await Promise.all((await cards.all()).map((card) => card.boundingBox()));
  expect(new Set(boxes.map((box) => Math.round(box!.y))).size).toBe(1);
  await expect(page.getByRole('button', { name: 'Change display currency' })).toHaveCount(0);
  const bottom = await page.getByTestId('bottom-navigation').boundingBox();
  expect(Math.round(bottom!.y + bottom!.height)).toBe(844);
  await newEntry(page);
  const row = page.getByTestId('entry-amount-row');
  const controls = [
    row.getByRole('button', { name: 'Entry type −' }),
    row.getByLabel('Amount', { exact: true }),
    row.getByRole('button', { name: 'Entry currency SGD' }),
  ];
  const positions = await Promise.all(controls.map((control) => control.boundingBox()));
  expect(
    Math.max(...positions.map((box) => box!.y)) - Math.min(...positions.map((box) => box!.y)),
  ).toBeLessThan(10);
  expect(await textProblems(page)).toEqual([]);
});
