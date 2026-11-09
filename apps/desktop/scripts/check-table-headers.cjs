const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.env.TABLE_QA_URL || 'http://127.0.0.1:5173';
const out = process.env.TABLE_QA_OUTPUT || '/tmp/desktop-table-headers-qa';
async function settle(p) {
  await p.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
async function check(p) {
  return p.locator('thead').evaluateAll((headers) =>
    headers.map((h) => ({
      background: getComputedStyle(h).backgroundColor,
      visible: h.getBoundingClientRect().height > 2,
      heads: [...h.querySelectorAll('th')].map((th) => {
        const s = getComputedStyle(th);
        return {
          text: th.innerText,
          fontSize: s.fontSize,
          weight: s.fontWeight,
          padding: s.padding,
          color: s.color,
          height: th.getBoundingClientRect().height,
          align: s.textAlign,
        };
      }),
    })),
  );
}
function verify(rows, label) {
  for (const row of rows.filter((x) => x.visible)) {
    assert.notEqual(row.background, 'rgba(0, 0, 0, 0)', label);
    for (const h of row.heads.filter((h) => h.height > 0)) {
      assert.equal(h.fontSize, '12px', label + ':' + h.text);
      assert.equal(h.weight, '500', label + ':' + h.text);
      assert.equal(h.padding, '8px 12px', label + ':' + h.text);
      assert.equal(h.height, 40, label + ':' + h.text);
    }
  }
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
  });
  const results = [],
    errors = [],
    blocked = [],
    cache = new Map(),
    responses = [];
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.route('**/api/**', async (r) => {
      const q = r.request();
      if (!(
        q.method() === 'GET' ||
        (q.method() === 'POST' && new URL(q.url()).pathname.endsWith('/watchlist/prices'))
      )) {
        blocked.push(q.method() + ' ' + new URL(q.url()).pathname);
        return r.abort();
      }
      if (
        (q.headers().accept || '').includes('text/event-stream') ||
        new URL(q.url()).pathname.endsWith('/stream') ||
        new URL(q.url()).pathname.endsWith('/backtests/events')
      )
        return r.continue();
      const key = q.method() + q.url() + (q.postData() || '');
      if (!cache.has(key))
        cache.set(
          key,
          (async () => {
            const response = await r.fetch();
            const status = response.status(),
              headers = response.headers();
            responses.push({ url: q.url(), status });
            return { status, headers, body: await response.body() };
          })(),
        );
      await r.fulfill(await cache.get(key));
    });
    const accountsResponse = p.waitForResponse(
      (r) => r.url().includes('/api/') && new URL(r.url()).pathname.endsWith('/accounts'),
    );
    await p.goto(root + '/performance');
    const accounts = await (await accountsResponse).json();
    const account = accounts.find(
      (a) => a.type === 'fund' && a.mode === 'actual' && a.active !== false,
    );
    assert(account);
    const paths = [
      '/performance',
      `/accounts?accountId=${account.id}&tab=positions`,
      `/accounts?accountId=${account.id}&tab=transactions`,
      '/providers',
      '/strategy/library',
      '/strategy/experiments',
      '/risk-center?tab=events',
      '/risk-center?tab=notifications',
      '/watchlist',
    ];
    for (const theme of ['light', 'dark']) {
      await p.addInitScript((t) => localStorage.setItem('thesis-ledger-theme', t), theme);
      for (const width of [1440, 1024, 768, 390]) {
        await p.setViewportSize({ width, height: 1000 });
        let reference;
        for (const path of paths) {
          await p.goto(root + path);
          await p.locator('thead').first().waitFor({ state: 'attached' });
          await settle(p);
          const rows = await check(p);
          verify(rows, `${theme}/${width}/${path}`);
          const first = rows.find((x) => x.visible);
          if (!rows.length)
            console.log(
              JSON.stringify({
                noHeader: true,
                theme,
                width,
                path,
                text: (await p.locator('main').innerText()).slice(-200),
              }),
            );
          if (first) {
            const style = {
              background: first.background,
              fontSize: first.heads[0].fontSize,
              weight: first.heads[0].weight,
              color: first.heads[0].color,
              padding: first.heads[0].padding,
            };
            if (!reference) reference = style;
            else assert.deepEqual(style, reference, `${theme}/${width}/${path}`);
          }
          const overflow = await p.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          );
          assert(overflow <= 1, `${path}/${width} page overflow ${overflow}`);
          if (path === '/performance') {
            const sort = p.locator('th[aria-sort]').first();
            for (const direction of ['descending', 'ascending', 'descending']) {
              await sort.locator('button').click();
              assert.equal(await sort.getAttribute('aria-sort'), direction);
            }
          }
          results.push({ theme, width, path, headers: rows, overflow });
          fs.writeFileSync(out + '/progress.json', JSON.stringify(results, null, 2));
          if (['/performance', `/accounts?accountId=${account.id}&tab=positions`].includes(path)) {
            await p.screenshot({
              path: `${out}/${theme}-${width}-${path === '/performance' ? 'holdings' : 'snapshot'}.png`,
              fullPage: false,
            });
          }
        }
        await p.goto(`${root}/test/browser-table-headers.html?theme=${theme}`);
        await p.getByRole('button', { name: '选择', exact: true }).waitFor();
        await settle(p);
        const rows = await check(p);
        verify(rows, 'controlled');
        const container = p.locator('[data-slot="table-container"]').first();
        const header = p.locator('[data-sticky-table-action="header"]');
        const before = await header.boundingBox();
        await container.evaluate((el) => {
          el.scrollLeft = el.scrollWidth;
        });
        await settle(p);
        const after = await header.boundingBox();
        assert(Math.abs(before.x - after.x) < 1, 'sticky header shifted');
        assert.equal(
          await header.evaluate((el) => getComputedStyle(el).backgroundColor),
          rows[0].background,
        );
        assert.equal(await header.evaluate((el) => getComputedStyle(el, '::before').width), '1px');
        await p.getByRole('button', { name: '选择', exact: true }).click();
        await p.getByRole('button', { name: '已选择', exact: true }).waitFor();
        await p.getByRole('button', { name: '查看复盘指标', exact: true }).click();
        const dialog = p.getByRole('dialog');
        await dialog.waitFor();
        await settle(p);
        const detailRows = await check(p);
        verify(detailRows, 'detail');
        assert.deepEqual(
          detailRows[1].heads.map(({ text, align, ...style }) => style),
          detailRows[0].heads.slice(0, 3).map(({ text, align, ...style }) => style),
        );
        const box = await dialog.boundingBox();
        assert(box.x >= -1 && box.x + box.width <= width + 1, 'sheet outside viewport');
        await p.screenshot({ path: `${out}/${theme}-${width}-detail.png` });
        await p.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert(
          await p
            .getByRole('button', { name: '查看复盘指标' })
            .evaluate((el) => document.activeElement === el),
        );
        results.push({
          theme,
          width,
          path: 'controlled',
          headers: rows,
          detailHeaders: detailRows[1],
          stickyShift: after.x - before.x,
          dialog: box,
        });
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(blocked, []);
    fs.writeFileSync(
      out + '/matrix.json',
      JSON.stringify({ results, errors, blocked, responses }, null, 2),
    );
    console.log(
      JSON.stringify({
        cases: results.length,
        real: results.filter((r) => r.path !== 'controlled').length,
        controlled: results.filter((r) => r.path === 'controlled').length,
        errors,
        blocked,
        failedResponses: responses.filter((r) => r.status >= 400),
      }),
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
