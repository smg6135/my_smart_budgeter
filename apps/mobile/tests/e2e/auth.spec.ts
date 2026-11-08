import { test, expect } from '@playwright/test';
test('sign-in errors, password login and account isolation', async ({ page }) => {
  await page.route('**/v1/fx/rates?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Offline' } }),
  );
  let reject = true;
  await page.route(
    '**/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?**',
    (route) => {
      const { email, password } = route.request().postDataJSON();
      expect(password).toBe('password123');
      return route.fulfill(
        reject
          ? { status: 400, json: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } }
          : {
              json: {
                localId: email === 'one@example.com' ? 'account-one' : 'account-two',
                email,
                idToken: 'signed-in-token',
                refreshToken: 'refresh',
                expiresIn: '3600',
              },
            },
      );
    },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set budget' })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill('one@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-in failed');
  reject = false;
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Set budget' }).click();
  await page.getByLabel('Monthly take-home income').fill('3456');
  await page.getByRole('button', { name: 'Save budget plan' }).click();
  await page.goto('/settings');
  await expect(page.getByText('one@example.com', { exact: true })).toBeVisible();
  await expect(page.getByLabel('OpenAI API key')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('two@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
  await expect(page.getByLabel('Monthly take-home income')).toHaveValue('0');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('pocket-budget.v2.account-one')!).income),
    )
    .toBe(345600);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('signed-in-token');
});

test('expired session refresh uses bearer token and approved AI alias', async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'pocket-auth-session.v1',
      JSON.stringify({
        uid: 'refresh-user',
        email: 'refresh@example.com',
        idToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: 0,
      }),
    ),
  );
  await page.route('**/securetoken.googleapis.com/v1/token?**', (route) =>
    route.fulfill({
      json: { id_token: 'fresh-token', refresh_token: 'rotated-refresh', expires_in: '3600' },
    }),
  );
  await page.route('**/v1/fx/rates?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Offline' } }),
  );
  await page.route('**/v1/planner/chat', (route) => {
    expect(route.request().headers()['authorization']).toBe('Bearer fresh-token');
    const body = route.request().postDataJSON();
    expect(body.mode).toBe('planning');
    expect(body).not.toHaveProperty('model');
    return route.fulfill({ json: { message: 'Choose a date.', proposal: null, sources: [] } });
  });
  await page.goto('/planner');
  await page.getByLabel('Message your planner').fill('Plan a holiday');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Choose a date.', { exact: true })).toBeVisible();
});

test('signed-out form fits a 320px phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('Google popup credential is exchanged for a Firebase session', async ({ page }) => {
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
 window.google={accounts:{oauth2:{initTokenClient:options=>({
 requestAccessToken:()=>options.callback({access_token:'google-access-token'})
 })}}};
 `,
    }),
  );
  await page.route('**/v1/fx/rates?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Offline' } }),
  );
  let attempts = 0;
  await page.route('**/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?**', (route) => {
    const body = route.request().postDataJSON();
    expect(body.postBody).toBe('access_token=google-access-token&providerId=google.com');
    if (++attempts === 1)
      return route.fulfill({ json: { needConfirmation: true, email: 'google@example.com' } });
    return route.fulfill({
      json: {
        localId: 'google-user',
        email: 'google@example.com',
        idToken: 'firebase-token',
        refreshToken: 'firebase-refresh',
        expiresIn: '3600',
      },
    });
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.google)).toBe(true);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-in incomplete');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await page.goto('/settings');
  await expect(page.getByText('google@example.com', { exact: true })).toBeVisible();
});
