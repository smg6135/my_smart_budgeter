import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:8081', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'safari', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
  webServer: {
    command: 'npx expo start --web --port 8081',
    env: {
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-pocket',
      EXPO_PUBLIC_FIREBASE_API_KEY: 'fake-emulator-api-key',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'test-oauth-client.apps.googleusercontent.com',
    },
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
