import { textProblems } from './layout-helpers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
// Distinct image bytes simulate different photos; OCR is mocked by these browser tests.
const image = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.concat([png, Buffer.from(name)]),
});
const receipt = {
  merchant: 'Cafe',
  amount: 12.5,
  currency: 'SGD',
  date: '2026-10-01',
  category: 'Other',
  notes: '',
};
async function upload(page: Page, files: ReturnType<typeof image>[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload receipts', exact: true }).click();
  const picker = await chooser;
  expect(picker.isMultiple()).toBe(true);
  await picker.setFiles(files);
}
async function entryCount(page: Page, count: number) {
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pocket-budget.v2.test-user')!).entries.length,
      ),
    )
    .toBe(count);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await page.goto('/tools');
});

test('selection auto-analyzes, adds clear receipts, skips duplicate photos and supports Undo', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/v1/receipts/scan', (route) => {
    calls++;
    expect(route.request().headers()['authorization']).toBe('Bearer customer-test-token');
    expect(route.request().headers()).not.toHaveProperty('x-openai-key');
    return route.fulfill({ json: receipt });
  });
  await upload(page, [image('lunch.png'), image('dinner.png'), image('lunch.png')]);
  await expect(page.getByText('Added 2 expenses', { exact: true })).toBeVisible();
  await expect(page.getByText('1 duplicate photo skipped', { exact: true })).toBeVisible();
  await expect(page.getByTestId('receipt-review')).toHaveCount(0);
  await entryCount(page, 2);
  expect(calls).toBe(2);
  // Reimporting the same photo is also rejected against the saved ledger.
  await upload(page, [image('lunch.png')]);
  await expect(page.getByText('1 duplicate photo skipped', { exact: true })).toBeVisible();
  await entryCount(page, 2);
  expect(calls).toBe(2);
  await upload(page, [image('breakfast.png')]);
  await expect(page.getByText('Added 1 expense', { exact: true })).toBeVisible();
  await entryCount(page, 3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await entryCount(page, 2);
  // Undo never starts another analysis or automatically re-adds the removed expense.
  await page.waitForTimeout(200);
  await entryCount(page, 2);
  expect(calls).toBe(3);
});

test('partial failure auto-adds successes and opens only the failed receipt for retry', async ({
  page,
}) => {
  let active = 0,
    peak = 0,
    attempts = 0,
    calls = 0;
  await page.route('**/v1/receipts/scan', async (route) => {
    active++;
    calls++;
    peak = Math.max(peak, active);
    const failedPhoto = Buffer.from(route.request().postDataJSON().data, 'base64').includes(
      Buffer.from('bill.png'),
    );
    if (failedPhoto) attempts++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    active--;
    if (failedPhoto && attempts === 1)
      await route.fulfill({ status: 502, json: { detail: 'Receipt could not be read.' } });
    else
      await route.fulfill({ json: { ...receipt, merchant: failedPhoto ? 'Utilities' : 'Cafe' } });
  });
  await upload(page, [image('lunch.png'), image('dinner.png'), image('bill.png')]);
  await expect(page.getByTestId('receipt-row')).toHaveCount(1);
  await expect(page.getByText('Receipt could not be read.', { exact: true })).toBeVisible();
  await entryCount(page, 2);
  expect(peak).toBeLessThanOrEqual(2);
  await page.getByRole('button', { name: 'Retry bill.png', exact: true }).click();
  await expect(page.getByText('Added 3 expenses', { exact: true })).toBeVisible();
  await expect(page.getByTestId('receipt-review')).toHaveCount(0);
  await entryCount(page, 3);
  expect(calls).toBe(4);
  await page.goto('/activity');
  await expect(page.getByRole('button', { name: 'Edit Utilities', exact: true })).toBeVisible();
});

test('uncertain batch opens one correction screen and survives navigation', async ({ page }) => {
  const filename =
    'a_very_long_receipt_filename_that_must_wrap_inside_the_phone_card_without_peeping_out.png';
  await page.route('**/v1/receipts/scan', (route) =>
    route.fulfill({ json: { ...receipt, date: '2099-01-01', notes: 'Review printed date.' } }),
  );
  await upload(page, [image(filename), image('second.png')]);
  await expect(page.getByTestId('receipt-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Add expenses (0)', exact: true })).toBeDisabled();
  await entryCount(page, 0);
  await page.getByRole('button', { name: 'Close receipt details', exact: true }).click();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name: 'Fix details (2)', exact: true }).click();
  await page.getByLabel(`${filename} date`, { exact: true }).fill('2026-10-01');
  await page.getByLabel('second.png date', { exact: true }).fill('2026-10-02');
  await expect(page.getByRole('button', { name: 'Add expenses (2)', exact: true })).toBeEnabled();
  for (const row of await page.getByTestId('receipt-row').all()) {
    await row.scrollIntoViewIfNeeded();
    expect(await textProblems(page)).toEqual([]);
  }
  await page.getByRole('button', { name: 'Add expenses (2)', exact: true }).click();
  await entryCount(page, 2);
  await expect(page.getByTestId('receipt-review')).toHaveCount(0);
});

test('receipt selection enforces the batch limit before any API call', async ({ page }) => {
  let calls = 0;
  await page.route('**/v1/receipts/scan', (route) => {
    calls++;
    return route.abort();
  });
  await upload(
    page,
    Array.from({ length: 21 }, (_, i) => image(`receipt-${i}.png`)),
  );
  await expect(page.getByText('Maximum 20 receipts at a time.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('receipt-row')).toHaveCount(0);
  expect(calls).toBe(0);
});

test('HEIC and HEIF upload automatically with normalized MIME types', async ({ page }) => {
  const mimes: string[] = [];
  const heic = readFileSync(resolve('../../services/api/tests/fixtures/receipt.heic'));
  await page.route('**/v1/receipts/scan', (route) => {
    const body = route.request().postDataJSON();
    mimes.push(body.mime);
    expect(Buffer.from(body.data, 'base64').subarray(0, heic.length)).toEqual(heic);
    expect(body.mode).toBe('bulk');
    return route.fulfill({ json: receipt });
  });
  await upload(page, [
    { name: 'IMG_1234.HEIC', mimeType: 'image/heic', buffer: heic },
    {
      name: 'receipt.heif',
      mimeType: 'application/octet-stream',
      buffer: Buffer.concat([heic, Buffer.from('second-photo')]),
    },
  ]);
  await expect(page.getByText('Added 2 expenses', { exact: true })).toBeVisible();
  expect(mimes.sort()).toEqual(['image/heic', 'image/heif']);
  await entryCount(page, 2);
});

test('missing fields remain blank, support manual FX and add once after correction', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add currency', exact: true }).click();
  await page.getByRole('button', { name: 'Add currency Select', exact: true }).click();
  await page.getByRole('button', { name: 'Select USD', exact: true }).click();
  await page.goto('/tools');

  await page.route('**/v1/receipts/scan', (route) =>
    route.fulfill({
      json: {
        ...receipt,
        amount: 0,
        currency: '',
        date: '',
        notes: 'Review total, currency, date.',
      },
    }),
  );
  await upload(page, [image('incomplete.png')]);
  await expect(page.getByLabel('incomplete.png amount', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('incomplete.png date', { exact: true })).toHaveValue('');
  await page.getByLabel('incomplete.png amount', { exact: true }).fill('5.00');
  await page.getByLabel('incomplete.png date', { exact: true }).fill('2026-11-08');
  await page.getByRole('button', { name: 'incomplete.png currency Select', exact: true }).click();
  await page.getByRole('button', { name: 'Select USD', exact: true }).click();
  await page.getByLabel('incomplete.png exchange rate', { exact: true }).fill('1.35');
  await page.getByRole('button', { name: 'Add expenses (1)', exact: true }).click();
  await entryCount(page, 1);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('pocket-budget.v2.test-user')!).entries[0],
  );
  expect(saved.amount).toBe(675);
  expect(saved.original.currency).toBe('USD');
  expect(saved.original.amount).toBe(500);
});

test('uncertain fields remain usable on a short narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.route('**/v1/receipts/scan', (route) =>
    route.fulfill({ json: { ...receipt, date: '', notes: 'Review date.' } }),
  );
  await upload(page, [image('small.png')]);
  await page.getByLabel('small.png date', { exact: true }).fill('2026-10-01');
  expect(await textProblems(page)).toEqual([]);
  const button = page.getByRole('button', { name: 'Add expenses (1)', exact: true });
  await expect(button).toBeInViewport();
  await button.click();
  await entryCount(page, 1);
});

test('Plan includes budget controls and goals; old goal URL redirects', async ({ page }) => {
  await page.goto('/goals');
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole('heading', { name: 'Plan & goals', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New plan', exact: true })).toBeVisible();
  await expect(page.getByText('Monthly take-home income', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Savings goals', exact: true })).toHaveCount(0);
});
