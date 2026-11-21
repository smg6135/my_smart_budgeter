import { expect, test } from './fixtures';
import { newEntry, openPlan, select, setBudget } from './helpers';

test('budget, bill payment, minimal transaction CRUD, savings and persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setBudget(page);
  await openPlan(page);
  await page.getByRole('button', { name: 'Add outgoing', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Home rent');
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Save outgoing' }).click();
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.getByText('Paid this month', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('$2,800.00', { exact: true }).first()).toBeVisible();
  await newEntry(page);
  await expect(page.getByLabel('Date (YYYY-MM-DD)', { exact: true })).toHaveCount(0);
  await page.getByLabel('Name', { exact: true }).fill('Coffee');
  await page.getByLabel('Amount', { exact: true }).fill('5.50');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await page.getByRole('button', { name: 'Edit Coffee', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('6.50');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('−$6.50', { exact: true })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('$2,793.50', { exact: true })).toBeVisible();
  await openPlan(page);
  await page.getByRole('button', { name: 'New savings goal' }).click();
  await page.getByLabel('Name', { exact: true }).fill('A good trip');
  await page.getByLabel('Target amount').fill('1200');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await page.getByRole('button', { name: 'Add savings', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('$100.00', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open plan Monthly budget' }).click();
  await expect(page.getByText('A good trip', { exact: true })).toBeVisible();
  await page.goto('/activity');
  await page.getByRole('button', { name: 'Delete Coffee', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Coffee', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  if (test.info().project.name !== 'desktop') {
    for (const name of ['Overview', 'Activity', 'Plan', 'AI planner', 'Tools']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect((box?.y || 0) + (box?.height || 0)).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
  }
});
test('minimal entry defaults its name and supports income; filters apply explicitly', async ({
  page,
}) => {
  await newEntry(page);
  await page.getByLabel('Amount', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByRole('button', { name: 'Edit Other' })).toBeVisible();
  await page.getByRole('button', { name: 'Add an entry' }).click();
  await select(page, 'Entry type', '−', '+');
  await page.getByLabel('Amount', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await select(page, 'Type', 'All', 'Income');
  await expect(page.getByRole('button', { name: 'Edit Other' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('button', { name: 'Edit Other' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Income', exact: true })).toBeVisible();
  await page.getByLabel('From date').fill('2099-01-01');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No entries', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Search activity')).toHaveCount(0);
});

test('validates money input and gates AI by device capability without cloud calls', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/v1/planner/chat', (route) => {
    calls++;
    return route.abort();
  });
  await newEntry(page);
  await page.getByLabel('Amount', { exact: true }).fill('-5');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('Enter an amount with up to 2 decimal places.')).toBeVisible();
  await page.getByRole('button', { name: 'Close form' }).click();
  await page.goto('/planner');
  await page.getByLabel('Message your planner').fill('A TV');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  expect(calls).toBe(0);
});
test('on-device AI has no cloud mode or price research control', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('On-device AI', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'Categorizes entries and receipts after OCR. Chat stays on-device.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: /AI mode/ })).toHaveCount(0);
  await expect(page.getByLabel('Research prices on the web')).toHaveCount(0);
});
test('unsupported browser scanning has no paid receipt upload fallback', async ({ page }) => {
  await page.goto('/tools');
  await expect(
    page.getByText('On-device scanning is available in the iOS app. Add entries manually here.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload receipts' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try cloud analysis' })).toHaveCount(0);
});
