const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.SNAPSHOT_QA_OUTPUT || '/tmp/rule-monitor-snapshots-qa';
const origin = process.env.SNAPSHOT_QA_URL || 'http://localhost:5173';
const modes = (process.env.SNAPSHOT_QA_MODES || 'live,sample,legacy,failure,single,limit').split(
  ',',
);
const hashes = ['b', 'a', 'c'].map((value) => value.repeat(64));
const texts = Object.fromEntries(
  hashes.map((hash, index) => [
    hash,
    `收费比例0.${index + 1}%\n${'正文说明'.repeat(40)}\n<img src=x onerror=unexpected()>`,
  ]),
);
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SNAPSHOT_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      for (const mode of modes) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: 'reduce',
        });
        const writes = [],
          errors = [],
          reads = [];
        let status, detail;
        let allowRetry = false;
        let refreshBarrier = null;
        let releaseRefresh;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/api/**', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          const root = '/api/market-data/rule-monitor';
          if (refreshBarrier && [root + '/versions', root + '/version'].includes(url.pathname))
            await refreshBarrier;
          if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            writes.push(request.method() + ' ' + url.pathname);
            return route.abort();
          }
          if (url.pathname === root) {
            const response = await route.fetch();
            status = await response.json();
            return route.fulfill({ response });
          }
          if (url.pathname === root + '/versions' && mode !== 'live') {
            const versions = (mode === 'single' ? hashes.slice(0, 1) : hashes).map(
              (hash, index) => ({
                contentHash: hash,
                rawHash: hash,
                datasetId: null,
                firstSeenAt: `2026-11-0${9 - index}T00:00:00Z`,
                lastSeenAt: `2026-11-0${9 - index}T00:00:00Z`,
              }),
            );
            return route.fulfill({
              json: {
                version: 'rule-source-monitor-v1',
                kind: url.searchParams.get('kind'),
                identity: url.searchParams.get('identity'),
                versions,
              },
            });
          }
          if (url.pathname === root + '/version') {
            reads.push(Object.fromEntries(url.searchParams));
            if (mode === 'live') {
              const response = await route.fetch();
              detail = await response.json();
              return route.fulfill({ response });
            }
            if (mode === 'failure' && !allowRetry)
              return route.fulfill({ status: 503, json: { message: '受控读取失败' } });
            const selected = url.searchParams.get('contentHash'),
              base = url.searchParams.get('baseHash');
            if (selected === hashes[1]) await new Promise((resolve) => setTimeout(resolve, 250));
            detail = {
              version: 'rule-source-monitor-v1',
              kind: url.searchParams.get('kind'),
              identity: url.searchParams.get('identity'),
              contentHash: selected,
              snapshot:
                mode === 'legacy'
                  ? {
                      status: 'unavailable',
                      format: null,
                      text: null,
                      capturedAt: null,
                      reason: 'legacy_missing',
                    }
                  : {
                      status: 'available',
                      format: 'html',
                      text: texts[selected],
                      capturedAt: '2026-11-10T00:00:00Z',
                      reason: null,
                    },
              comparison: base
                ? {
                    baseHash: base,
                    status: 'available',
                    reason: null,
                    added: 1,
                    removed: 1,
                    lines: [
                      { type: 'removed', text: texts[base].split('\n')[0] },
                      { type: 'added', text: texts[selected].split('\n')[0] },
                    ],
                  }
                : null,
            };
            if (base && ['legacy', 'limit'].includes(mode))
              detail.comparison = {
                baseHash: base,
                status: 'unavailable',
                reason: mode === 'legacy' ? 'snapshot_unavailable' : 'diff_too_large',
                added: 0,
                removed: 0,
                lines: [],
              };
            return route.fulfill({ json: detail });
          }
          return route.continue();
        });
        try {
          await page.goto(origin + '/market-data?section=monitor');
          const panel = page.locator('section[aria-label="收费资料更新监测"]');
          await panel.locator('tbody tr').first().waitFor();
          const item =
            status.observations.find(
              (item) =>
                item.kind === 'document' && item.versionCount > 0 && /FINRA.*Q100/.test(item.name),
            ) ||
            status.observations.find((item) => item.kind === 'document' && item.versionCount > 0);
          assert(item);
          const trigger = panel
            .locator('tbody tr')
            .filter({ hasText: item.name })
            .getByRole('button', { name: /查看版本/ });
          await trigger.click();
          const sheet = page.getByRole('dialog', { name: '资料版本记录' });
          if (mode === 'failure') {
            await sheet.getByRole('button', { name: '重试读取正文' }).waitFor();
            allowRetry = true;
            await sheet.getByRole('button', { name: '重试读取正文' }).click();
          }
          await sheet.getByRole('tab', { name: '正文快照', exact: true }).waitFor();
          if (mode === 'sample' || mode === 'failure') {
            await sheet
              .getByText('相对比较基准，新增 1 行，删除 1 行。', { exact: true })
              .waitFor();
            await sheet.locator('[data-slot="select-trigger"]').nth(1).click();
            await page.getByRole('option').filter({ hasText: 'cccccccccccc' }).click();
            await page.waitForFunction(() =>
              document.querySelector('[aria-label="正文差异"]')?.textContent.includes('0.3%'),
            );
            await sheet.locator('[data-slot="select-trigger"]').first().click();
            await page.getByRole('option').filter({ hasText: 'aaaaaaaaaaaa' }).click();
            await sheet.getByRole('tab', { name: '正文快照', exact: true }).click();
            await sheet.locator('pre').filter({ hasText: '收费比例0.2%' }).waitFor();
            assert.equal(await sheet.locator('pre img').count(), 0);
            assert.equal(reads.at(-1).contentHash, hashes[1]);
            assert.equal(reads.at(-1).baseHash, hashes[0]);
          } else if (mode === 'legacy') {
            await sheet.getByText('所选版本或比较基准缺少正文快照', { exact: false }).waitFor();
            await sheet.getByRole('tab', { name: '正文快照', exact: true }).click();
            await sheet.getByText('无法还原更早时点的原文', { exact: false }).waitFor();
          } else if (mode === 'limit') {
            await sheet.getByText('两个版本的比较内容超过上限', { exact: false }).waitFor();
          } else {
            await sheet.getByRole('tab', { name: '正文快照', exact: true }).click();
            if (mode === 'single' || detail.snapshot.status === 'available')
              await sheet.locator('pre').waitFor();
            else await sheet.getByText('无法还原更早时点的原文', { exact: false }).waitFor();
          }
          await page.screenshot({ path: `${output}/${mode}-${width}.png` });
          const geometry = await sheet.evaluate((element) => {
            const r = element.getBoundingClientRect(),
              body = element.querySelector('[data-slot="sheet-body"]');
            return {
              left: r.left,
              right: r.right,
              pageWidth: document.documentElement.scrollWidth,
              bodyWidth: body.clientWidth,
              bodyScrollWidth: body.scrollWidth,
            };
          });
          assert(geometry.left >= -1 && geometry.right <= width + 1 && geometry.pageWidth <= width);
          assert(geometry.bodyScrollWidth <= geometry.bodyWidth + 1, JSON.stringify(geometry));
          await page.keyboard.press('Escape');
          await sheet.waitFor({ state: 'hidden' });
          if (mode === 'sample')
            refreshBarrier = new Promise((resolve) => {
              releaseRefresh = resolve;
            });
          await trigger.focus();
          await page.keyboard.press('Enter');
          await sheet.waitFor();
          if (mode === 'sample') {
            await sheet.locator('[data-slot="list-refresh"]').waitFor();
            assert.equal(await sheet.locator('[data-slot="list-refresh"]').count(), 1);
            assert.equal(
              await sheet.getByRole('tab', { name: '正文快照', exact: true }).count(),
              1,
            );
            releaseRefresh();
            refreshBarrier = null;
            await sheet.locator('[data-slot="list-refresh"]').waitFor({ state: 'hidden' });
          }
          await sheet.getByRole('button', { name: '关闭', exact: true }).click();
          await sheet.waitFor({ state: 'hidden' });
          assert.deepEqual(errors, []);
          assert.deepEqual(writes, []);
          results.push({
            width,
            mode,
            requests: reads.length,
            snapshot: detail.snapshot.status,
            geometry,
            errors,
            writes,
          });
          console.log(JSON.stringify(results.at(-1)));
        } catch (error) {
          await page.screenshot({ path: `${output}/failure-${mode}-${width}.png` });
          console.error(
            await page.locator('[data-slot="select-trigger"]').evaluateAll((elements) =>
              elements.map((element) => ({
                text: element.textContent,
                role: element.getAttribute('role'),
                label: element.getAttribute('aria-label'),
                labelledBy: element.getAttribute('aria-labelledby'),
              })),
            ),
          );
          throw error;
        } finally {
          releaseRefresh?.();
          await page.close();
        }
      }
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
