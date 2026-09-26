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

test('mobile controls and important labels stay readable without horizontal overflow', async ({
  page,
}) => {
  for (const width of [320, 390, 600]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/', '/memories/new?card=card-295', '/settings']) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      const sizes = await page.evaluate(() => ({
        viewport: window.innerWidth,
        content: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll('input, select')]
          .filter((element) => element.checkVisibility())
          .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        bonusLabels: [...document.querySelectorAll('.bonus-column .field label')].map((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      }));
      expect(sizes.content, `${width}px ${path}`).toBeLessThanOrEqual(sizes.viewport);
      expect(sizes.controls.length).toBeGreaterThan(0);
      expect(sizes.controls.every((size) => size >= 16)).toBe(true);
      expect(sizes.bonusLabels.every((size) => size >= 14)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/memories/new');
  await page.getByRole('combobox', { name: 'カード名で検索' }).fill('スポット');
  const cardName = page.getByRole('option').first().locator('strong');
  await expect(cardName).toBeVisible();
  expect(
    await cardName.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(14);
});

test('a failed route download offers a full-page recovery link', async ({ page }) => {
  await page.route('**/assets/memory-settings-*.js', (route) => route.abort());
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '画面を表示できません' })).toBeVisible();
  await page.unroute('**/assets/memory-settings-*.js');
  await page.getByRole('link', { name: '一覧を再読み込み' }).click();
  await expect(page.getByRole('heading', { name: '所持カード一覧', exact: true })).toBeVisible();
});
