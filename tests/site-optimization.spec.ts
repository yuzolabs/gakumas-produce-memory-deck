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

test('editor and backup code load only when their screens are opened', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '所持カード一覧', exact: true })).toBeVisible();
  expect(scripts.some((url) => /memory-(editor|settings)-.*\.js/.test(url))).toBe(false);

  let releaseEditor!: () => void;
  const editorReady = new Promise<void>((resolve) => {
    releaseEditor = resolve;
  });
  await page.route('**/assets/memory-editor-*.js', async (route) => {
    await editorReady;
    await route.continue();
  });
  try {
    await page
      .getByRole('navigation', { name: 'メインナビゲーション' })
      .getByRole('link', { name: '登録', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText('画面を読み込んでいます…');
    await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible();
  } finally {
    releaseEditor();
  }
  await expect(page.getByRole('heading', { name: 'メモリーを登録', exact: true })).toBeVisible();
  expect(scripts.some((url) => /memory-settings-.*\.js/.test(url))).toBe(false);
  await page
    .getByRole('navigation', { name: 'メインナビゲーション' })
    .getByRole('link', { name: 'バックアップ', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'バックアップ', exact: true })).toBeVisible();
  expect(scripts.some((url) => /memory-settings-.*\.js/.test(url))).toBe(true);
});

for (const [path, heading] of [
  ['/memories/new', 'メモリーを登録'],
  ['/settings', 'バックアップ'],
] as const) {
  test(`lazy screen supports direct access and reload: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  });
}

test('a failed route download offers a full-page recovery link', async ({ page }) => {
  await page.route('**/assets/memory-settings-*.js', (route) => route.abort());
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '画面を表示できません' })).toBeVisible();
  await page.unroute('**/assets/memory-settings-*.js');
  await page.getByRole('link', { name: '一覧を再読み込み' }).click();
  await expect(page.getByRole('heading', { name: '所持カード一覧', exact: true })).toBeVisible();
});
