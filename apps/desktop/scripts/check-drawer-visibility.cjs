const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const out = process.env.DRAWER_QA_OUTPUT || '/tmp/drawer-visibility-qa';
mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DRAWER_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [],
    results = [],
    requests = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.log('PAGEERROR', e.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('CONSOLE', msg.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      console.log('HTTP', response.status(), new URL(response.url()).pathname);
  });
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (r) => {
      requests.push({ method: r.request().method(), url: new URL(r.request().url()).pathname });
      return r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: '隔离失败验收：输入已保留。'.repeat(15) }),
      });
    },
  );
  const cases = process.env.DRAWER_QA_CASES?.split(',') || [
    'fund-create',
    'fund-edit',
    'fund-confirm',
    'fund-skip',
    'observation',
    'deposit',
    'transfer',
    'evidence',
    'json',
    'body',
    'whole',
    'bottom',
  ];
  for (const width of [1440, 1024, 768, 390])
    for (const height of [900, 560])
      for (const scenario of cases) {
        await page.setViewportSize({ width, height });
        await page.goto(
          (process.env.DRAWER_QA_BASE_URL || 'http://127.0.0.1:5173') +
            '/test/browser-drawer-visibility.html?case=' +
            (scenario.startsWith('fund-') ? 'fund' : scenario),
        );
        if (scenario.startsWith('fund-')) {
          const label = {
            'fund-create': '新建定投',
            'fund-edit': '编辑',
            'fund-confirm': '确认成交',
            'fund-skip': '跳过',
          }[scenario];
          await page.getByRole('button', { name: label, exact: true }).click();
        }
        const sheet = page.locator('[data-slot=sheet-content]');
        await sheet.waitFor();
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect.getTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          ),
        );
        await page.keyboard.press('Tab');
        const controls = sheet.locator(
          'input:not([disabled]):not([type=hidden]),textarea:not([disabled]),button[data-slot=select-trigger]',
        );
        const focuses = [];
        for (let i = 0; i < (await controls.count()); i++) {
          const c = controls.nth(i);
          if (
            !(await c.isVisible()) ||
            (await c.evaluate(
              (el) => el.getBoundingClientRect().width < 4 || el.getBoundingClientRect().height < 4,
            ))
          )
            continue;
          await c.focus();
          const metric = await c.evaluate((el) => {
            let ring = el;
            for (
              let p = el;
              p && p !== el.closest('[data-slot=sheet-content]');
              p = p.parentElement
            ) {
              if (/0px 0px 0px 3px/.test(getComputedStyle(p).boxShadow)) {
                ring = p;
                break;
              }
            }
            const rr = ring.getBoundingClientRect(),
              clips = [];
            for (let p = ring.parentElement; p; p = p.parentElement) {
              const st = getComputedStyle(p),
                r = p.getBoundingClientRect();
              if (/auto|hidden|scroll|clip/.test(st.overflowX))
                clips.push({
                  axis: 'x',
                  start: rr.left - (r.left + p.clientLeft),
                  end: r.left + p.clientLeft + p.clientWidth - rr.right,
                  slot: p.dataset.slot || p.tagName,
                });
              if (/auto|hidden|scroll|clip/.test(st.overflowY))
                clips.push({
                  axis: 'y',
                  start: rr.top - (r.top + p.clientTop),
                  end: r.top + p.clientTop + p.clientHeight - rr.bottom,
                  slot: p.dataset.slot || p.tagName,
                });
            }
            return {
              name: el.id || el.getAttribute('aria-label') || el.tagName,
              shadow: getComputedStyle(ring).boxShadow,
              clips,
            };
          });
          const spread = /0px 0px 0px 3px/.test(metric.shadow) ? 3 : 0;
          for (const clip of metric.clips)
            assert(
              clip.start >= spread - 0.6 && clip.end >= spread - 0.6,
              JSON.stringify({ width, height, scenario, ...metric, bad: clip }),
            );
          focuses.push({
            name: metric.name,
            ring: spread,
            minimumClearance: Math.min(...metric.clips.flatMap((c) => [c.start, c.end])),
          });
        }
        // Compare independent scrolling body with the footer itself, then scroll to the final item.
        const layout = await sheet.evaluate((el) => {
          const r = el.getBoundingClientRect(),
            body = el.querySelector('[data-slot=sheet-body]'),
            footer = el.querySelector('[data-slot=sheet-footer]');
          const br = body?.getBoundingClientRect(),
            fr = footer?.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            bodyBottom: br?.bottom,
            footerTop: fr?.top,
            independent: getComputedStyle(el).overflowY === 'hidden',
          };
        });
        assert(
          layout.left >= 0 &&
            layout.right <= width + 0.6 &&
            layout.top >= -0.6 &&
            layout.bottom <= height + 0.6,
        );
        if (layout.independent && layout.bodyBottom && layout.footerTop)
          assert(
            layout.bodyBottom <= layout.footerTop - 3,
            JSON.stringify({ scenario, width, height, layout }),
          );
        if (['body', 'whole', 'bottom'].includes(scenario)) {
          await sheet.getByRole('button', { name: '受控错误', exact: true }).click();
          await sheet.getByRole('alert').waitFor();
          await sheet.getByRole('alert').scrollIntoViewIfNeeded();
          const visible = await sheet.getByRole('alert').evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight;
          });
          assert(visible, `${scenario} error unreachable`);
        }
        if (scenario === 'observation') {
          const amount = sheet.locator('#cash-observation-amount');
          const original = await amount.inputValue();
          await sheet.getByRole('button', { name: '记录现金快照', exact: true }).click();
          const error = sheet.locator('[data-slot=field-error]');
          await error.waitFor();
          assert.equal(await amount.inputValue(), original);
          await error.evaluate((el) => {
            const body = el.closest('form').querySelector('.overflow-y-auto');
            body.scrollTop = body.scrollHeight;
          });
          const errorLayout = await error.evaluate((el) => {
            const footer = el.closest('form').querySelector('[data-slot=sheet-footer]');
            return {
              bottom: el.getBoundingClientRect().bottom,
              footerTop: footer.getBoundingClientRect().top,
            };
          });
          assert(errorLayout.bottom <= errorLayout.footerTop - 3);
          if (width === 390 && height === 560)
            await page.screenshot({ path: `${out}/observation-long-error-390.png` });
        }
        if (scenario === 'fund-create') {
          await sheet.locator('#fund-plan-name').focus();
          if (height === 900) await page.screenshot({ path: `${out}/fund-create-${width}.png` });
          if (width === 1440 && height === 900) {
            const before = await sheet.locator('#fund-plan-name').evaluate((el) => {
              const body = el.closest('[data-slot=sheet-body]');
              const previous = body.className;
              body.className = 'min-h-0 flex-1 overflow-y-auto';
              const e = el.getBoundingClientRect(),
                r = body.getBoundingClientRect();
              const result = { left: e.left - r.left, right: r.right - e.right };
              body.className = previous;
              return result;
            });
            assert(before.left < 3 && before.right < 3);
            results.push({
              scenario: 'old-layout-replay',
              width,
              height,
              ...before,
              clippedRing: true,
            });
          }
        }
        const close = sheet.getByRole('button', { name: '取消', exact: true });
        if (await close.count()) await close.click();
        else await sheet.locator('[data-slot=sheet-close]').last().click();
        const confirm = page.getByRole('alertdialog');
        if (await confirm.count())
          await confirm.getByRole('button', { name: '放弃修改并关闭', exact: true }).click();
        await sheet.waitFor({ state: 'hidden' });
        results.push({ scenario, width, height, focuses, layout, cancel: true });
        console.log(
          JSON.stringify({
            scenario,
            width,
            height,
            focused: focuses.length,
            minimumClearance: Math.min(...focuses.map((f) => f.minimumClearance)),
          }),
        );
      }
  assert.deepEqual(errors, []);
  writeFileSync(
    out + '/results.json',
    JSON.stringify(
      {
        results,
        errors,
        requests,
        note: '实际业务组件和共享布局，全部 API 请求拦截；未写入真实数据。',
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log('DONE ' + results.length);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
