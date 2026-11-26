const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.SCOPE_BROWSER_URL || 'http://127.0.0.1:5197';

async function ready(page, name) {
  await page.getByRole('heading', { name, exact: true }).waitFor();
}
async function review(page) {
  await page.getByRole('button', { name: '审阅并采纳', exact: true }).click();
  const confirm = page.getByRole('button', { name: '确认采纳', exact: true });
  await confirm.waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent.trim() === '确认采纳' && !button.disabled,
    ),
  );
  assert.equal(await confirm.isEnabled(), true);
  return confirm;
}
async function clone(page) {
  await page.getByRole('button', { name: '实验更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '克隆实验', exact: true }).click();
}
async function mount(browser, width) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 },
    timezoneId: 'Asia/Shanghai',
  });
  page.setDefaultTimeout(15000);
  const errors = [],
    forbidden = [],
    writes = [];
  let held = null,
    releaseHold;
  const holder = {
    mode: 'normal',
    async release() {
      releaseHold?.();
    },
    errors,
    forbidden,
    writes,
  };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const match = url.pathname.match(/\/strategy-optimization\/experiments\/([^/]+)(.*)$/);
    if (!match) {
      forbidden.push(request.url());
      return route.abort();
    }
    const [, id, action] = match;
    if (request.method() === 'POST') {
      writes.push({ id, action, body: request.postDataJSON() });
      if (!['/adopt', '/clone'].includes(action)) {
        forbidden.push(request.url());
        return route.abort();
      }
      if (holder.mode.startsWith('late')) {
        held = request.url();
        await new Promise((resolve) => {
          releaseHold = resolve;
        });
      }
      if (holder.mode === 'late-failure')
        return route.fulfill({
          status: 400,
          json: { error: 'ADOPTION_NOT_ELIGIBLE', message: '旧实验受控失败' },
        });
      const json = await page.evaluate(
        ({ id, action }) =>
          action === '/adopt'
            ? window.scopeBrowser.adoption
            : window.scopeBrowser.records[window.scopeBrowser.b].experiment,
        { id, action },
      );
      return route.fulfill({ json });
    }
    const json = await page.evaluate(
      ({ id, action }) => {
        const f = window.scopeBrowser;
        if (action === '') return f.records[id];
        if (action === '/compare') return f.compare(id);
        if (action === '/adopt-context') return f.contexts[id];
        if (action.endsWith('/adoption')) return null;
        return undefined;
      },
      { id, action },
    );
    if (json === undefined) {
      forbidden.push(request.url());
      return route.abort();
    }
    return route.fulfill({ json });
  });
  await page.goto(baseUrl + '/test/browser-experiment-scope.html');
  console.log(JSON.stringify({ width, phase: 'mounted' }));
  await ready(page, '实验 A');
  return { page, holder, held: () => held };
}
async function verifyWidth(browser, width) {
  const { page, holder, held } = await mount(browser, width);
  try {
    const confirm = await review(page);
    const bounds = await page.getByRole('dialog').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      await page
        .getByRole('button', { name: '审阅并采纳', exact: true })
        .evaluate((el) => document.activeElement === el),
      true,
    );
    await review(page);
    await confirm.click();
    console.log(JSON.stringify({ width, phase: 'adoption-submitted' }));
    await page.getByText('已采纳为正式策略 v2', { exact: true }).first().waitFor();
    await page.getByRole('button', { name: '切换实验 B', exact: true }).click();
    await ready(page, '实验 B');
    assert.equal(await page.getByRole('link', { name: '查看策略版本', exact: true }).count(), 0);
    await page.getByRole('button', { name: '切换实验 A', exact: true }).click();
    await ready(page, '实验 A');
    await clone(page);
    await page.getByRole('link', { name: '查看克隆实验', exact: true }).click();
    await ready(page, '实验 B');
    assert.equal(await page.getByRole('link', { name: '查看克隆实验', exact: true }).count(), 0);
    for (const mode of ['late-success', 'late-failure']) {
      await page.getByRole('button', { name: '切换实验 A', exact: true }).click();
      await ready(page, '实验 A');
      holder.mode = mode;
      console.log(JSON.stringify({ width, phase: mode }));
      const before = holder.writes.length;
      await review(page);
      await confirm.click();
      await page.waitForFunction(() => window.scopeBrowser.pending() === 1);
      assert(held());
      await page.evaluate(() => window.scopeBrowser.navigate(window.scopeBrowser.b));
      console.log(JSON.stringify({ width, phase: 'navigated-with-pending-request' }));
      await ready(page, '实验 B');
      await review(page);
      const toastBefore = await page.locator('[data-slot="toast-title"]').allTextContents();
      await holder.release();
      await page.waitForFunction(() => window.scopeBrowser.pending() === 0);
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1);
      assert.equal(await page.getByRole('dialog').count(), 1);
      assert.equal(await confirm.isEnabled(), true);
      assert.deepEqual(
        await page.locator('[data-slot="toast-title"]').allTextContents(),
        toastBefore,
      );
      assert.equal(holder.writes.length, before + 1);
      assert(holder.writes.every((write) => write.id.endsWith('0091')));
      await page.keyboard.press('Escape');
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(holder.errors, []);
    assert.deepEqual(holder.forbidden, []);
    console.log(
      JSON.stringify({
        width,
        adoptionSwitch: true,
        cloneNavigation: true,
        lateSuccess: true,
        lateFailure: true,
        dialogFocus: true,
        overflow: false,
        interceptedWrites: holder.writes.length,
        unexpectedRequests: 0,
      }),
    );
  } catch (error) {
    console.error('浏览器用例失败', error, holder.errors, holder.forbidden);
    throw error;
  } finally {
    await holder.release();
    await page.close();
  }
}
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 1024, 768, 390]) await verifyWidth(browser, width);
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
