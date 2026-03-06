import { expect, test, type Page } from '@playwright/test';

const harnessPath = '/examples/e2e/browser/index.html';

const gotoHarness = async (page: Page) => {
  await page.goto(harnessPath);
  await expect(page.locator('#status')).toHaveText('ready');
};

test('logger middleware emits events in real browser', async ({ page }) => {
  await gotoHarness(page);

  const result = await page.evaluate(() =>
    window.__middlewareHarness.runLoggerScenario()
  );

  expect(result.count).toBe(1);
  expect(result.eventCount).toBeGreaterThan(0);
  expect(result.methods).toContain('groupCollapsed');
  expect(result.methods).toContain('groupEnd');
});

test('history middleware supports undo and redo in browser', async ({
  page
}) => {
  await gotoHarness(page);

  const result = await page.evaluate(() =>
    window.__middlewareHarness.runHistoryScenario()
  );

  expect(result.afterIncrement).toBe(2);
  expect(result.undone).toBeTruthy();
  expect(result.afterUndo).toBe(1);
  expect(result.redone).toBeTruthy();
  expect(result.afterRedo).toBe(2);
});

test('persist middleware hydrates state across tabs', async ({ browser }) => {
  const storageKey = 'pw-persist-cross-tab';
  const context = await browser.newContext();
  const pageA = await context.newPage();

  await gotoHarness(pageA);
  await pageA.evaluate((key) => {
    window.__middlewareHarness.clearPersistState(key);
  }, storageKey);

  const persisted = await pageA.evaluate((key) => {
    return window.__middlewareHarness.runPersistScenario(key);
  }, storageKey);

  expect(persisted.count).toBe(1);
  expect(persisted.persistedCount).toBe(1);

  const pageB = await context.newPage();
  await gotoHarness(pageB);

  const hydrated = await pageB.evaluate((key) => {
    return window.__middlewareHarness.runPersistHydrateScenario(key, 1);
  }, storageKey);

  expect(hydrated.count).toBe(1);
  await context.close();
});

test('yjs middleware syncs across linked docs in browser', async ({ page }) => {
  await gotoHarness(page);

  const result = await page.evaluate(() =>
    window.__middlewareHarness.runYjsScenario()
  );

  expect(result.peerACount).toBe(2);
  expect(result.peerBCount).toBe(2);
});
