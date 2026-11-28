import { expect, test } from './fixtures';
import { initialState } from '../../src/finance';

test('extracted title/detail survive reload and manual edits without losing printed merchant evidence', async ({
  page,
}) => {
  await page.addInitScript(
    (state) => {
      if (!localStorage.getItem('pocket-budget.local.v1'))
        localStorage.setItem('pocket-budget.local.v1', JSON.stringify(state));
    },
    {
      ...initialState,
      entries: [
        {
          id: 'receipt-summary',
          kind: 'expense',
          title: 'Morning coffee',
          detail: 'A cappuccino',
          receiptMerchant: 'POCKET CAFE',
          amount: 500,
          date: '2026-11-08',
          category: 'Food & drinks',
        },
      ],
    },
  );
  await page.goto('/activity');
  await expect(
    page.getByRole('button', { name: 'Edit Morning coffee', exact: true }),
  ).toContainText('A cappuccino');
  await page.getByRole('button', { name: 'Edit Morning coffee', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Coffee with a friend');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit Coffee with a friend', exact: true }),
  ).toContainText('A cappuccino');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pocket-budget.local.v1')!).entries[0].title,
      ),
    )
    .toBe('Coffee with a friend');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Edit Coffee with a friend', exact: true }),
  ).toContainText('A cappuccino');
  const entry = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pocket-budget.local.v1')!).entries[0],
  );
  expect(entry.amount).toBe(500);
  expect(entry.receiptMerchant).toBe('POCKET CAFE');
  expect(entry.detail).toBe('A cappuccino');
});
