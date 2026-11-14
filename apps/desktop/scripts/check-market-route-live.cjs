const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.MARKET_ROUTE_QA_OUTPUT || '/tmp/market-route-navigation-qa';
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MARKET_ROUTE_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      const mutations = [],
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
            mutations.push(
              route.request().method() + ' ' + new URL(route.request().url()).pathname,
            );
            return route.abort();
          }
          return route.continue();
        },
      );
      await page.goto(
        `${process.env.MARKET_ROUTE_LIVE_URL || 'http://localhost:5173'}/market-data`,
      );
      await page.getByRole('heading', { name: '行情与净值', exact: true }).waitFor();
      if (process.env.MARKET_ROUTE_QA_THEME === 'dark') {
        await page.evaluate(() => {
          document.documentElement.dataset.theme = 'dark';
          document.documentElement.classList.add('dark');
        });
      }
      const save = page.getByRole('button', { name: '保存全部修改（0 项）' });
      assert(await save.isDisabled());
      for (const name of [
        '财务与持仓',
        '资讯与资金',
        '宏观与市场',
        '交易规则',
        '证券资料与公司行动',
        '行情与净值',
      ]) {
        if (width >= 1024) await page.getByRole('tab', { name: new RegExp('^' + name) }).click();
        else {
          await page.getByRole('combobox', { name: '数据分类', exact: true }).click();
          await page.getByRole('option', { name: new RegExp('^' + name) }).click();
          await page.locator('[data-slot="select-content"]:visible').waitFor({ state: 'hidden' });
        }
        await page.getByRole('heading', { name, exact: true }).waitFor();
      }
      const bounds = await page.locator('[data-slot="table-container"]').evaluate((table) => {
        const rect = table.getBoundingClientRect();
        return { x: rect.x, right: rect.right, page: document.documentElement.scrollWidth };
      });
      assert(
        bounds.x >= 0 && bounds.right <= width + 1 && bounds.page <= width,
        JSON.stringify(bounds),
      );
      assert.equal(await page.getByRole('switch', { name: /启用路由|启用功能/ }).count(), 0);
      await page
        .locator('[aria-label="路由能力分类"] [aria-selected="true"]')
        .evaluateAll((items) =>
          Promise.all(
            items
              .flatMap((item) => item.getAnimations())
              .map((animation) => animation.finished.catch(() => undefined)),
          ),
        );
      const colors = await page.evaluate(() => {
        function token(name) {
          const probe = document.createElement('span');
          probe.style.color = `var(--${name})`;
          document.body.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        }
        const foreground = token('foreground');
        const activeText = token('primary-foreground');
        const activeBackground = token('primary');
        const values = [...document.querySelectorAll('tbody [data-slot="select-value"]')].filter(
          (item) => !item.closest('button').disabled,
        );
        const headings = [...document.querySelectorAll('tbody button[aria-expanded]')];
        const tabs = [...document.querySelectorAll('[aria-label="路由能力分类"] [role="tab"]')];
        return {
          selectedStyle: tabs
            .filter((item) => item.getAttribute('aria-selected') === 'true')
            .map((item) => ({
              color: getComputedStyle(item).color,
              background: getComputedStyle(item).backgroundColor,
              expectedColor: activeText,
              expectedBackground: activeBackground,
            })),
          readableValues:
            values.length > 0 &&
            values.every((item) => getComputedStyle(item).color === foreground),
          readableHeadings:
            headings.length > 0 &&
            headings.every((item) => getComputedStyle(item).color === foreground),
          readableTabs: tabs
            .filter((item) => item.getAttribute('aria-selected') === 'false')
            .every((item) => getComputedStyle(item).color === foreground),
          selectedTab: tabs
            .filter((item) => item.getAttribute('aria-selected') === 'true')
            .every((item) => {
              const style = getComputedStyle(item);
              return style.color === activeText && style.backgroundColor === activeBackground;
            }),
        };
      });
      assert(Object.values(colors).every(Boolean), JSON.stringify(colors));
      assert.deepEqual(mutations, []);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/live-${width}.png`, fullPage: true });
      results.push({
        width,
        allCategories: true,
        noPageOverflow: true,
        ...colors,
        writes: mutations.length,
        errors: errors.length,
      });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally {
    writeFileSync(`${output}/live-results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
