import { textProblems } from './layout-helpers';
import { expect, test } from './fixtures';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const image = (name: string) => ({ name, mimeType: 'image/png', buffer: png });
test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await page.goto('/tools');
});
test('batch scans multiple files, isolates failures, retries and saves once', async ({ page }) => {
  let active = 0,
    peak = 0,
    pdfAttempts = 0,
    calls = 0;
  await page.route('**/v1/receipts/scan', async (route) => {
    active++;
    calls++;
    peak = Math.max(peak, active);
    const body = route.request().postDataJSON();
    expect(route.request().headers()['authorization']).toBe('Bearer customer-test-token');
    expect(route.request().headers()).not.toHaveProperty('x-openai-key');
    const isPdf = body.mime === 'application/pdf';
    if (isPdf) pdfAttempts++;
    await new Promise((resolve) => setTimeout(resolve, 100));
    active--;
    if (isPdf && pdfAttempts === 1)
      await route.fulfill({ status: 502, json: { detail: 'Receipt could not be read.' } });
    else
      await route.fulfill({
        json: {
          merchant: isPdf ? 'Utilities' : 'Cafe',
          amount: isPdf ? 40 : 12.5,
          currency: 'SGD',
          date: '2026-10-01',
          category: 'Other',
          notes: '',
        },
      });
  });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload receipts', exact: true }).click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles([
    image(
      'a_very_long_receipt_filename_that_must_wrap_inside_the_phone_card_without_peeping_out.png',
    ),
    image('lunch.png'),
    { name: 'bill.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 bill') },
  ]);
  await expect(page.getByTestId('receipt-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Process receipts (3)', exact: true }).click();
  await expect(page.getByText('3/3 processed', { exact: true })).toBeVisible();
  for (const row of await page.getByTestId('receipt-row').all()) {
    await row.scrollIntoViewIfNeeded();
    expect(await textProblems(page)).toEqual([]);
  }
  await expect(page.getByText('Receipt could not be read.', { exact: true })).toBeVisible();
  expect(peak).toBeLessThanOrEqual(2);
  await expect(page.getByRole('button', { name: 'Save ready (2)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry bill.pdf', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save ready (3)', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save ready (3)', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Save ready (0)', exact: true })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pocket-budget.v2.test-user')!).entries.length,
      ),
    )
    .toBe(3);
  expect(calls).toBe(4);
  await page.goto('/activity');
  await expect(page.getByRole('button', { name: 'Edit Utilities', exact: true })).toBeVisible();
});
test('batch survives navigation and invalid printed dates require review', async ({ page }) => {
  await page.route('**/v1/receipts/scan', (route) =>
    route.fulfill({
      json: {
        merchant: 'Future Cafe',
        amount: 15,
        currency: 'SGD',
        date: '2099-01-01',
        category: 'Food & drinks',
        notes: 'Review printed date.',
      },
    }),
  );
  const promise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload receipts', exact: true }).click();
  await (await promise).setFiles(image('future.png'));
  await page.getByRole('button', { name: 'Process receipts (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review future.png', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await expect(page.getByTestId('receipt-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save ready (1)', exact: true }).click();
  await expect(page.getByText('Review the receipt date.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review future.png', exact: true }).click();
  await page.getByLabel('Date (YYYY-MM-DD)', { exact: true }).fill('2026-10-01');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByTestId('receipt-row')).toContainText('2026-10-01');
  await expect(page.getByTestId('receipt-row')).not.toContainText('2099-01-01');
});
test('receipt selection enforces the batch limit before any API call', async ({ page }) => {
  let calls = 0;
  await page.route('**/v1/receipts/scan', (route) => {
    calls++;
    return route.abort();
  });
  const promise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload receipts', exact: true }).click();
  await (await promise).setFiles(Array.from({ length: 21 }, (_, i) => image(`receipt-${i}.png`)));
  await expect(
    page.getByText('Maximum 20 receipts. Clear saved files first.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('receipt-row')).toHaveCount(0);
  expect(calls).toBe(0);
});
test('Plan includes budget controls and goals; old goal URL redirects', async ({ page }) => {
  await page.goto('/goals');
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole('heading', { name: 'Plan & goals', exact: true })).toBeVisible();
  await expect(page.getByText('Monthly take-home income', { exact: true })).toBeVisible();
  await expect(page.getByText('Savings goals', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Savings goals', exact: true })).toHaveCount(0);
});
