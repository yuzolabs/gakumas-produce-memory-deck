import { expect, test } from '@playwright/test';

test('staging serves the expected deployment, SPA routes and bundled images', async ({
  page,
  request,
}) => {
  await expect(async () => {
    const response = await request.get(`/deployment.json?commit=${process.env.EXPECTED_COMMIT}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    expect(await response.json()).toEqual({
      commit: process.env.EXPECTED_COMMIT,
      version: process.env.BETA_TAG,
    });
  }).toPass({ timeout: 60_000 });

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const home = await page.goto('/');
  expect(home?.headers()['x-robots-tag']).toContain('noindex');
  await expect(page.getByLabel('カード名で検索')).toBeVisible();

  await page.goto('/memories/new?card=card-295');
  await expect(page.getByRole('button', { name: '内容を確認して保存', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('カード名で検索')).toHaveValue('スポットライト+');
  const image = await request.get('/skill-card-icons/card-295.webp');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/webp');
  expect((await image.body()).length).toBeGreaterThan(0);
  await expect(page.locator('img').first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);

  // All writes are in this test browser's IndexedDB, not shared server data.
  await page.getByRole('button', { name: '内容を確認して保存', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '保存する', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: '編集', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('カード名で検索')).toHaveValue('スポットライト+');

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'JSONをダウンロード' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
