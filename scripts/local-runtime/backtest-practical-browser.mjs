import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDesktopHost, launchRegressionBrowser, root } from './browser/runtime.mjs';
import { practicalBrowserSamples } from './backtest-practical-browser-samples.mjs';

// 仅登记本地受控API，实际业务组件、Query和共享Schema均使用当前源码。
const output = resolve(process.argv[2] ?? 'var/acceptance/backtest-practical-20261120/browser');
await mkdir(output, { recursive: true });
// 与已有浏览器总入口一致，关闭仅供开发定位的Inspector子进程。
process.env.VITEST = 'true';
const runtime = resolve(root, 'apps/mobile/test/browser-backtest-practical-runtime.ts');
const host = await createDesktopHost(resolve(output, 'vite-cache'), { aliases: [
  { find: '/__backtest-practical-mobile__', replacement: resolve(root, 'apps/mobile/test/browser-backtest-practical.tsx') },
  { find: /^(?:\.\.\/)+(?:app\/)?MobileRuntime$/, replacement: runtime },
  { find: /^@react-navigation\/native$/, replacement: runtime },
  { find: /^@react-native-async-storage\/async-storage$/, replacement: runtime },
  { find: /^expo-crypto$/, replacement: runtime },
  { find: /^(?:\.\.\/)+platform\/output\/export-file$/, replacement: runtime },
  { find: /^(?:\.\.\/)+platform\/charts\/MobileChart$/, replacement: resolve(root, 'apps/mobile/test/browser-ratio-native-chart.tsx') },
], entries: ['test/browser-backtest-practical.html', 'test/browser-backtest-practical-mobile.html'] });
const samples = await practicalBrowserSamples();
const protection = { version: 1, evaluation: 'barClose', stages: [], initialStop: { kind: 'percent', percent: '0.05' } };
const oldOrdinary = structuredClone(samples.strategyRecord.versions[0].schema);
delete oldOrdinary.entryTrigger; delete oldOrdinary.tradePlan;
const oldPlanned = { ...structuredClone(oldOrdinary), tradePlan: protection };
const browser = await launchRegressionBrowser();
const evidence = [];
try {
  for (const mobile of [false, true]) for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = [], requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(12_000);
    let state = structuredClone(samples.base), blocked = false;
    let submission = null;
    let savedPolicy = null;
    let holdNextRead = false, releaseRead, readStarted, readDelivered;
    const entry = `/test/browser-backtest-practical${mobile ? '-mobile' : ''}.html`;
    await page.addInitScript(({ id, model, oldOrdinary, oldPlanned }) => {
      window.practicalRunId = new URLSearchParams(location.search).get('run') ?? id;
      window.practicalModel = model;
      window.practicalEditingStrategy = new URLSearchParams(location.search).get('plan') === '1' ? oldPlanned : oldOrdinary;
    }, { id: samples.id, model: samples.model, oldOrdinary, oldPlanned });
    await page.route('**/api/v1/**', async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const body = request.postDataJSON();
      requests.push({ method: request.method(), path });
      const reply = (json) => route.fulfill({ json });
      if (path.includes('/groups')) return reply({ items: [], totalCount: 0, pageInfo: { nextCursor: null, hasNextPage: false } });
      if (path.endsWith('/strategies')) {
        if (new URL(page.url()).searchParams.get('view') === 'policy') return reply([{ ...samples.strategyRecord,
          versions: [{ ...samples.strategyRecord.versions[0], schema: new URL(page.url()).searchParams.get('plan') === '1' ? oldPlanned : oldOrdinary }] }]);
        return reply([samples.strategyRecord]);
      }
      if (path.endsWith('/versions') && request.method() === 'POST') {
        savedPolicy = body.schema;
        return reply({ ...samples.strategyRecord.versions[0], id: samples.childId, version: 2, schema: body.schema });
      }
      if (path.endsWith('/execution-model')) return reply({ status: 'available', model: samples.model, policy: 'research-defaults', notes: [] });
      if (path.endsWith('/strategy-submissions')) {
        if (request.method() === 'GET') return reply(submission ? [submission] : []);
        submission = { id: body.id, kind: 'ordinary', state: 'submitted', createdAt: '2026-11-20T08:00:00Z',
          prepared: samples.prepared, outcome: { id: samples.id } };
        return reply(submission);
      }
      if (path.endsWith('/prepare')) {
        if (blocked) return reply({ ...samples.blocked, requestId: body.requestId });
        return reply({ ...samples.prepared, requestId: body.requestId, executionPreflight: { ...samples.ready, requestId: body.requestId } });
      }
      if (path.endsWith('/preflight')) return reply({ ...samples.ready, requestId: body.requestId });
      if (path.endsWith('/cancel')) { state = { ...state, cancelRequestedAt: '2026-11-20T08:01:01Z', updatedAt: '2026-11-20T08:01:01Z' }; return reply(state); }
      if (path.endsWith('/retry')) { state = { ...samples.base, id: samples.childId, replayOfRunId: samples.id, status: 'queued', stage: 'queued', executionAttempt: 0 }; return reply(state); }
      if (path.includes('/runs/') && request.method() === 'GET') {
        if (holdNextRead) {
          holdNextRead = false;
          const old = structuredClone(state);
          const gate = new Promise((done) => { releaseRead = done; });
          readStarted();
          await gate;
          await reply(old);
          readDelivered();
          return;
        }
        return reply(state);
      }
      if (path.endsWith('/runs') && request.method() === 'POST') { state = { ...samples.base, status: 'queued', stage: 'queued', executionAttempt: 0 }; return reply(state); }
      errors.push(`未登记的隔离请求：${request.method()} ${path}`);
      return route.abort('blockedbyclient');
    });
    const capture = async (name) => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}/${width}页面横向溢出`);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: resolve(output, `${mobile ? 'mobile' : 'desktop'}-${width}-${name}.png`), fullPage: true });
    };
    try {
      if (process.env.BACKTEST_BROWSER_SECTION === 'late') {
        await page.goto(host.origin + entry);
        await page.getByText('正在准备快照', { exact: false }).first().waitFor();
        const started = new Promise((done) => { readStarted = done; });
        const delivered = new Promise((done) => { readDelivered = done; });
        holdNextRead = true;
        await page.evaluate(() => { void window.practicalRefresh(); });
        await started;
        await page.getByRole('button', { name: mobile ? '取消当前回测' : '取消', exact: true }).click();
        await page.getByText('正在取消', { exact: true }).first().waitFor();
        releaseRead();
        await delivered;
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        await page.getByText('正在取消', { exact: true }).first().waitFor();
        state = { ...state, status: 'cancelled', stage: 'cancelled', updatedAt: '2026-11-20T08:02:00Z' };
        await page.evaluate(() => window.practicalRefresh());
        await page.getByText('已取消', { exact: true }).first().waitFor();
        state = structuredClone(samples.base);
        await page.evaluate(() => window.practicalRefresh());
        await page.getByText('已取消', { exact: true }).first().waitFor();
        assert.equal(requests.filter((request) => request.path.endsWith('/cancel')).length, 1);
        await capture('late-response-protected');
        evidence.push({ client: mobile ? 'Mobile RN Web' : 'Desktop', width, lateReadDidNotClearCancellation: true, lateRunningDidNotReplaceTerminal: true, errors });
        console.log(JSON.stringify({ client: mobile ? 'mobile' : 'desktop', width, lateResponsePassed: true }));
        continue;
      }
      if (process.env.BACKTEST_BROWSER_SECTION === 'policy') {
        for (const plan of [false, true]) {
          const expected = plan ? 'while-flat' : 'rising-edge';
          await page.goto(host.origin + entry + `?view=policy&plan=${plan ? '1' : '0'}`);
          if (mobile) await page.getByRole('radio', { name: '高级 JSON', exact: true }).click();
          else await page.getByRole('tab', { name: '高级 JSON', exact: true }).click();
          const json = mobile ? page.getByRole('textbox', { name: '完整策略 JSON', exact: true }) : page.locator('#strategy-json');
          await json.waitFor();
          const definition = JSON.parse(await json.inputValue());
          assert.equal(definition.entryTrigger, expected);
          definition.tradePlan = structuredClone(protection);
          definition.tradePlan.initialStop.percent = '0.10';
          await json.fill(JSON.stringify(definition, null, 2));
          if (!mobile) await page.getByRole('button', { name: '应用 JSON', exact: true }).click();
          await page.getByText(/入场政策：/).first().waitFor();
          await page.getByRole('button', { name: mobile ? '确认保存新版本' : '保存为新版本', exact: true }).click();
          if (mobile) {
            await page.getByText(/服务端已确认保存/).first().waitFor();
            assert.equal(savedPolicy.entryTrigger, expected);
          } else {
            assert.equal(JSON.parse(await page.getByTestId('saved-policy').textContent()).entryTrigger, expected);
          }
          await capture(`policy-${expected}`);
          await page.evaluate(() => localStorage.clear());
        }
        evidence.push({ client: mobile ? 'Mobile RN Web' : 'Desktop', width, policies: ['rising-edge', 'while-flat'], protectedEditPreserved: true, errors });
        console.log(JSON.stringify({ client: mobile ? 'mobile' : 'desktop', width, policyPassed: true }));
        continue;
      }
      await page.goto(host.origin + entry);
      await page.getByText('正在准备快照', { exact: false }).first().waitFor();
      const cancel = page.getByRole('button', { name: mobile ? '取消当前回测' : '取消', exact: true });
      await cancel.click();
      await page.getByText('正在取消', { exact: true }).first().waitFor();
      assert.equal(await cancel.isDisabled(), true);
      assert.equal(requests.filter((request) => request.path.endsWith('/cancel')).length, 1);
      await capture('cancelling');
      state = { ...samples.base, status: 'failed', stage: 'preparing', errorCode: 'PREPARATION_STALE', errorSummary: '准备戳已变化，请重新准备原策略。' };
      await page.reload();
      await page.getByText(/准备戳已变化/).first().waitFor();
      await capture('failed');
      await page.getByRole('button', { name: '使用冻结输入重试', exact: true }).click();
      await page.getByText('等待执行', { exact: true }).first().waitFor();
      await page.getByText('查看原冻结输入Run', { exact: true }).first().waitFor();
      await capture('linked-run');
      state = structuredClone(samples.succeeded);
      await page.goto(host.origin + entry);
      await page.getByText('15000 CNY', { exact: false }).first().waitFor();
      await page.getByText('150.00%', { exact: false }).first().waitFor();
      await page.getByText('条件未成立10次', { exact: false }).first().waitFor();
      await page.getByText(/收益波动为零/).first().waitFor();
      await capture('result');
      if (!mobile) for (const tab of ['交易与订单', '数据与假设', '诊断与复现', '结果概览'])
        await page.getByRole('tab', { name: tab, exact: true }).click();
      await page.goto(host.origin + entry + '?view=prepare');
      if (mobile) {
        await page.getByRole('textbox', { name: '回测开始日期', exact: true }).fill('2024-01-02');
        await page.getByRole('textbox', { name: '回测结束日期', exact: true }).fill('2024-03-29');
        await page.getByRole('textbox', { name: '初始资金', exact: true }).fill('10000');
      }
      const prepare = page.getByRole('button', { name: mobile ? '准备并预检回测配置' : '准备并核对配置', exact: true });
      blocked = true;
      await prepare.click();
      await page.getByText(/volume二十根连续输入/).first().waitFor();
      if (mobile) assert.equal(await page.getByRole('textbox', { name: '初始资金', exact: true }).inputValue(), '10000');
      await capture('required-missing');
      blocked = false;
      await prepare.click();
      await page.getByText(/本次未取得原价参考/).first().waitFor();
      await page.getByText(/未开放成交量输入/).first().waitFor();
      await capture('price-only-prepared');
      if (mobile) {
        const create = page.getByRole('button', { name: '确认冻结并创建回测', exact: true });
        assert.equal(await create.isDisabled(), false);
        await create.click();
        await page.getByText(/服务端已确认 Run/).first().waitFor();
      } else {
        const create = page.getByRole('button', { name: '准备并开始回测', exact: true });
        assert.equal(await create.isDisabled(), false);
        await create.click();
        await page.getByText(/回测.*提交|任务.*创建|已创建|查看任务/).first().waitFor();
      }
      evidence.push({ client: mobile ? 'Mobile RN Web' : 'Desktop', width, states: ['cancelling', 'failed', 'linked-run', 'result', 'required-missing', 'price-only-prepared'], requests, errors });
      console.log(JSON.stringify({ client: mobile ? 'mobile' : 'desktop', width, passed: true }));
    } catch (error) {
      console.error(error);
      await writeFile(resolve(output, 'failure.txt'), `${error.stack}\n${(await page.locator('body').innerText()).slice(-10000)}`);
      await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
      throw error;
    } finally { await page.close(); }
  }
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify({ modelCalls: 0, nativeCharts: '未在RN Web中验收', cases: evidence }, null, 2));
} finally { await browser.close(); await host.server.close(); }
