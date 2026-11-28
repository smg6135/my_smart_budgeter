import { expect, test } from './fixtures';
import { newEntry, select } from './helpers';

test('category bubbles add, persist, feed entry choices and preserve history after removal', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByLabel('New category', { exact: true }).fill('Pets');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove category Pets', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Remove category Pets', exact: true }),
  ).toBeVisible();
  await newEntry(page);
  await page.getByLabel('Amount', { exact: true }).fill('12');
  await select(page, 'Category', 'Other', 'Pets');
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Remove category Pets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove category Pets', exact: true })).toHaveCount(
    0,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('pocket-budget.local.v1')!).entries[0].category,
      ),
    )
    .toBe('Pets');
  await newEntry(page);
  await page.getByRole('button', { name: 'Category Other', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select Pets', exact: true })).toHaveCount(0);
});

test('category bubbles reject duplicates and retain at least one category on narrow screens', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByLabel('New category', { exact: true }).fill(' groceries ');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await expect(page.getByRole('alert').filter({hasText:'already exists'})).toBeVisible();
  const buttons = page.getByRole('button', { name: /^Remove category / });
  while ((await buttons.count()) > 1) await buttons.first().click();
  await buttons.first().click();
  await expect(page.getByRole('alert').filter({hasText:'between 1 and 24'})).toBeVisible();
  await expect(buttons).toHaveCount(1);
});
