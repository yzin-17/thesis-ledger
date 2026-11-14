const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const out = process.env.DRAWER_QA_OUTPUT || '/tmp/drawer-all-qa';
const account = [
  'audit',
  'audit-error',
  'reason-void',
  'reason-restore',
  'transfer-replace',
  'transfer-void',
  'transfer-restore',
  'execution-new',
  'execution-edit',
  'cash-plan-create',
  'cash-plan-edit',
  'cash-occurrence-confirm',
  'cash-occurrence-skip',
  'reconciliation',
  'opening-boundary',
  'account-manager',
  'account-manager-list',
  'portfolio-account',
  'portfolio-account-edit',
  'portfolio-cash',
  'portfolio-position',
  'portfolio-position-edit',
];
const content = [
  'research-new',
  'research-submit',
  'research-detail',
  'research-detail-long',
  'research-evidence',
  'import-draft',
  'import-draft-success',
  'import-screenshot',
  'journal-raw',
  'journal-draft',
  'market-reference',
  'market-news',
  'market-documents',
  'market-reading',
];
const settings = [
  'provider-ai',
  'provider-notification',
  'automation',
  'market-credentials',
  'market-checks',
  'risk-create',
  'risk-edit',
  'strategy-editor',
  'strategy-json',
  'strategy-state-loading',
  'strategy-state-error',
  'strategy-risk',
];
const base = [
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
const cases = process.env.DRAWER_QA_CASES?.split(',') || [
  ...base.map((c) => 'base:' + c),
  ...account.map((c) => 'all-account:' + c),
  ...content.map((c) => 'all-content:' + c),
  ...settings.map((c) => 'all-settings:' + c),
];
const widths = process.env.DRAWER_QA_WIDTHS?.split(',').map(Number) || [1440, 1024, 768, 390];
const heights = process.env.DRAWER_QA_HEIGHTS?.split(',').map(Number) || [560, 900];
mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DRAWER_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const results = [],
    failures = [],
    requests = [];
  let runtimeErrors = [];
  page.on('pageerror', (e) => runtimeErrors.push(e.message));
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (r) => {
      requests.push({ method: r.request().method(), path: new URL(r.request().url()).pathname });
      return r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: '隔离失败状态：当前输入保留。'.repeat(12) }),
      });
    },
  );
  for (const width of widths)
    for (const height of heights)
      for (const scenario of cases) {
        runtimeErrors = [];
        const name = scenario.split(':')[1],
          label = scenario.replaceAll(':', '-');
        try {
          await page.setViewportSize({ width, height });
          await page.goto(
            (process.env.DRAWER_QA_BASE_URL || 'http://127.0.0.1:5173') +
              '/test/browser-drawer-visibility.html?case=' +
              (scenario.startsWith('base:')
                ? name.startsWith('fund-')
                  ? 'fund'
                  : name
                : scenario),
          );
          const trigger = {
            'fund-create': '新建定投',
            'fund-edit': '编辑',
            'fund-confirm': '确认成交',
            'fund-skip': '跳过',
            'cash-plan-create': '新建计划',
            'cash-occurrence-confirm': '确认入账',
            'cash-occurrence-skip': '跳过',
            'account-manager': '管理账户',
            'account-manager-list': '管理账户',
            'portfolio-account': '创建账户',
            'portfolio-account-edit': '编辑',
            'market-reference': '市场资料',
            'market-news': '新闻',
            'market-reading': '相关资讯',
          }[name];
          if (trigger) await page.getByRole('button', { name: trigger, exact: true }).click();
          if (name === 'portfolio-cash')
            await page
              .getByRole('heading', { name: '现金余额', exact: true })
              .locator('..')
              .getByRole('button', { name: '编辑', exact: true })
              .click();
          if (name === 'cash-plan-edit') {
            await page.getByRole('button', { name: '管理计划：隔离固定入账', exact: true }).click();
            await page.getByRole('menuitem', { name: '修改计划', exact: true }).click();
          }
          const sheet = page.locator('[data-slot=sheet-content]').last();
          await sheet.waitFor();
          await page.addStyleTag({
            content:
              '[data-slot="sheet-content"], [data-slot="sheet-content"] * { transition-duration: 0s; animation-duration: 0s; }',
          });
          await page.evaluate(() =>
            Promise.all(
              document
                .getAnimations()
                .filter((a) => a.effect.getTiming().iterations !== Infinity)
                .map((a) => a.finished.catch(() => {})),
            ),
          );
          if (name === 'import-draft-success')
            await sheet
              .getByRole('navigation', { name: '导入草稿列表' })
              .getByRole('button')
              .first()
              .click();
          if (name === 'observation') {
            const original = await sheet.locator('#cash-observation-amount').inputValue();
            await sheet.getByRole('button', { name: '记录现金快照', exact: true }).click();
            await sheet.locator('[data-slot=field-error]').waitFor();
            assert.equal(await sheet.locator('#cash-observation-amount').inputValue(), original);
          }
          if (['body', 'whole', 'bottom'].includes(name)) {
            await sheet.getByRole('button', { name: '受控错误', exact: true }).click();
            await sheet.getByRole('alert').waitFor();
          }
          if (name === 'reconciliation')
            await sheet.getByRole('button', { name: /510300.SH/ }).click();
          if (name === 'research-detail-long') {
            const details = sheet.locator('details');
            if (await details.count()) await details.locator('summary').click();
          }
          if (name === 'strategy-json') await sheet.getByRole('tab', { name: /JSON/ }).click();
          if (name === 'execution-edit')
            await sheet.getByRole('button', { name: '添加费用', exact: true }).click();
          if (name === 'account-manager') {
            const create = sheet.getByRole('button', { name: '创建账户', exact: true });
            if (await create.count()) await create.click();
          }
          await page.keyboard.press('Tab');
          const controls = sheet.locator(
            'input:not([disabled]):not([type=hidden]),textarea:not([disabled]),button:not([disabled]),a[href],[role="checkbox"],[role="switch"]',
          );
          const focuses = [];
          for (let i = 0; i < (await controls.count()); i++) {
            const control = controls.nth(i);
            if (
              !(await control.isVisible()) ||
              (await control.evaluate(
                (e) => e.getBoundingClientRect().width < 4 || e.getBoundingClientRect().height < 4,
              ))
            )
              continue;
            await page.keyboard.press('Tab');
            await control.focus();
            if (!(await control.evaluate((el) => document.activeElement === el))) continue;
            await control.evaluate((el) => {
              const ring =
                el.closest(
                  '[data-slot="input-group"], [data-slot="date-input"], [data-slot="combobox-input-group"]',
                ) || el;
              ring.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            });
            await page.evaluate(() => new Promise(requestAnimationFrame));
            const m = await control.evaluate((el) => {
              let ring = el;
              for (
                let p = el;
                p && p !== el.closest('[data-slot=sheet-content]');
                p = p.parentElement
              ) {
                if (
                  Math.max(
                    0,
                    ...Array.from(
                      getComputedStyle(p).boxShadow.matchAll(/0px 0px 0px ([0-9.]+)px/g),
                      (match) => Number(match[1]),
                    ),
                  ) > 0
                ) {
                  ring = p;
                  break;
                }
              }
              const rr = ring.getBoundingClientRect(),
                clips = [];
              for (
                let p = ring.parentElement;
                p && p !== document.body && p !== document.documentElement;
                p = p.parentElement
              ) {
                const st = getComputedStyle(p),
                  r = p.getBoundingClientRect();
                if (/auto|hidden|scroll|clip/.test(st.overflowX))
                  clips.push({
                    axis: 'x',
                    start: rr.left - r.left - p.clientLeft,
                    end: r.left + p.clientLeft + p.clientWidth - rr.right,
                    slot: p.dataset.slot || p.tagName,
                    viewportSize: p.clientHeight,
                  });
                if (/auto|hidden|scroll|clip/.test(st.overflowY))
                  clips.push({
                    axis: 'y',
                    start: rr.top - r.top - p.clientTop,
                    end: r.top + p.clientTop + p.clientHeight - rr.bottom,
                    slot: p.dataset.slot || p.tagName,
                    viewportSize: p.clientHeight,
                  });
              }
              return {
                name:
                  el.id ||
                  el.getAttribute('aria-label') ||
                  el.textContent?.trim().slice(0, 40) ||
                  el.tagName,
                shadow: getComputedStyle(ring).boxShadow,
                focusVisible: el.matches(':focus-visible'),
                clips,
              };
            });
            const spread = Math.max(
              0,
              ...Array.from(m.shadow.matchAll(/0px 0px 0px ([0-9.]+)px/g), (match) =>
                Number(match[1]),
              ),
            );
            let oversizedEdges = null;
            if (m.clips.some((c) => c.axis === 'y' && c.start + c.end < 0)) {
              oversizedEdges = await control.evaluate((el) => {
                let parent = el.parentElement;
                while (parent && !/auto|scroll/.test(getComputedStyle(parent).overflowY))
                  parent = parent.parentElement;
                if (!parent) return null;
                parent.scrollTop +=
                  el.getBoundingClientRect().top -
                  parent.getBoundingClientRect().top -
                  parent.clientTop -
                  8;
                const top =
                  el.getBoundingClientRect().top -
                  parent.getBoundingClientRect().top -
                  parent.clientTop;
                parent.scrollTop +=
                  el.getBoundingClientRect().bottom -
                  parent.getBoundingClientRect().top -
                  parent.clientTop -
                  parent.clientHeight +
                  8;
                const bottom =
                  parent.getBoundingClientRect().top +
                  parent.clientTop +
                  parent.clientHeight -
                  el.getBoundingClientRect().bottom;
                return { top, bottom };
              });
              assert(
                oversizedEdges && oversizedEdges.top >= 2 && oversizedEdges.bottom >= 2,
                JSON.stringify({ focus: m.name, oversizedEdges }),
              );
            }
            const bad = m.clips.filter((c) => {
              if (c.axis === 'y' && c.start + c.end < 0) return false;
              return c.start < spread - 0.75 || c.end < spread - 0.75;
            });
            focuses.push({
              name: m.name,
              oversizedEdges,
              ring: spread,
              focusVisible: m.focusVisible,
              shadow: m.shadow,
              minimumClearance: Math.min(...m.clips.flatMap((c) => [c.start, c.end])),
            });
            assert.equal(bad.length, 0, JSON.stringify({ focus: m.name, spread, bad }));
          }
          const geometry = await sheet.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const bodies = [
              ...el.querySelectorAll('[data-slot=sheet-body],form .overflow-y-auto'),
            ].filter((b) => getComputedStyle(b).overflowY === 'auto');
            const footers = [...el.querySelectorAll('[data-slot=sheet-footer],form > .border-t')];
            return {
              rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
              bodyFooter: bodies.flatMap((b) =>
                footers
                  .filter((f) => b.parentElement === f.parentElement)
                  .map((f) => ({
                    bodyBottom: b.getBoundingClientRect().bottom,
                    footerTop: f.getBoundingClientRect().top,
                  })),
              ),
              overflow: el.scrollWidth > el.clientWidth + 1,
            };
          });
          assert(
            geometry.rect.left >= -0.6 &&
              geometry.rect.right <= width + 0.6 &&
              geometry.rect.top >= -0.6 &&
              geometry.rect.bottom <= height + 0.6,
            JSON.stringify(geometry),
          );
          assert.equal(geometry.overflow, false, 'Drawer 横向内容超出');
          for (const g of geometry.bodyFooter)
            assert(g.bodyBottom <= g.footerTop - 3, JSON.stringify(g));
          assert.deepEqual(runtimeErrors, []);
          if (width === 390 || process.env.DRAWER_QA_SCREENSHOTS === 'all')
            await page.screenshot({ path: `${out}/${label}-${width}-${height}.png` });
          const close = sheet.locator('[data-slot=sheet-close]').last();
          if (await close.count()) await close.click();
          else await sheet.getByRole('button', { name: '关闭研究详情', exact: true }).click();
          const confirm = page.getByRole('alertdialog');
          if (await confirm.count()) {
            const discard = confirm
              .getByRole('button', { name: /放弃.*关闭|放弃修改|关闭面板/ })
              .last();
            if (await discard.count()) await discard.click();
          }
          await sheet.waitFor({ state: 'hidden' });
          const result = { scenario, width, height, focuses, geometry, close: true };
          results.push(result);
          console.log(
            JSON.stringify({ scenario, width, height, focused: focuses.length, pass: true }),
          );
        } catch (error) {
          const failure = { scenario, width, height, error: String(error), runtimeErrors };
          failures.push(failure);
          await page
            .screenshot({ path: `${out}/FAILED-${label}-${width}-${height}.png` })
            .catch(() => {});
          console.log(JSON.stringify(failure));
        }
        writeFileSync(
          out + '/results.json',
          JSON.stringify({ results, failures, requests }, null, 2),
        );
      }
  await browser.close();
  console.log(
    'DONE ' +
      JSON.stringify({
        passed: results.length,
        failed: failures.length,
        focused: results.reduce((n, r) => n + r.focuses.length, 0),
      }),
  );
  if (failures.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
