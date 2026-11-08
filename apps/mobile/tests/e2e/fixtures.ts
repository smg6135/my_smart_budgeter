import { test as base, expect } from '@playwright/test';
// These browser tests mock API responses. API identity checks have separate coverage.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'pocket-auth-session.v1',
        JSON.stringify({
          uid: 'test-user',
          email: 'test@example.com',
          idToken: 'customer-test-token',
          refreshToken: 'fake-refresh-token',
          expiresAt: Date.now() + 3600000,
        }),
      );
    });
    await page.route('**/v1/fx/rates?**', (route) =>
      route.fulfill({ status: 503, json: { detail: 'Rates offline in test' } }),
    );
    await use(page);
  },
});
export { expect };
