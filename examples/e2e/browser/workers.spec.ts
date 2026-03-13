import { expect, test, type Page } from '@playwright/test';

const harnessPath = '/examples/e2e/browser/index.html';

const createScenarioName = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const gotoHarness = async (page: Page) => {
  await page.goto(harnessPath);
  await expect(page.locator('#status')).toHaveText('ready');
};

const connectWorker = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  expectedCount?: number
) =>
  page.evaluate(
    ({ kind, name, expectedCount: nextExpectedCount }) =>
      window.__workerHarness.connect({
        kind,
        name,
        expectedCount: nextExpectedCount
      }),
    { kind, name, expectedCount }
  );

const addInWorker = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  step = 1
) =>
  page.evaluate(
    ({ kind, name, step: nextStep }) =>
      window.__workerHarness.add({
        kind,
        name,
        step: nextStep
      }),
    { kind, name, step }
  );

const addAsyncInWorker = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  step = 1
) =>
  page.evaluate(
    ({ kind, name, step: nextStep }) =>
      window.__workerHarness.addAsync({
        kind,
        name,
        step: nextStep
      }),
    { kind, name, step }
  );

const failInWorker = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  message: string
) =>
  page.evaluate(
    ({ kind, name, message: nextMessage }) =>
      window.__workerHarness.fail({
        kind,
        name,
        message: nextMessage
      }),
    { kind, name, message }
  );

const waitForWorkerCount = (
  page: Page,
  kind: 'shared' | 'web',
  name: string,
  expectedCount: number
) =>
  page.evaluate(
    ({ kind, name, expectedCount }) =>
      window.__workerHarness.waitForCount({
        kind,
        name,
        expectedCount
      }),
    { kind, name, expectedCount }
  );

const readWorkerCount = (page: Page, kind: 'shared' | 'web', name: string) =>
  page.evaluate(
    ({ kind, name }) =>
      window.__workerHarness.read({
        kind,
        name
      }),
    { kind, name }
  );

const disconnectWorker = (page: Page, kind: 'shared' | 'web', name: string) =>
  page.evaluate(
    ({ kind, name }) =>
      window.__workerHarness.disconnect({
        kind,
        name
      }),
    { kind, name }
  );

test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    if ('__workerHarness' in window) {
      await window.__workerHarness.disconnectAll();
    }
  });
});

test('shared worker syncs across pages and late reconnects', async ({
  browser
}) => {
  const name = createScenarioName('shared-sync');
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await gotoHarness(pageA);
  await gotoHarness(pageB);

  await connectWorker(pageA, 'shared', name, 0);
  await addInWorker(pageA, 'shared', name, 2);

  const pageBInitial = await connectWorker(pageB, 'shared', name, 2);
  expect(pageBInitial.count).toBe(2);

  const pageBResult = await addInWorker(pageB, 'shared', name, 1);
  expect(pageBResult).toEqual({
    result: 3,
    count: 3
  });

  const pageAObserved = await waitForWorkerCount(pageA, 'shared', name, 3);
  expect(pageAObserved.count).toBe(3);

  await disconnectWorker(pageB, 'shared', name);

  const pageAAfterDisconnect = await addInWorker(pageA, 'shared', name, 2);
  expect(pageAAfterDisconnect).toEqual({
    result: 5,
    count: 5
  });

  const reconnectPage = await context.newPage();
  await gotoHarness(reconnectPage);
  const reconnected = await connectWorker(reconnectPage, 'shared', name, 5);
  expect(reconnected.count).toBe(5);

  await reconnectPage.evaluate(async () => {
    await window.__workerHarness.disconnectAll();
  });
  await context.close();
});

test('shared worker propagates async results and errors', async ({ page }) => {
  const name = createScenarioName('shared-async');
  await gotoHarness(page);

  await connectWorker(page, 'shared', name, 0);

  const asyncResult = await addAsyncInWorker(page, 'shared', name, 2);
  expect(asyncResult).toEqual({
    result: 4,
    count: 4
  });

  const errorResult = await failInWorker(
    page,
    'shared',
    name,
    'shared-worker-error'
  );
  expect(errorResult.message).toBe('shared-worker-error');
});

test('web worker propagates actions, async results, and errors', async ({
  page
}) => {
  const name = createScenarioName('web-actions');
  await gotoHarness(page);

  await connectWorker(page, 'web', name, 0);

  const syncResult = await addInWorker(page, 'web', name, 1);
  expect(syncResult).toEqual({
    result: 1,
    count: 1
  });

  const asyncResult = await addAsyncInWorker(page, 'web', name, 2);
  expect(asyncResult).toEqual({
    result: 5,
    count: 5
  });

  const errorResult = await failInWorker(page, 'web', name, 'web-worker-error');
  expect(errorResult.message).toBe('web-worker-error');
});

test('web worker state stays isolated per page', async ({ browser }) => {
  const name = createScenarioName('web-isolated');
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await gotoHarness(pageA);
  await gotoHarness(pageB);

  await connectWorker(pageA, 'web', name, 0);
  await connectWorker(pageB, 'web', name, 0);

  const pageAResult = await addInWorker(pageA, 'web', name, 2);
  expect(pageAResult).toEqual({
    result: 2,
    count: 2
  });

  await pageB.waitForTimeout(200);
  const pageBCount = await readWorkerCount(pageB, 'web', name);
  expect(pageBCount.count).toBe(0);

  const pageBResult = await addInWorker(pageB, 'web', name, 1);
  expect(pageBResult).toEqual({
    result: 1,
    count: 1
  });

  await pageA.waitForTimeout(200);
  const pageAStable = await readWorkerCount(pageA, 'web', name);
  expect(pageAStable.count).toBe(2);

  await pageA.evaluate(async () => {
    await window.__workerHarness.disconnectAll();
  });
  await pageB.evaluate(async () => {
    await window.__workerHarness.disconnectAll();
  });
  await context.close();
});
