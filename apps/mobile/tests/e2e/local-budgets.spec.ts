import { test, expect } from '@playwright/test';
import { initialState } from '../../src/finance';
test('old device budgets remain separate and selectable without cloud auth', async ({ page }) => {
  const keys = ['pocket-budget.local.v1', 'pocket-budget.v2.old%2Fone', 'pocket-budget.v2.two'];
  await page.addInitScript(
    ({ keys, state }) => {
      if (localStorage.getItem('seeded')) return;
      keys.forEach((key, i) =>
        localStorage.setItem(key, JSON.stringify({ ...state, income: (i + 1) * 100000 })),
      );
      sessionStorage.setItem(
        'pocket-auth-session.v1',
        JSON.stringify({
          uid: 'old/one',
          idToken: 'expired',
          refreshToken: 'obsolete',
          expiresAt: 0,
        }),
      );
      localStorage.setItem('seeded', '1');
    },
    { keys, state: initialState },
  );
  const external: string[] = [];
  await page.route('https://**', (route) => {
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Saved budget 1', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => sessionStorage.getItem('pocket-auth-session.v1'))).toBeNull();
  await expect(page.getByRole('button', { name: /Sign in|Sign out|Google/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Local budget', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pocket-budget.selected.v1')))
    .toBe(keys[0]);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Local budget', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Saved budget 2', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pocket-budget.selected.v1')))
    .toBe(keys[2]);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Saved budget 2', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Saved budget 2', exact: true })).toBeDisabled();
  expect(
    await page.evaluate(
      (keys) => keys.map((key) => JSON.parse(localStorage.getItem(key)!).income),
      keys,
    ),
  ).toEqual([100000, 200000, 300000]);
  expect(
    external.every((url) => url.startsWith('https://api.coinbase.com/v2/exchange-rates?')),
  ).toBe(true);
});
test('fresh budget saves offline without credentials', async ({ page }) => {
  await page.route('https://**', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Set budget' }).click();
  await page.getByLabel('Monthly take-home income').fill('1500');
  await page.getByRole('button', { name: 'Save budget plan' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pocket-budget.local.v1') || 'null')?.income,
      ),
    )
    .toBe(150000);
  await page.reload();
  await expect(page.getByTestId('overview-statistics')).toBeVisible();
});
test('corrupt budget is not overwritten', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pocket-budget.v2.corrupt', '{broken'));
  await page.goto('/');
  await expect(page.getByText('Your local data is preserved')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pocket-budget.v2.corrupt'))).toBe(
    '{broken',
  );
});
