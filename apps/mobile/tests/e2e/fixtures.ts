import { test as base, expect } from '@playwright/test';
// Browser tests use local storage and mock public FX responses.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/v2/exchange-rates?**', (route) =>
      route.fulfill({ status: 503, json: { detail: 'Rates offline in test' } }),
    );
    await use(page);
  },
});
export { expect };
