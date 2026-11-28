import { captureDate } from '../../src/transaction-capture';
import { expect, test } from './fixtures';
import { select } from './helpers';
import { initialState } from '../../src/finance';

const timestamp = () => new Date(Date.now() - 60000).toISOString();
const captureUrl = (time: string, extra: Record<string, string> = {}) =>
  '/capture?' +
  new URLSearchParams({
    merchant: 'Corner Cafe',
    amount: '12.50',
    currency: 'SGD',
    timestamp: time,
    ...extra,
  }).toString();
async function pasteBank(page: import('@playwright/test').Page, time: string) {
  await page.getByRole('button', { name: 'Paste a purchase alert', exact: true }).click();
  await page
    .getByLabel('Purchase alert text')
    .fill('Your card ending 1234 was charged SGD 12.50 at Corner Cafe on 22 Nov 2026.');
  await page.getByLabel('Alert timestamp (ISO 8601)').fill(time);
  await page.getByRole('button', { name: 'Prepare purchase draft', exact: true }).click();
}
async function ledger(page: import('@playwright/test').Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('pocket-budget.local.v1')!));
}

test('Shortcut replay survives reload without automatically booking or uploading an expense', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('https://**', (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const time = timestamp();
  const url = captureUrl(time);
  await page.goto(url);
  await expect(page).toHaveURL(/\/tools$/);
  await expect(page.getByRole('button', { name: 'Review Corner Cafe', exact: true })).toBeVisible();
  await expect.poll(async () => (await ledger(page)).captures?.length).toBe(1);
  expect((await ledger(page)).entries).toHaveLength(0);
  await page.goto(url);
  await expect(page).toHaveURL(/\/tools$/);
  await expect(page.getByRole('button', { name: 'Review Corner Cafe', exact: true })).toHaveCount(
    1,
  );
  expect((await ledger(page)).captures).toHaveLength(1);
  await page.goto(captureUrl(time.replace('Z', '+00:00'), { amount: '12.5', currency: 'sgd' }));
  await expect(page).toHaveURL(/\/tools$/);
  await expect(page.getByRole('button', { name: 'Review Corner Cafe', exact: true })).toHaveCount(1);
  expect((await ledger(page)).captures).toHaveLength(1);
  expect(
    requests.every((url) => url.startsWith('https://api.coinbase.com/v2/exchange-rates?')),
  ).toBe(true);
});

test('wallet and bank alerts combine into one reviewed expense with both source identities', async ({
  page,
}) => {
  const time = timestamp();
  await page.goto(captureUrl(time));
  await expect(page).toHaveURL(/\/tools$/);
  await pasteBank(page, time);
  await expect(page.getByRole('button', { name: 'Review Corner Cafe', exact: true })).toHaveCount(
    2,
  );
  await page.getByRole('button', { name: 'Review Corner Cafe', exact: true }).last().click();
  await page
    .getByRole('button', { name: 'Same purchase as alert Corner Cafe', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Review Corner Cafe', exact: true })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: 'Review Corner Cafe', exact: true }).click();
  await select(page, 'Purchase category', 'Select', 'Food & drinks');
  await page.getByRole('button', { name: 'Add reviewed expense', exact: true }).click();
  await expect.poll(async () => (await ledger(page)).entries?.length).toBe(1);
  const entry = (await ledger(page)).entries[0];
  expect(entry.amount).toBe(1250);
  expect(entry.capture.sourceIds).toHaveLength(2);
  expect(entry.capture.providers.sort()).toEqual(['Pasted alert', 'iPhone Shortcut'].sort());
  await page.goto(captureUrl(time));
  await expect(page).toHaveURL(/\/tools$/);
  await expect(page.getByRole('button', { name: 'Review Corner Cafe', exact: true })).toHaveCount(
    0,
  );
  expect((await ledger(page)).entries).toHaveLength(1);
});

test('a bank alert links to an existing manual expense without overwriting its category', async ({
  page,
}) => {
  const time = timestamp();
  await page.addInitScript(
    (state) => localStorage.setItem('pocket-budget.local.v1', JSON.stringify(state)),
    {
      ...initialState,
      entries: [
        {
          id: 'manual',
          title: 'Corner Cafe',
          kind: 'expense',
          amount: 1250,
          category: 'Shopping',
          date: captureDate({ occurredAt: time }),
        },
      ],
    },
  );
  await page.goto(captureUrl(time));
  await expect(page).toHaveURL(/\/tools$/);
  await page.getByRole('button', { name: 'Review Corner Cafe', exact: true }).click();
  await page
    .getByRole('button', { name: 'Link existing purchase Corner Cafe', exact: true })
    .click();
  await expect.poll(async () => (await ledger(page)).entries[0].capture?.sourceIds.length).toBe(1);
  expect((await ledger(page)).entries).toHaveLength(1);
  expect((await ledger(page)).entries[0].category).toBe('Shopping');
});

test('two real matching-price purchases require explicit separate-purchase confirmation', async ({
  page,
}) => {
  const time = timestamp();
  await page.goto(captureUrl(time));
  await expect(page).toHaveURL(/\/tools$/);
  await page.getByRole('button', { name: 'Review Corner Cafe', exact: true }).click();
  await select(page, 'Purchase category', 'Select', 'Food & drinks');
  await page.getByRole('button', { name: 'Add reviewed expense', exact: true }).click();
  await expect.poll(async () => (await ledger(page)).entries.length).toBe(1);
  const next = new Date(Date.parse(time) + 30000).toISOString();
  await page.goto(captureUrl(next));
  await expect(page).toHaveURL(/\/tools$/);
  await page.getByRole('button', { name: 'Review Corner Cafe', exact: true }).click();
  await expect(page.getByText('Possible matches', { exact: true })).toBeVisible();
  await select(page, 'Purchase category', 'Select', 'Food & drinks');
  await page.getByRole('button', { name: 'Add as a separate purchase', exact: true }).click();
  await expect.poll(async () => (await ledger(page)).entries.length).toBe(2);
});

test('invalid Shortcut data and security-code paste cannot book transactions', async ({ page }) => {
  await page.goto(captureUrl(timestamp(), { currency: '$' }));
  await expect(
    page.getByText('The Shortcut needs a positive amount and an explicit currency such as SGD.'),
  ).toBeVisible();
  expect((await ledger(page)).entries).toHaveLength(0);
  await page.getByRole('button', { name: 'Back to Tools' }).click();
  await page.getByRole('button', { name: 'Paste a purchase alert', exact: true }).click();
  await page.getByLabel('Purchase alert text').fill('Your OTP 123456 approves SGD 12.50');
  await page.getByRole('button', { name: 'Prepare purchase draft', exact: true }).click();
  await expect(
    page.getByText(
      'This is not a purchase alert. Security codes and declined-payment alerts are not imported.',
    ),
  ).toBeVisible();
  expect((await ledger(page)).captures || []).toHaveLength(0);
});

test('captured drafts stay in the selected device budget', async ({ page }) => {
  await page.addInitScript((state) => {
    if (localStorage.getItem('capture-seeded')) return;
    localStorage.setItem('pocket-budget.local.v1', JSON.stringify(state));
    localStorage.setItem('pocket-budget.v2.other', JSON.stringify(state));
    localStorage.setItem('capture-seeded', '1');
  }, initialState);
  await page.goto(captureUrl(timestamp()));
  await expect(page).toHaveURL(/\/tools$/);
  await expect.poll(async () => (await ledger(page)).captures?.length).toBe(1);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Saved budget 1', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pocket-budget.selected.v1')))
    .toBe('pocket-budget.v2.other');
  await page.goto('/tools');
  await expect(page.getByText('No purchase alerts to review.')).toBeVisible();
  expect((await ledger(page)).captures).toHaveLength(1);
});
