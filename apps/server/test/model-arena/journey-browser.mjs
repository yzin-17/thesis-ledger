import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { browserMarket } from './journey-browser-market.mjs';

export async function inspectDesktop(input) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const { base, token, group, match, week } = input;
  const origin = new URL(base).origin;
  const market = browserMarket(input);
  const browser = await chromium.launch({
    executablePath: process.env.ARENA_BROWSER_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(6500);
    await page.clock.setFixedTime(new Date(Date.parse(input.days[1].endAt) + 86400000));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        if (/^\/api\/v1\/(watchlist|model-arenas|model-weeklies|identity)(\/|$)/.test(url.pathname))
          return route.continue({
            headers: { ...route.request().headers(), 'x-thesis-ledger-session': token },
          });
        return market(route, url);
      }
      const asset = /^\/assets\/[\w.-]+$/.test(url.pathname) ? url.pathname : '/index.html';
      return route.fulfill({
        path: fileURLToPath(new URL('../../../desktop/dist' + asset, import.meta.url)),
      });
    });
    const btn = (name) => page.getByRole('button', { name, exact: true });
    const link = (name) => page.getByRole('link', { name });
    await page.goto(origin + '/watchlist');
    await btn('跟踪订单').click();
    await btn('联验标的 ' + input.symbol).click();
    await page.getByRole('dialog').waitFor();
    const detail = page.url();
    assert.equal(new URL(detail).searchParams.get('group'), group);
    await btn('标的新闻').click();
    await link('受控公告披露新增订单').waitFor();
    await btn('标的新闻').click();
    await btn('标的新闻').click();
    await page.getByText(/当前窗口没有可展示的新闻/).waitFor();
    await btn('公告').click();
    await link('受控公告披露新增订单').waitFor();
    await btn('标的新闻').click();
    await page
      .getByRole('dialog')
      .getByRole('alert')
      .filter({ hasText: '服务暂时无法完成本次操作' })
      .waitFor();
    await btn('标的研究').click();
    await page.getByText('受控研究摘要', { exact: true }).waitFor();
    await btn('订单怎样影响收入？').click();
    await page.waitForURL('**/ai-chat?mode=reading&run=*');
    await page.goBack();
    await btn('模型模拟买卖点').click();
    await btn('双模型联验').click();
    await link(/alpha.*模拟买入 50 股/).click();
    await page.getByRole('heading', { name: /fixture \/ alpha/ }).waitFor();
    await link('返回来源页').click();
    await page.getByRole('dialog').waitFor();
    assert.equal(page.url(), detail);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(new URL(page.url()).searchParams.get('group'), group);
    await page.goto(origin + '/journal');
    await link('模型周报').click();
    await link(/双模型联验.*第 1 版/).click();
    await page.waitForURL(origin + '/journal/model-weeklies/' + match + '/' + week);
    await page.goto(origin + '/strategy/arena/' + match);
    await link('模型周报').click();
    await link(/双模型联验.*第 1 版/).click();
    const weekly = origin + '/journal/model-weeklies/' + match + '/' + week;
    for (const [target, model] of [
      [/买入 50 股/, 'alpha'],
      [/beta.*模型费用/, 'beta'],
    ]) {
      await link(target).click();
      await page.getByRole('heading', { name: new RegExp('fixture / ' + model) }).waitFor();
      assert.equal(await page.locator('article').count(), 1);
      await page.getByText(/受控公告披露新增订单/).waitFor();
      await link('返回来源页').click();
      await page.waitForURL(weekly);
    }
  } catch (error) {
    const visible = await page.locator('body').innerText();
    throw new Error(error.message + '\n页面末段：' + visible.slice(-1400), { cause: error });
  } finally {
    await browser.close();
  }
}
