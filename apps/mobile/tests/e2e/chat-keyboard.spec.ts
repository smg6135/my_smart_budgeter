import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { demoState } from '../../src/finance';
import { textProblems } from './layout-helpers';

// React Native's onLayout/content-size callbacks follow browser resize/font events.
// Compare positions only once several consecutive frames agree, rather than a stale frame.
async function settleChatLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    let previous = '',
      stable = 0;
    for (let frame = 0; frame < 120; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const elements = ['chat-composer', 'bottom-navigation'].map((id) =>
        document.querySelector(`[data-testid="${id}"]`),
      );
      if (elements.some((element) => !element)) {
        stable = 0;
        continue;
      }
      const current = elements
        .map((element) => {
          const box = element!.getBoundingClientRect();
          return [box.x, box.y, box.width, box.height]
            .map((value) => Math.round(value * 10))
            .join(',');
        })
        .join('|');
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (stable >= 4) return;
    }
    throw new Error('Chat layout did not settle after resizing.');
  });
}

test('chat composer stays visible while the viewport shrinks and history scrolls', async ({
  page,
}) => {
  const sample = demoState();
  sample.messages = Array.from({ length: 16 }, (_, index) => ({
    role: index % 2 ? ('assistant' as const) : ('user' as const),
    content:
      `Message ${index + 1}: ` + 'A long conversation about a budget and savings. '.repeat(8),
  }));
  await page.addInitScript(
    (state) => localStorage.setItem('pocket-budget.v2.test-user', JSON.stringify(state)),
    sample,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/planner');
  await page.bringToFront();
  const input = page.getByLabel('Message your planner');
  await expect(input).toBeVisible();
  await settleChatLayout(page);
  await input.click();
  await expect(input).toBeFocused();
  const draft = Array.from({ length: 10 }, (_, i) => `Draft line ${i + 1}`).join('\n');
  await input.fill(draft);
  for (const height of [844, 480, 360, 844]) {
    await page.setViewportSize({ width: 390, height });
    await settleChatLayout(page);
    await expect(input).toHaveValue(draft);
    const composer = page.getByTestId('chat-composer');
    const footer = page.getByTestId('bottom-navigation');
    await expect
      .poll(async () => {
        const [box, bottom] = await Promise.all([composer.boundingBox(), footer.boundingBox()]);
        return !!box && !!bottom && box.y >= 0 && box.y + box.height <= bottom.y + 1;
      })
      .toBe(true);
    const before = await composer.boundingBox();
    await input.click();
    await expect(input).toBeFocused();
    await page.getByTestId('page-scroll').evaluate((element) => {
      element.scrollTop = 0;
    });
    // Allow the scroll-end handler to run; it must not blur the composer.
    await page.waitForTimeout(160);
    await expect(input).toBeFocused();
    expect((await composer.boundingBox())!.y).toBeCloseTo(before!.y, 0);
    const [field, send] = await Promise.all([
      input.boundingBox(),
      page.getByRole('button', { name: 'Send', exact: true }).boundingBox(),
    ]);
    expect(field!.y).toBeGreaterThanOrEqual(0);
    expect(field!.y + field!.height).toBeLessThanOrEqual(height);
    expect(send!.y + send!.height).toBeLessThanOrEqual(height);
    expect(await textProblems(page)).toEqual([]);
  }
});

test('a long AI proposal cannot push the composer below the visible screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.route('**/v1/planner/chat', (route) =>
    route.fulfill({
      json: {
        message:
          'Here is your plan.\n' + 'This is a long reply with detailed estimates. '.repeat(30),
        proposal: {
          title: 'Travel budget',
          amount: 1200,
          deadline: '2028-12-01',
          emoji: '✈️',
          breakdown: Array.from({ length: 12 }, (_, i) => `Item ${i + 1}: SGD 100`),
        },
        sources: [{ title: 'Travel costs', url: 'https://example.com/travel' }],
      },
    }),
  );
  await page.goto('/planner');
  await page.bringToFront();
  const input = page.getByLabel('Message your planner');
  await expect(input).toBeVisible();
  await settleChatLayout(page);
  await input.click();
  await expect(input).toBeFocused();
  await input.fill('Plan a trip');
  await expect(input).toHaveValue('Plan a trip');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(input).toHaveValue('');
  await page.getByRole('button', { name: 'Review & add savings goal' }).scrollIntoViewIfNeeded();
  await input.fill('I can still write a follow-up.');
  await expect(input).toHaveValue('I can still write a follow-up.');
  await settleChatLayout(page);
  const [composer, footer] = await Promise.all([
    page.getByTestId('chat-composer').boundingBox(),
    page.getByTestId('bottom-navigation').boundingBox(),
  ]);
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(footer!.y + 1);
  expect(await textProblems(page)).toEqual([]);
});
