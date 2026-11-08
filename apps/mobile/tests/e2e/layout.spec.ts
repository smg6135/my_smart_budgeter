import { expect, test } from './fixtures';
import { demoState } from '../../src/finance';
const paths = ['/', '/activity', '/plan', '/planner', '/tools', '/settings'];
import { textProblems } from './layout-helpers';
test('all screens fit narrow widths with long labels and large amounts', async ({ page }) => {
  test.setTimeout(180000);
  const sample = demoState();
  sample.income = 12345678900;
  sample.entries[0].title =
    'A very long restaurant name from an overseas evening with friends and family';
  sample.entries[0].amount = 12345678;
  sample.goals[0].title =
    'A long-awaited family holiday with a deliberately descriptive savings goal name';
  sample.goals[0].target = 12345678900;
  await page.addInitScript(
    (state) => localStorage.setItem('pocket-budget.v2.test-user', JSON.stringify(state)),
    sample,
  );
  await page.route('**/v1/fx/rates?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Offline layout test' } }),
  );
  const widths = test.info().project.use.isMobile ? [320, 360, 390, 430, 768] : [900, 1100, 1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      const scroll = page.getByTestId('page-scroll');
      const distance = await scroll.evaluate((e) => e.scrollHeight - e.clientHeight);
      for (const offset of [0, distance / 2, distance]) {
        await scroll.evaluate((e, y) => {
          e.scrollTop = y;
        }, offset);
        expect(await textProblems(page), `${path} at ${width}px / scroll ${offset}`).toEqual([]);
      }
    }
  }
});
test('long form titles, buttons and currency controls remain usable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/goals');
  await page.getByRole('button', { name: 'New savings goal' }).click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('A long name for a savings goal that needs to wrap safely');
  await page.getByLabel('Target amount').fill('123456789.12');
  expect(await textProblems(page)).toEqual([]);
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(
    page.getByText('A long name for a savings goal that needs to wrap safely', { exact: true }),
  ).toBeVisible();
});

test('larger text reflows without colliding at phone width', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 900 });
  const sample = demoState();
  await page.addInitScript(
    (state) => localStorage.setItem('pocket-budget.v2.test-user', JSON.stringify(state)),
    sample,
  );
  await page.route('**/v1/fx/rates?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Offline layout test' } }),
  );
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.evaluate(() => {
      for (const el of document.querySelectorAll<HTMLElement>('[dir="auto"],input,textarea')) {
        const style = getComputedStyle(el),
          size = parseFloat(style.fontSize),
          line = parseFloat(style.lineHeight);
        el.style.fontSize = size * 1.5 + 'px';
        if (Number.isFinite(line)) el.style.lineHeight = line * 1.5 + 'px';
      }
    });
    const scroll = page.getByTestId('page-scroll'),
      distance = await scroll.evaluate((e) => e.scrollHeight - e.clientHeight);
    for (const y of [0, distance / 2, distance]) {
      await scroll.evaluate((e, v) => {
        e.scrollTop = v;
      }, y);
      expect(await textProblems(page), path + ' with larger text').toEqual([]);
    }
  }
});

test('forms stay inside the viewport at keyboard-sized heights', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/plan');
  await page.getByRole('button', { name: 'New savings goal', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close form', exact: true })).toBeVisible();
  await page
    .getByLabel('Name', { exact: true })
    .fill('A very long goal name to verify the short phone viewport');
  await page.getByLabel('Target amount', { exact: true }).fill('1500');
  await page.getByRole('button', { name: 'Save goal', exact: true }).scrollIntoViewIfNeeded();
  expect(await textProblems(page)).toEqual([]);
  await page.getByRole('button', { name: 'Save goal', exact: true }).click();
  await expect(
    page.getByText('A very long goal name to verify the short phone viewport', { exact: true }),
  ).toBeVisible();
});
