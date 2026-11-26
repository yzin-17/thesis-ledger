import { launchRegressionBrowser } from '../runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const origin = process.env.RISK_RULE_QA_ORIGIN ?? 'http://127.0.0.1:5173';
const output = process.env.RISK_RULE_QA_OUTPUT ?? '/tmp/strategy-rule-notification-qa';
const fixture = JSON.parse(
  await readFile(
    new URL('../../../../apps/desktop/test/fixtures/experiment-risk-ui-recovery.json', import.meta.url),
    'utf8',
  ),
);
await mkdir(output, { recursive: true });
const browser = await launchRegressionBrowser();
const results = [];
let activePage;
let activeErrors = [];
let activeUnexpected = [];
try {
  for (const width of process.env.RISK_RULE_QA_WIDTH
    ? [Number(process.env.RISK_RULE_QA_WIDTH)]
    : [1440, 1024, 768, 390]) {
    for (const mode of process.env.RISK_RULE_QA_MODE
      ? [process.env.RISK_RULE_QA_MODE]
      : ['create', 'editor', 'close', 'close-clean', 'close-route']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      activePage = page;
      page.setDefaultTimeout(10000);
      const errors = [],
        submissions = [],
        unexpected = [];
      activeErrors = errors;
      activeUnexpected = unexpected;
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
          if (path.endsWith('/routing/risk')) return route.fulfill({ json: { availableRoutes: [], selectedProviders: [], updatedAt: null } });
          if (path.includes('routing')) return route.fulfill({ json: { routes: [] } });
          if (path.endsWith('/risk-applications/preview'))
            return route.fulfill({ json: data.preview });
          if (path.includes('/risk-applications') && request.method() === 'GET')
            return route.fulfill({ json: [] });
          if (path.includes('/risk-applications') && ['POST', 'PATCH'].includes(request.method())) {
            const body = request.postDataJSON();
            submissions.push(body);
            if (fail) {
              fail = false;
              return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
            }
            return route.fulfill({
              json: { ...data.application, ...body, revision: mode === 'editor' ? 2 : 1 },
            });
          }
          unexpected.push(request.method() + ' ' + path);
          return route.abort();
        },
      );
      await page.goto(`${origin}/test/browser-strategy-rule-notification.html?mode=${mode}`);
      data = await page.evaluate(async () => {
        const module = await import('/test/strategy-rule-notification.fixture.ts');
        return { preview: module.rulePreview, application: module.ruleApplication };
      });
      if (errors.length)
        throw new Error(JSON.stringify({ errors, text: await page.locator('body').innerText() }));
      await page.screenshot({ path: `${output}/${mode}-${width}-initial.png`, fullPage: true });
      if (mode === 'close-clean') {
        await page.getByRole('button', { name: '关闭', exact: true }).click();
        await page.getByText('返回策略版本', { exact: true }).waitFor();
        assert.equal(await page.getByRole('alertdialog').count(), 0);
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpected, []);
        results.push({ width, mode, result: '通过', submissions: submissions.length });
        await page.close();
        continue;
      }
      if (mode !== 'editor')
        await page.getByRole('button', { name: '预览风险规则', exact: true }).click();
      if (mode === 'close-route') {
        await page.locator('input[aria-label="成本止损冷却时间（分钟）"]').waitFor();
        await page.evaluate(() => window.riskCloseHarness.navigate('/outside'));
        const dialog = page.getByRole('alertdialog');
        await dialog.waitFor();
        await dialog.getByRole('button', { name: '继续编辑', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page.evaluate(() => window.riskCloseHarness.navigate('/outside'));
        await dialog.getByRole('button', { name: '放弃修改并离开', exact: true }).click();
        await page.getByText('受控其他页面', { exact: true }).waitFor();
        assert.equal(submissions.length, 0);
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpected, []);
        results.push({ width, mode, result: '通过', submissions: 0 });
        await page.close();
        continue;
      }
      if (mode === 'close') {
        const input = page.locator('input[aria-label="成本止损冷却时间（分钟）"]');
        await input.fill('35');
        const close = page.getByRole('button', { name: '关闭', exact: true });
        await close.click();
        const dialog = page.getByRole('alertdialog');
        await dialog.waitFor();
        assert.equal(await dialog.getByText('放弃未保存的修改？', { exact: true }).count(), 1);
        const box = await dialog.boundingBox();
        assert(
          box &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= width &&
            box.y + box.height <= 1000,
        );
        assert.equal(
          await page.getByText('当前配置或预览尚未保存，关闭后会丢失。', { exact: true }).count(),
          0,
        );
        await page.screenshot({
          path: `${output}/close-dialog-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        });
        await dialog.getByRole('button', { name: '继续编辑', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await input.inputValue(), '35');
        await close.click();
        await dialog.waitFor();
        await page.waitForFunction(() => document.activeElement?.closest('[role="alertdialog"]'));
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await input.inputValue(), '35');
        await close.click();
        await dialog.getByRole('button', { name: '放弃修改并关闭', exact: true }).click();
        await page.getByText('返回策略版本', { exact: true }).waitFor();
        assert.equal(submissions.length, 0);
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpected, []);
        results.push({ width, mode, result: '通过', submissions: 0 });
        await page.close();
        continue;
      }
      const severity = page.getByLabel('成本止损严重级别', { exact: true });
      await severity.click();
      await page.getByRole('option', { name: '严重', exact: true }).click();
      const cooldown = page.locator('input[aria-label="成本止损冷却时间（分钟）"]');
      await cooldown.fill('0');
      const holding = page.locator('input[aria-label="最大持有周期冷却时间（分钟）"]');
      await holding.fill('120');
      await holding.fill('10081');
      assert.equal(await holding.getAttribute('aria-invalid'), 'true');
      await holding.fill('120');
      await severity.focus();
      assert.equal(await severity.evaluate((node) => node === document.activeElement), true);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `${width} ${mode} 页面溢出`,
      );
      await page.screenshot({ path: `${output}/${mode}-${width}.png`, fullPage: true });
      const save = page.getByRole('button', {
        name: mode === 'create' ? '保存为停用' : '保存通知配置',
        exact: true,
      });
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/risk-applications') &&
            response.request().method() !== 'GET' &&
            response.status() === 503,
        ),
        save.click(),
      ]);
      assert.equal(await cooldown.inputValue(), '0');
      assert.equal(await holding.inputValue(), '120');
      await save.click();
      if (mode === 'create') await page.getByText('返回策略版本', { exact: true }).waitFor();
      else await page.getByText('配置已保存', { exact: true }).waitFor();
      assert.equal(submissions.length, 2);
      assert.deepEqual(submissions[0].notification.ruleOverrides, {
        [data.preview.plan.rules[0].sourceKey]: { severity: 'error', cooldownMinutes: 0 },
        [data.preview.plan.rules[1].sourceKey]: { cooldownMinutes: 120 },
      });
      assert.deepEqual(submissions[1].notification, submissions[0].notification);
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      results.push({ width, mode, result: '通过', submissions: submissions.length });
      await page.close();
    }
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} catch (error) {
  console.error(
    JSON.stringify({
      errors: activeErrors,
      unexpected: activeUnexpected,
      controls: await activePage?.locator('button,input').evaluateAll((nodes) =>
        nodes.map((node) => ({
          text: node.textContent?.slice(0, 50),
          label: node.getAttribute('aria-label'),
          labelledby: node.getAttribute('aria-labelledby'),
          role: node.getAttribute('role'),
        })),
      ),
      text: await activePage?.locator('body').innerText(),
    }),
  );
  await activePage?.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
}
