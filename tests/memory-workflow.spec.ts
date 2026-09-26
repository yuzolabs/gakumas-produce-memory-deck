import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

async function enterScreenshotMemory(page: Page) {
  await page.goto('/memories/new?card=card-295');
  await page.getByLabel('取得タイミング', { exact: true }).selectOption('after-first-exam');
  await page.getByRole('button', { name: '好調+を増やす', exact: true }).click();
  await page.getByRole('button', { name: '好調+を増やす', exact: true }).click();
  await page.getByLabel('HIFの発動対象カード').selectOption('hif-card-288');
  await page.getByLabel('Vo 初期ステータス加算', { exact: true }).selectOption('15');
  await page.getByLabel('Da 初期ステータス加算', { exact: true }).selectOption('20');
  await page.getByLabel('Vi 初期ステータス加算', { exact: true }).selectOption('15');
}
async function confirmSave(page: Page) {
  await page.getByRole('button', { name: '内容を確認して保存', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '保存する', exact: true })
    .click();
  await expect(page).toHaveURL('/');
}
async function ownedSpotlight(page: Page) {
  await page.getByLabel('カード名で検索').fill('スポットライト+');
  return page.getByRole('article', { name: 'スポットライト+', exact: true });
}
async function downloadBackup(page: Page) {
  await page.goto('/settings');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSONをダウンロード' }).click();
  const download = await downloaded;
  const text = await readFile((await download.path())!, 'utf8');
  await expect(page.getByRole('status')).toContainText('JSONを出力しました');
  return text;
}

test('HIF target selection assigns its fixed effect without a separate effect selector', async ({
  page,
}) => {
  await page.goto('/memories/new?card=card-295');
  const target = page.getByLabel('HIFの発動対象カード');
  await target.selectOption('hif-card-288');
  await expect(page.getByLabel('HIFの効果・回数')).toHaveCount(0);
  await expect(page.getByLabel('入力内容のプレビュー')).toContainText('試験ごと1回');
  await confirmSave(page);
  const group = await ownedSpotlight(page);
  await group.getByRole('link', { name: '編集', exact: true }).click();
  await page.reload();
  await expect(target).toHaveValue('hif-card-288');
  await expect(page.getByLabel('HIFの効果・回数')).toHaveCount(0);
  const backup = JSON.parse(await downloadBackup(page));
  expect(backup.memories[0].hif).toEqual({ abilityId: 'hif-card-288', valueId: 'standard' });
  await page.goto(`/memories/${backup.memories[0].id}/edit`);
  await target.selectOption('');
  await expect(page.getByLabel('HIFの効果・回数')).toHaveCount(0);
  await confirmSave(page);
  const cleared = JSON.parse(await downloadBackup(page));
  expect(cleared.memories[0].hif).toBeNull();
});

test('customization +/- controls enforce limits and persist zero as no customization', async ({
  page,
}) => {
  await page.goto('/memories/new?card=card-295');
  const goodUp = page.getByRole('button', { name: '好調+を増やす', exact: true });
  const goodDown = page.getByRole('button', { name: '好調+を減らす', exact: true });
  const goodValue = page.getByLabel('好調+の段階', { exact: true });
  const scoreUp = page.getByRole('button', { name: 'パラメータ追加を増やす', exact: true });
  const scoreDown = page.getByRole('button', { name: 'パラメータ追加を減らす', exact: true });
  await expect(page.getByRole('combobox', { name: '好調+', exact: true })).toHaveCount(0);
  await expect(goodValue).toHaveText('0');
  await expect(goodDown).toBeDisabled();
  await scoreUp.click();
  await expect(scoreUp).toBeDisabled();
  await expect(goodUp).toBeEnabled();
  await goodUp.click();
  await expect(goodValue).toHaveText('1');
  await expect(goodUp).toBeDisabled();
  await expect(page.getByRole('button', { name: '元気+を増やす', exact: true })).toBeDisabled();
  await scoreDown.click();
  await expect(page.getByLabel('パラメータ追加の段階')).toHaveText('0');
  await expect(goodUp).toBeEnabled();
  await goodDown.click();
  await expect(goodDown).toBeDisabled();
  await goodUp.focus();
  await page.keyboard.press('Enter');
  await expect(goodValue).toHaveText('1');
  await page.keyboard.press('Space');
  await expect(goodValue).toHaveText('2');
  await expect(goodUp).toBeDisabled();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByLabel('入力内容のプレビュー')).toContainText('好調+ 2段階');
  await confirmSave(page);
  const group = await ownedSpotlight(page);
  await group.getByRole('link', { name: '編集', exact: true }).click();
  await expect(goodValue).toHaveText('2');
  await page.reload();
  await expect(goodValue).toHaveText('2');
  await goodDown.click();
  await goodDown.click();
  await expect(goodValue).toHaveText('0');
  await expect(goodDown).toBeDisabled();
  await confirmSave(page);
  const backup = JSON.parse(await downloadBackup(page));
  expect(backup.memories[0].customizations).toEqual([]);
  await page.goto('/memories/new?card=card-294');
  await expect(page.getByText('このカードには選択可能なカスタムがありません。')).toBeVisible();
  await expect(page.locator('.customization-stepper')).toHaveCount(0);
});

test('card search lists matches inline and supports pointer and keyboard selection', async ({
  page,
}, testInfo) => {
  await page.goto('/memories/new');
  const search = page.getByRole('combobox', { name: 'カード名で検索' });
  const results = page.getByRole('listbox', { name: 'カード名の検索結果' });
  await expect(page.getByLabel('スキルカード', { exact: true })).toHaveCount(0);
  await expect(results).toHaveCount(0);
  await search.fill('   ');
  await expect(results).toHaveCount(0);
  await search.fill('存在しないカード名');
  await expect(
    page.getByText('一致するカードがありません。カード名を変えて検索してください。'),
  ).toBeVisible();
  await expect(results).toHaveCount(0);
  await search.fill(' ｽﾎﾟｯﾄﾗｲﾄ ');
  await expect(results.getByRole('option')).toHaveCount(2);
  await expect(results).not.toContainText('ひと呼吸');
  const choice = results.getByRole('option', { name: /^スポットライト\+ / });
  if (testInfo.project.name === 'mobile') await choice.tap();
  else await choice.click();
  await expect(search).toHaveValue('スポットライト+');
  await expect(results).toHaveCount(0);
  await expect(page.locator('.skill-search-selection')).toHaveText('選択中：スポットライト+');
  await search.fill('ひと呼吸');
  await expect(results.getByRole('option')).toHaveCount(2);
  await expect(results).not.toContainText('スポットライト');
  await search.press('Enter');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.skill-search-selection')).toHaveText('選択中：スポットライト+');
  await search.press('ArrowDown');
  await search.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(page.locator('.skill-search-selection')).toHaveText('選択中：スポットライト+');
  await search.press('Escape');
  await expect(results).toHaveCount(0);
  await search.press('ArrowDown');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(search).toHaveValue('ひと呼吸+');
  await expect(page.locator('.skill-search-selection')).toHaveText('選択中：ひと呼吸+');
  await expect(results).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await confirmSave(page);
  await expect(page.getByRole('article', { name: 'ひと呼吸+', exact: true })).toBeVisible();
});

test('cancelling a search selection preserves the card and its customizations', async ({
  page,
}) => {
  await enterScreenshotMemory(page);
  const search = page.getByRole('combobox', { name: 'カード名で検索' });
  await search.fill('ひと呼吸');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('option', { name: /^ひと呼吸\+ / }).click();
  await expect(page.locator('.skill-search-selection')).toHaveText('選択中：スポットライト+');
  await expect(page.getByLabel('好調+の段階', { exact: true })).toHaveText('2');
  await expect(page.getByLabel('HIFの発動対象カード')).toHaveValue('hif-card-288');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('option', { name: /^ひと呼吸\+ / }).click();
  await expect(page.locator('.skill-search-selection')).toHaveText('選択中：ひと呼吸+');
  await expect(page.getByLabel('HIFの発動対象カード')).toHaveValue('');
  await expect(page.getByLabel('集中+の段階', { exact: true })).toHaveText('0');
});

test('owned-card list stays empty until registration and never shows unowned cards', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '所持カード一覧', exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'まだメモリーが登録されていません' }),
  ).toBeVisible();
  await expect(page.locator('.collection-summary')).toHaveText('登録メモリー 0 枚');
  await expect(page.getByLabel('所持状況')).toHaveCount(0);
  await expect(page.getByText('同じカードでも、違う一枚。条件を並べて比較できます。')).toHaveCount(
    0,
  );
  await expect(page.getByText(/収録カード/)).toHaveCount(0);
  await page.getByRole('link', { name: 'メモリーを登録', exact: true }).first().click();
  await expect(page.getByLabel('スキルカード', { exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'カード名で検索' }).fill('スポットライト');
  await expect(
    page.getByRole('listbox', { name: 'カード名の検索結果' }).getByRole('option'),
  ).toHaveCount(2);
  await enterScreenshotMemory(page);
  await confirmSave(page);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'スポットライト+', exact: true })).toBeVisible();
  await expect(page.locator('.collection-summary')).toHaveText('登録メモリー 1 枚');
  await page.getByLabel('カード名で検索').fill('ひと呼吸');
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '条件に一致する所持カードがありません' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '条件をリセット', exact: true }).first().click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('article').getByRole('button', { name: '削除', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.locator('.collection-summary')).toHaveText('登録メモリー 0 枚');
  await expect(
    page.getByRole('heading', { name: 'まだメモリーが登録されていません' }),
  ).toBeVisible();
});

test('register screenshot, reload, duplicate, edit, filter timing, delete and restore', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enterScreenshotMemory(page);
  await expect(page.getByRole('button', { name: '元気+を増やす', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });
  await confirmSave(page);
  await page.reload();
  let group = await ownedSpotlight(page);
  await expect(group).toContainText('好調+ 2段階');
  await expect(group).toContainText('ひと呼吸使用後');
  await group.getByRole('link', { name: '複製', exact: true }).click();
  await page.getByLabel('取得タイミング', { exact: true }).selectOption('start');
  await confirmSave(page);
  group = await ownedSpotlight(page);
  await group.getByRole('button', { name: /スポットライト\+/ }).click();
  await expect(group.getByRole('link', { name: '編集', exact: true })).toHaveCount(2);
  await page.getByLabel('取得タイミング', { exact: true }).selectOption('start');
  await expect(group).toContainText('条件一致 1枚');
  await group.getByRole('link', { name: '編集', exact: true }).first().click();
  await expect(page.getByLabel('取得タイミング', { exact: true })).toHaveValue('start');
  await page.reload();
  await expect(page.getByLabel('Vo 初期ステータス加算', { exact: true })).toHaveValue('15');
  await page.getByLabel('Vo 初期ステータス加算', { exact: true }).selectOption('25');
  await confirmSave(page);
  group = await ownedSpotlight(page);
  await group.getByRole('button', { name: /スポットライト\+/ }).click();
  await page.screenshot({ path: testInfo.outputPath('comparison.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const backupText = await downloadBackup(page);
  const backup = JSON.parse(backupText);
  expect(backup.memories).toHaveLength(2);
  expect(
    new Set(backup.memories.map((m: { acquisitionTimingId: string }) => m.acquisitionTimingId))
      .size,
  ).toBe(2);
  await page.goto('/');
  group = await ownedSpotlight(page);
  await group.getByRole('button', { name: /スポットライト\+/ }).click();
  await group.getByRole('button', { name: '削除', exact: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click();
  await expect(group.getByRole('link', { name: '編集', exact: true })).toHaveCount(2);
  await group.getByRole('button', { name: '削除', exact: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: '削除する' }).click();
  await expect(group.getByRole('link', { name: '編集', exact: true })).toHaveCount(1);
  await page.goto('/settings');
  await page.getByLabel('バックアップファイル（JSON・10MB以下）').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  });
  await page.getByRole('button', { name: '全件置換の確認へ' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('現在の1枚');
  await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByText('登録済みの1枚', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '全件置換の確認へ' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '全件を置き換える' }).click();
  await expect(page.getByRole('status')).toContainText('2枚のメモリーを復元');
  await page.reload();
  await expect(page.getByText('登録済みの2枚', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid imports do not replace data or leave a stale import preview', async ({ page }) => {
  await enterScreenshotMemory(page);
  await confirmSave(page);
  const backupText = await downloadBackup(page);
  const input = page.getByLabel('バックアップファイル（JSON・10MB以下）');
  await input.setInputFiles({
    name: 'valid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  });
  await expect(page.getByRole('button', { name: '全件置換の確認へ' })).toBeVisible();
  const backup = JSON.parse(backupText);
  backup.memories[0].cardId = 'unknown-card';
  await input.setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole('alert')).toContainText('不明なカードID');
  await expect(page.getByRole('button', { name: '全件置換の確認へ' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('登録済みの1枚', { exact: false })).toBeVisible();
});

test('failed save retains selections and supports retry', async ({ page }) => {
  await enterScreenshotMemory(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (fail) {
        fail = false;
        throw new DOMException('test storage full', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });
  await page.getByRole('button', { name: '内容を確認して保存' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '保存する', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('入力は保持しています');
  await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByLabel('好調+の段階', { exact: true })).toHaveText('2');
  await expect(page.getByLabel('Da 初期ステータス加算', { exact: true })).toHaveValue('20');
  await confirmSave(page);
  const group = await ownedSpotlight(page);
  await expect(group).toContainText('好調+ 2段階');
});

test('continuous registration resets a draft and protects it from navigation', async ({ page }) => {
  await enterScreenshotMemory(page);
  await page.getByRole('button', { name: '保存して次を登録', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '保存して次を登録', exact: true })
    .click();
  await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toBeVisible();
  await expect(page.getByLabel('好調+の段階', { exact: true })).toHaveText('0');
  await expect(page.getByRole('combobox', { name: 'カード名で検索' })).toHaveValue(
    'スポットライト+',
  );
  await page.getByLabel('取得タイミング', { exact: true }).selectOption('after-first-exam');
  await page.getByRole('link', { name: '一覧', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByLabel('取得タイミング', { exact: true })).toHaveValue('after-first-exam');
  await page.getByRole('link', { name: '一覧', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '破棄して移動' }).click();
  await expect(page).toHaveURL('/');
});

test('stale browser tabs cannot overwrite newly saved memories', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '所持カード一覧' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/memories/new?card=card-295');
  await expect(other.getByRole('combobox', { name: 'カード名で検索' })).toHaveValue(
    'スポットライト+',
  );
  await enterScreenshotMemory(page);
  await confirmSave(page);
  await other.getByRole('button', { name: '内容を確認して保存' }).click();
  await other
    .getByRole('alertdialog')
    .getByRole('button', { name: '保存する', exact: true })
    .click();
  await expect(other.getByRole('alert')).toContainText('別のタブで更新');
  await page.reload();
  const group = await ownedSpotlight(page);
  await expect(group.getByRole('link', { name: '編集', exact: true })).toHaveCount(1);
  await other.close();
});

test('unsupported storage is recoverable without silent resets', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '所持カード一覧' })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('gakumas-produce-memory-deck', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put(
          { schemaVersion: 99, valuableUnknownData: ['preserved'] },
          'snapshot',
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: '保存データを読み込めません' })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存データの原本をダウンロード' }).click();
  const file = await downloaded;
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toEqual({
    schemaVersion: 99,
    valuableUnknownData: ['preserved'],
  });
  await page.goto('/memories/new');
  await expect(page.getByRole('button', { name: '内容を確認して保存' })).toHaveCount(0);
});

test('direct routes, missing IDs, keyboard controls and mobile overflow', async ({ page }) => {
  await page.goto('/memories/new?card=card-295');
  const timing = page.getByLabel('取得タイミング', { exact: true });
  await timing.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(timing).toHaveValue('after-first-exam');
  const save = page.getByRole('button', { name: '内容を確認して保存' });
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/memories/not-a-memory/edit');
  await expect(page.getByRole('heading', { name: 'メモリーが見つかりません' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'メモリーが見つかりません' })).toBeVisible();
  await page.goto('/settings');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'バックアップ', exact: true })).toBeVisible();
  await page.goto('/missing');
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
});
