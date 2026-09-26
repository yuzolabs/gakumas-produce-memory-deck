import { expect, test } from '@playwright/test';

test('initial page loads one subset font and preserves the heading typeface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '所持カード一覧', exact: true })).toBeVisible();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      ready: document.fonts.check('700 23px "Zen Maru Gothic"'),
      resources: performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => /\.woff2?$/.test(name)),
    };
  });
  expect(fonts.ready).toBe(true);
  expect(fonts.resources).toHaveLength(1);
  expect(fonts.resources[0]).toContain('heading-font-');
});
