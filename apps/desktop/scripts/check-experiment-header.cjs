const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('../test/fixtures/experiment-risk-ui-recovery.json');
const {
  optimizationExperimentReadSchema,
  optimizationCompareReadSchema,
} = require('@thesis-ledger/schemas');
const base = process.env.EXPERIMENT_HEADER_QA_URL || 'http://127.0.0.1:5173';
const output = '/tmp/experiment-header-qa';
const live = process.argv.includes('--live-readonly');
const originalId = 'f2120385-11f7-40b2-9ce5-d59279fcf209';
const cloneId = '11111111-1111-4111-8111-111111111112';
const original = {
  ...fixture.experiment,
  id: originalId,
  name: '从零探索 · 300058.SZ',
  sourceMode: 'discovery',
  status: 'failed',
  stage: 'failed',
  stopReason: '[数据不可用] 受控失败记录',
  executionSymbol: '300058.SZ',
  source: {
    kind: 'discovery',
    experimentId: originalId,
    strategySpaceVersion: 'strategy-space-price-research-v1',
    discoveryScope: {
      executionInstrument: { symbol: '300058.SZ', market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
    },
  },
  instrumentDirectory: {
    generation: 1,
    unresolvedSymbols: [],
    items: [
      {
        symbol: '300058.SZ',
        canonicalCode: '300058',
        market: 'CN',
        instrumentType: 'STOCK',
        displayName: '蓝色光标',
        active: true,
      },
    ],
  },
};
const clone = {
  ...original,
  id: cloneId,
  source: { ...original.source, experimentId: cloneId },
  name: '从零探索 · 300058.SZ（克隆）',
};
for (const experiment of [original, clone]) optimizationExperimentReadSchema.parse(experiment);
const comparison = (experiment) =>
  optimizationCompareReadSchema.parse({
    experiment,
    baseline: { metrics: {}, runRefs: {} },
    candidates: [],
    attempts: [],
    note: '受控比较',
  });
fs.mkdirSync(output, { recursive: true });

async function checkTarget(locator) {
  await locator.hover();
  const appearance = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      shadow: style.boxShadow,
      borderWidth: style.borderTopWidth,
      borderStyle: style.borderTopStyle,
      borderColor: style.borderTopColor,
    };
  });
  await locator.focus();
  return locator.evaluate((element, appearance) => {
    const box = element.getBoundingClientRect();
    const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      ...appearance,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      hit: target === element || element.contains(target),
      focused: document.activeElement === element,
    };
  }, appearance);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const results = [];
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      const errors = [],
        blockedWrites = [],
        controlledWrites = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => {
        const request = route.request(),
          pathname = new URL(request.url()).pathname;
        const prefix = '/api/v1/strategy-optimization/experiments';
        if (!live && request.method() === 'POST' && pathname === `${prefix}/${originalId}/clone`) {
          controlledWrites.push(pathname);
          return route.fulfill({ json: clone });
        }
        if (request.method() !== 'GET') {
          blockedWrites.push(`${request.method()} ${pathname}`);
          return route.abort();
        }
        if (!live && pathname === prefix)
          return route.fulfill({
            json: {
              items: [original, clone],
              totalCount: 2,
              pageInfo: { nextCursor: null, hasNextPage: false },
            },
          });
        if (!live)
          for (const experiment of [original, clone]) {
            if (pathname === `${prefix}/${experiment.id}`)
              return route.fulfill({ json: { experiment, candidates: [], attempts: [] } });
            if (pathname === `${prefix}/${experiment.id}/compare`)
              return route.fulfill({ json: comparison(experiment) });
          }
        return route.continue();
      });
      await page.goto(`${base}/strategy/experiments/${originalId}`);
      const back = page.getByRole('link', { name: '返回 AI 实验', exact: true });
      await back.waitFor();
      if (!live) await page.getByRole('heading', { name: original.name, exact: true }).waitFor();
      await page.getByRole('button', { name: '实验更多操作', exact: true }).click();
      await page.getByRole('menuitem', { name: '克隆实验', exact: true }).waitFor();
      await page.keyboard.press('Escape');
      if (!live) {
        await page.getByRole('button', { name: '实验更多操作', exact: true }).click();
        await page.getByRole('menuitem', { name: '克隆实验', exact: true }).click();
        const viewClone = page.getByRole('link', { name: '查看克隆实验', exact: true });
        await viewClone.waitFor();
        const backBox = await checkTarget(back);
        assert.equal(backBox.shadow, 'none');
        await page.screenshot({
          path: path.join(output, `hover-return-${width}.png`),
          fullPage: true,
        });
        const cloneBox = await checkTarget(viewClone);
        assert(
          cloneBox.shadow === 'none' ||
            /^(?:rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(?:, )?)+$/.test(cloneBox.shadow),
        );
        assert.equal(cloneBox.borderStyle, 'solid');
        assert(parseFloat(cloneBox.borderWidth) > 0);
        assert(!['transparent', 'rgba(0, 0, 0, 0)'].includes(cloneBox.borderColor));
        await page.screenshot({
          path: path.join(output, `hover-clone-${width}.png`),
          fullPage: true,
        });
        assert(backBox.hit && cloneBox.hit && backBox.focused && cloneBox.focused);
        assert(
          backBox.x + backBox.width <= cloneBox.x ||
            cloneBox.x + cloneBox.width <= backBox.x ||
            backBox.y + backBox.height <= cloneBox.y ||
            cloneBox.y + cloneBox.height <= backBox.y,
          '操作入口重叠',
        );
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          '页面横向溢出',
        );
        await viewClone.click();
        await page.waitForURL(`**/strategy/experiments/${cloneId}`);
        await page.getByRole('heading', { name: clone.name, exact: true }).waitFor();
      } else {
        const box = await checkTarget(back);
        assert.equal(box.shadow, 'none');
        assert(box.hit && box.focused);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(output, `live-${width}.png`), fullPage: true });
      }
      await page.getByRole('link', { name: '返回 AI 实验', exact: true }).click();
      await page.waitForURL('**/strategy/experiments');
      assert.deepEqual(errors, []);
      assert.deepEqual(blockedWrites, []);
      assert.equal(controlledWrites.length, live ? 0 : 1);
      results.push({
        width,
        liveReadonly: live,
        hoverAndFocus: true,
        backShadow: 'none',
        overlap: false,
        overflow: false,
        navigation: true,
        controlledCloneRequests: controlledWrites.length,
        realWrites: 0,
      });
      await page.close();
    }
    fs.writeFileSync(
      path.join(output, live ? 'live-receipt.json' : 'receipt.json'),
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
