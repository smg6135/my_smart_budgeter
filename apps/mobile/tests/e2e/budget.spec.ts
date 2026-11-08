import { Page } from '@playwright/test';
import { expect, test } from './fixtures';
async function navigate(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading').first()).toBeVisible();
}
async function plan(page: Page) {
  await navigate(page, '/');
  await page.getByRole('button', { name: 'Set budget' }).click();
  await page.getByLabel('Monthly take-home income').fill('5000');
  await page.getByLabel('Savings percentage (0–100)').fill('30');
  await page.getByRole('button', { name: 'Save budget plan' }).click();
}
test('budget, bill payment, transaction CRUD, savings and persistence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await plan(page);
  await navigate(page, '/plan');
  await page.getByRole('button', { name: 'Add outgoing', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Home rent');
  await page.getByLabel('Amount', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Save outgoing' }).click();
  await page.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.getByText('Paid this month', { exact: true })).toBeVisible();
  await navigate(page, '/');
  await expect(page.getByText('$2,800.00', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Coffee');
  await page.getByLabel('Amount', { exact: true }).fill('5.50');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('$2,794.50', { exact: true })).toBeVisible();
  await navigate(page, '/activity');
  await page.getByRole('button', { name: 'Edit Coffee', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('6.50');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('−$6.50', { exact: true })).toBeVisible();
  await navigate(page, '/goals');
  await page.getByRole('button', { name: 'New savings goal' }).click();
  await page.getByLabel('Name', { exact: true }).fill('A good trip');
  await page.getByLabel('Target amount').fill('1200');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await page.getByRole('button', { name: 'Add savings', exact: true }).click();
  await page.getByLabel('Amount', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('$100.00', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('A good trip', { exact: true })).toBeVisible();
  await expect(page.getByText('$100.00', { exact: true })).toBeVisible();
  await navigate(page, '/activity');
  await page.getByRole('button', { name: 'Delete Coffee', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Coffee', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  if (test.info().project.name === 'mobile') {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    for (const name of ['Overview', 'Activity', 'Plan', 'AI planner', 'Tools']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect((box?.y || 0) + (box?.height || 0)).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
    await page.getByRole('button', { name: 'Tools', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tools' })).toBeVisible();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByText('Home rent', { exact: true })).toBeVisible();
  }
});
test('validates money input and displays verified-email requirement', async ({ page }) => {
  await plan(page);
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Bad amount');
  await page.getByLabel('Amount', { exact: true }).fill('-5');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('Enter an amount with up to 2 decimal places.')).toBeVisible();
  await page.getByRole('button', { name: 'Close form' }).click();
  await page.route('**/v1/planner/chat', (route) =>
    route.fulfill({ status: 403, json: { detail: 'Verify your email before using AI.' } }),
  );
  await navigate(page, '/planner');
  await page.getByLabel('Message your planner').fill('A TV');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Verify your email before using AI.')).toBeVisible();
});
test('AI gateway conversation, source links, and reviewable goal', async ({ page }) => {
  await navigate(page, '/settings');
  await page.route('**/v1/planner/chat', async (route) => {
    expect(route.request().headers()['authorization']).toBe('Bearer customer-test-token');
    expect(route.request().headers()).not.toHaveProperty('x-openai-key');
    const body = route.request().postDataJSON();
    expect(body.messages.at(-1).content).toBe('A TV for 1200 in six months');
    expect(body).not.toHaveProperty('entries');
    await route.fulfill({
      json: {
        message: 'Here is an estimated plan for your TV.',
        proposal: {
          title: 'Living room TV',
          amount: 1200,
          deadline: '2028-12-01',
          emoji: '📺',
          breakdown: ['TV: SGD 1100', 'Delivery: SGD 100'],
        },
        sources: [{ title: 'Official retailer', url: 'https://example.com/tv' }],
      },
    });
  });
  await navigate(page, '/planner');
  await page.getByLabel('Message your planner').fill('A TV for 1200 in six months');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Here is an estimated plan for your TV.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Official retailer ↗' })).toBeVisible();
  await page.getByRole('button', { name: 'Review & add savings goal' }).click();
  await expect(page.getByLabel('Target amount')).toHaveValue('1200.00');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await navigate(page, '/goals');
  await expect(page.getByText('Living room TV', { exact: true })).toBeVisible();
  const local = await page.evaluate(() => JSON.stringify(localStorage));
  expect(local).not.toContain('sk-test-key-not-real');
});
test('receipt upload is reviewed before being saved', async ({ page }) => {
  await navigate(page, '/settings');
  await page.route('**/v1/receipts/scan', async (route) => {
    expect(route.request().postDataJSON().mime).toBe('image/png');
    await route.fulfill({
      json: {
        merchant: 'Little Cafe',
        amount: 12.5,
        currency: 'SGD',
        date: '2026-01-10',
        category: 'Food & drinks',
        notes: 'Please check the printed date.',
      },
    });
  });
  await navigate(page, '/tools');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload receipts' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Process receipts (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Review receipt.png', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Little Cafe');
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('12.50');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await navigate(page, '/activity');
  await expect(page.getByRole('button', { name: 'Edit Little Cafe', exact: true })).toBeVisible();
});
