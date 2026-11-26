import { launchRegressionBrowser } from '../runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const origin = process.env.RISK_RULE_QA_ORIGIN ?? 'http://127.0.0.1:5173';
const output = process.env.RISK_RULE_QA_OUTPUT ?? '/tmp/risk-notification-unification-qa';
const fixture = JSON.parse(
  await readFile(
    new URL('../../../../apps/desktop/test/fixtures/experiment-risk-ui-recovery.json', import.meta.url),
    'utf8',
  ),
);
const availableRoutes = [
  { provider: '主要通知', channel: 'feishu', priority: 1 },
  { provider: '备用通知', channel: 'feishu', priority: 2 },
];
await mkdir(output, { recursive: true });
const browser = await launchRegressionBrowser();
const results = [];
let activePage;
try {
  for (const width of [1440, 1024, 768, 390]) {
    for (const mode of ['manual-create', 'manual-edit', 'provider-create', 'provider-edit', 'notification-list']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      activePage = page;
      page.setDefaultTimeout(10000);
      const errors = [],
        submissions = [],
        unexpected = [];
      let data,
        fail = true;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const request = route.request(),
            path = new URL(request.url()).pathname;
          if (path.endsWith('/accounts'))
            return route.fulfill({ json: [{ ...fixture.account, institution: null }] });
          if (path.endsWith('/routing/risk'))
            return route.fulfill({
              json: { availableRoutes, selectedProviders: ['主要通知'], updatedAt: null },
            });
          if (path.includes('routing')) return route.fulfill({ json: { routes: availableRoutes } });
          if (path.endsWith('/risk-applications/preview'))
            return route.fulfill({ json: data.preview });
          if (path.includes('/risk-applications') && request.method() === 'GET')
            return route.fulfill({ json: [] });
          if (mode === 'notification-list' && request.method() === 'GET' && ['/api/v1/risk/rules', '/api/v1/risk/events', '/api/v1/notifications'].includes(path))
            return route.fulfill({ json: [] });
          if (
            request.method() !== 'GET' &&
            (path.includes('/risk/rules') || path.includes('/risk-applications'))
          ) {
            const body = request.postDataJSON();
            submissions.push(body);
            if (fail) {
              fail = false;
              return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
            }
            const base = mode.startsWith('manual') ? data.manual : data.application;
            return route.fulfill({ json: { ...base, ...body, version: 2, revision: 2 } });
          }
          unexpected.push(request.method() + ' ' + path);
          return route.abort();
        },
      );
      await page.goto(`${origin}/test/browser-strategy-rule-notification.html?mode=${mode}`);
      data = await page.evaluate(async () => {
        const f = await import('/test/strategy-rule-notification.fixture.ts');
        return {
          preview: f.rulePreview,
          application: f.ruleApplication,
          manual: f.manualNotificationRule,
        };
      });
      if (mode === 'notification-list') {
        await page.getByRole('tab', { name: '通知', exact: true }).waitFor();
        assert.equal(await page.getByRole('tab', { name: '通知', exact: true }).getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('input[aria-label="通知提供方"]').count(), 0);
        assert.equal(await page.getByRole('button', { name: '保存', exact: true }).count(), 0);
        await page.screenshot({ path: `${output}/${mode}-${width}.png`, fullPage: true, animations: 'disabled' });
        assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
        results.push({ width, mode, status: '通过', submissions: 0 });
        await page.close(); continue;
      }
      const manual = mode.startsWith('manual');
      if (mode === 'manual-create') {
        await page.locator('#risk-rule-symbol').click();
        await page.getByRole('option', { name: /510300.SH/ }).click();
        await page.locator('#risk-rule-threshold').fill('10');
      }
      if (mode === 'provider-create')
        await page.getByRole('button', { name: '通知设置', exact: true }).click();
      const cooldown = manual
        ? page.locator('input[aria-label="通知冷却时间（分钟）"]')
        : page.locator('input[max="10080"]').first();
      let expectedCooldown = '30';
      if (mode === 'manual-edit') expectedCooldown = '90';
      else if (mode === 'provider-edit') expectedCooldown = '60';
      assert.equal(await cooldown.inputValue(), expectedCooldown);
      await cooldown.fill('0');
      const provider = page.locator('input[aria-label="通知提供方"]');
      for (const name of ['主要通知', '备用通知']) {
        const remove = page.getByRole('button', { name: `移除 ${name}（飞书）`, exact: true });
        if (await remove.count()) await remove.click();
      }
      await provider.fill('备用');
      await page.getByRole('option', { name: '备用通知（飞书）', exact: true }).click();
      await cooldown.click();
      if (mode === 'provider-edit')
        await page.getByRole('switch', { name: '策略风险应用通知', exact: true }).click();
      if (mode === 'provider-create')
        await page.getByRole('button', { name: '预览风险规则', exact: true }).click();
      let saveLabel = '保存为停用';
      if (mode === 'manual-create') saveLabel = '创建规则';
      else if (mode === 'manual-edit') saveLabel = '保存修改';
      else if (mode === 'provider-edit') saveLabel = '保存通知配置';
      const save = page.getByRole('button', { name: saveLabel, exact: true });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({
        path: `${output}/${mode}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await Promise.all([
        page.waitForResponse(
          (response) => response.request().method() !== 'GET' && response.status() === 503,
        ),
        save.click(),
      ]);
      assert.equal(await cooldown.inputValue(), '0');
      assert.equal(
        await page.getByRole('button', { name: '移除 备用通知（飞书）', exact: true }).count(),
        1,
      );
      await save.click();
      if (manual) await page.getByText('规则已保存', { exact: true }).waitFor();
      else if (mode === 'provider-create')
        await page.getByText('返回策略版本', { exact: true }).waitFor();
      else await page.getByText('配置已保存', { exact: true }).waitFor();
      assert.equal(submissions.length, 2);
      for (const body of submissions)
        assert.deepEqual(body.notification, {
          ...body.notification,
          cooldownMinutes: 0,
          providers: ['备用通知'],
        });
      if (manual) {
        await page.getByRole('button', { name: '编辑已保存规则', exact: true }).click();
        assert.equal(await cooldown.inputValue(), '0');
        assert.equal(
          await page.getByRole('button', { name: '移除 备用通知（飞书）', exact: true }).count(),
          1,
        );
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      results.push({ width, mode, status: '通过', submissions: submissions.length });
      await page.close();
    }
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  console.error((await activePage?.locator('body').innerText())?.slice(-2500));
  await activePage?.screenshot({
    path: `${output}/failure.png`,
    fullPage: true,
    animations: 'disabled',
  });
  throw error;
} finally {
  await browser.close();
}
