import { expect, test } from '@playwright/test';

for (const scenario of ['initial', 'preloaded', 'strict', 'mismatch']) {
  test(`React hydrates ${scenario} server markup and keeps all readers subscribed`, async ({
    page,
    request
  }) => {
    const params =
      scenario === 'strict'
        ? '?preloaded&strict'
        : scenario === 'initial'
          ? ''
          : `?${scenario}`;
    const url = `/examples/e2e/browser/hydration.html${params}`;
    const response = await request.get(url);
    const serverHtml = await response.text();
    const preloaded = scenario === 'preloaded' || scenario === 'strict';
    expect(serverHtml).toContain(
      `data-reader="selector">${preloaded ? '7' : '0'}</span>`
    );
    const crashes: string[] = [];
    page.on('pageerror', (error) => crashes.push(error.message));
    await page.goto(url);
    await expect
      .poll(() => page.evaluate(() => window.__hydration?.ready))
      .toBe(true);
    const current =
      scenario === 'initial'
        ? ['0', '0', '0', 'anonymous']
        : ['7', '7', '7', 'Michael'];
    await expect(page.locator('[data-reader]')).toHaveText(current);
    const metrics = await page.evaluate(() => ({
      errors: window.__hydration.errors,
      retained: window.__hydration.retainedServerNodes(),
      version: window.__hydration.reactVersion
    }));
    if (process.env.COACTION_REACT_MAJOR) {
      expect(metrics.version.split('.')[0]).toBe(
        process.env.COACTION_REACT_MAJOR
      );
    }
    if (scenario === 'mismatch') {
      expect(metrics.errors.length).toBeGreaterThan(0);
      expect(metrics.retained).toBe(false);
    } else {
      expect(metrics.errors).toEqual([]);
      expect(metrics.retained).toBe(true);
    }
    await page.evaluate(() => window.__hydration.update());
    await expect(page.locator('[data-reader]')).toHaveText([
      '9',
      '9',
      '9',
      'Jordan'
    ]);
    expect(crashes).toEqual([]);
    await page.evaluate(() => window.__hydration.destroy());
  });
}
