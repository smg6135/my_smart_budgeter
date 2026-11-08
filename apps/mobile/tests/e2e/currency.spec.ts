import { expect, test } from './fixtures';
const rates = {
  SGD: 1,
  USD: 0.75,
  CAD: 1.05,
  EUR: 0.7,
  GBP: 0.6,
  AUD: 1.1,
  HKD: 6,
  JPY: 110,
  KRW: 1000,
  CNY: 5,
  INR: 60,
  MYR: 3.3,
  THB: 26,
  IDR: 12000,
  PHP: 45,
  VND: 19000,
  NZD: 1.2,
  CHF: 0.65,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/v1/fx/rates?base=SGD', (route) =>
    route.fulfill({
      json: {
        base: 'SGD',
        rates,
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        source: 'Coinbase',
      },
    }),
  );
});
test('books original currency once, converts reports, and preserves expense audit on edit', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set budget' }).click();
  await page.getByLabel('Monthly take-home income').fill('1000');
  await page.getByLabel('Savings percentage (0–100)').fill('30');
  await page.getByRole('button', { name: 'Save budget plan' }).click();
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Dinner in New York');
  await page.getByLabel('Amount', { exact: true }).fill('75');
  await page.getByRole('button', { name: 'Entry currency USD', exact: true }).click();
  await expect(page.getByText('Budget impact: SGD 100.00')).toBeVisible();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('$600.00', { exact: true })).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Display currency USD', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('US$450.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Dinner in New York', exact: true }).click();
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('75.00');
  await page.getByLabel('Name', { exact: true }).fill('Dinner with friends');
  await page.getByRole('button', { name: 'Save entry' }).click();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pocket-budget.v2.test-user')!),
  );
  expect(state.currency).toBe('SGD');
  expect(state.displayCurrency).toBe('USD');
  expect(state.entries[0].amount).toBe(10000);
  expect(state.entries[0].original.amount).toBe(7500);
  expect(state.entries[0].original.currency).toBe('USD');
  expect(state.entries[0].original.source).toBe('Coinbase');
});
test('offline foreign entries need an explicit rate and missing rates never relabel totals', async ({
  page,
}) => {
  await page.unroute('**/v1/fx/rates?base=SGD');
  await page.route('**/v1/fx/rates?base=SGD', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Rates unavailable for this test.' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Offline dinner');
  await page.getByLabel('Amount', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Entry currency USD', exact: true }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(
    page.getByText('Refresh exchange rates or enter the rate charged by your bank before saving.'),
  ).toBeVisible();
  await page.getByLabel('Exchange rate (SGD per 1 USD, optional)').fill('1.4');
  await expect(page.getByText('Budget impact: SGD 14.00')).toBeVisible();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Display currency USD', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Rate unavailable · totals shown in SGD')).toBeVisible();
  await expect(page.getByText('-SGD 14.00', { exact: true })).toBeVisible();
});

test('sample budget keeps loaded rates and later quotes never rewrite saved expenses', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText(/Live estimate · fetched/)).toBeVisible();
  await page.getByRole('button', { name: 'Try demo' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Foreign demo expense');
  await page.getByLabel('Amount', { exact: true }).fill('75');
  await page.getByRole('button', { name: 'Entry currency USD', exact: true }).click();
  await expect(page.getByText('Budget impact: SGD 100.00')).toBeVisible();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await page.route('**/v1/fx/rates?base=SGD', (route) =>
    route.fulfill({
      json: {
        base: 'SGD',
        rates: { ...rates, USD: 0.5 },
        fetchedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        source: 'Coinbase',
      },
    }),
  );
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Refresh rates', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pocket-budget.v2.test-user')!).fx?.rates.USD,
      ),
    )
    .toBe(0.5);
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pocket-budget.v2.test-user')!),
  );
  expect(state.entries[0].amount).toBe(10000);
  expect(state.entries[0].original.amount).toBe(7500);
  expect(state.entries[0].original.rate).toBeCloseTo(1 / 0.75);
});
