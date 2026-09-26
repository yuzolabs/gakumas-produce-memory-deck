import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

async function enterScreenshotMemory(page: Page) {
  await page.goto('/memories/new?card=card-295');
  await page.getByLabel('取得タイミング', { exact: true }).selectOption('after-first-exam');
  await page.getByLabel('好調+', { exact: true }).selectOption('2');
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

test('register screenshot, reload, duplicate, edit, filter timing, delete and restore', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await enterScreenshotMemory(page);
  await expect(
    page.getByLabel('元気+', { exact: true }).locator('option[value="1"]'),
  ).toBeDisabled();
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
  await expect(page.getByLabel('好調+', { exact: true })).toHaveValue('2');
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
  await expect(page.getByRole('status')).toContainText('保存しました');
  await expect(page.getByLabel('好調+', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('スキルカード', { exact: true })).toHaveValue('card-295');
  await page.getByLabel('取得タイミング', { exact: true }).selectOption('after-first-exam');
  await page.getByRole('link', { name: '一覧に戻る' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByLabel('取得タイミング', { exact: true })).toHaveValue('after-first-exam');
  await page.getByRole('link', { name: '一覧に戻る' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '破棄して移動' }).click();
  await expect(page).toHaveURL('/');
});

test('stale browser tabs cannot overwrite newly saved memories', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'スキルカードと所持メモリー' })).toBeVisible();
  const other = await context.newPage();
  await other.goto('/memories/new?card=card-295');
  await expect(other.getByLabel('スキルカード', { exact: true })).toHaveValue('card-295');
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
  await expect(page.getByRole('heading', { name: 'スキルカードと所持メモリー' })).toBeVisible();
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
