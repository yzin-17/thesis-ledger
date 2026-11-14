const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { authoringDraftReadSchema } = require('@thesis-ledger/schemas');

const base = process.env.AUTHORING_QA_URL || 'http://127.0.0.1:5173';
const output = '/tmp/authoring-draft-delete-qa';
const live = process.argv.includes('--live-readonly');
const prefix = '/api/v1/strategy-authoring/drafts';
const draft = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: 'local-workspace',
  title: '受控删除草稿 · 很长的策略名称用于验证窄屏换行与操作按钮',
  revision: 3,
  state: 'editing',
  savedVersionId: null,
  createdAt: '2026-11-12T00:00:00Z',
  updatedAt: '2026-11-12T00:00:00Z',
};
const content = {
  title: draft.title,
  description: '',
  questions: [],
  requirements: [],
  runtimeIntents: [],
  removedRequirements: [],
  definitionText: '',
  manualChanges: [],
};
const discarded = authoringDraftReadSchema.parse({
  ...draft,
  state: 'discarded',
  content,
  validation: { status: 'incomplete', issues: [] },
});
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const results = [];
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 960 },
        reducedMotion: 'reduce',
      });
      const errors = [],
        blockedWrites = [],
        writes = [];
      let removed = false;
      let fail = true;
      let release;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (!live && request.method() === 'POST' && pathname === `${prefix}/${draft.id}/discard`) {
          writes.push(request.postDataJSON());
          if (fail)
            return route.fulfill({ status: 409, json: { message: '草稿已更新，请重新读取' } });
          await new Promise((resolve) => {
            release = resolve;
          });
          removed = true;
          return route.fulfill({ json: discarded });
        }
        if (request.method() !== 'GET') {
          blockedWrites.push(`${request.method()} ${pathname}`);
          return route.abort();
        }
        if (!live && pathname === prefix)
          return route.fulfill({ json: { items: removed ? [] : [draft], nextCursor: null } });
        if (!live && pathname === `${prefix}/${draft.id}`)
          return route.fulfill({ json: { ...discarded, state: 'editing' } });
        if (!live && pathname === `${prefix}/${draft.id}/operations`)
          return route.fulfill({ json: [] });
        return route.continue();
      });
      const firstList = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === prefix && response.request().method() === 'GET',
      );
      await page.goto(`${base}/strategy/library/new?authoring=1`);
      const response = await firstList;
      assert(response.ok());
      const initialPage = await response.json();
      assert(initialPage.items.every((item) => item.state !== 'discarded'));
      const remove = page.getByRole('button', { name: '删除', exact: true }).first();
      await remove.waitFor();
      await remove.focus();
      assert(await remove.evaluate((element) => element === document.activeElement));
      await remove.click();
      const dialog = page.getByRole('alertdialog');
      await dialog.waitFor();
      const box = await dialog.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0);
      await page.screenshot({
        animations: 'disabled',
        path: `${output}/${live ? 'live-' : ''}confirm-${width}.png`,
        fullPage: true,
      });
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(writes.length, 0);
      await page.getByRole('button', { name: '编辑', exact: true }).first().click();
      await page.getByRole('button', { name: '草稿操作', exact: true }).click();
      await page.getByRole('menuitem', { name: '复制本地草稿', exact: true }).waitFor();
      assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['复制本地草稿']);
      await page.screenshot({
        path: `${output}/${live ? 'live-' : ''}editor-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '草稿列表', exact: true }).click();
      await remove.waitFor();
      if (!live) {
        await remove.click();
        await page.getByRole('button', { name: '删除草稿', exact: true }).click();
        await page.getByText('删除草稿失败', { exact: true }).waitFor();
        await page.getByText(draft.title, { exact: true }).waitFor();
        fail = false;
        await remove.click();
        await page.getByRole('button', { name: '删除草稿', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('button[aria-busy="true"]'));
        assert(await remove.isDisabled());
        assert(await page.getByRole('button', { name: '编辑', exact: true }).isDisabled());
        assert(await page.getByRole('button', { name: '新建编写草稿', exact: true }).isDisabled());
        assert.equal(typeof release, 'function');
        release();
        await page.getByText(draft.title, { exact: true }).waitFor({ state: 'hidden' });
        await page.reload();
        await page.getByRole('button', { name: '新建编写草稿', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '删除', exact: true }).count(), 0);
        assert.deepEqual(writes, [{ expectedRevision: 3 }, { expectedRevision: 3 }]);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      assert.deepEqual(blockedWrites, []);
      results.push({
        width,
        liveReadonly: live,
        cancel: true,
        editNavigation: true,
        copyMenu: true,
        failureAndRetry: !live,
        pending: !live,
        reload: !live,
        overflow: false,
        realWrites: 0,
        controlledWrites: writes.length,
      });
      await page.close();
    }
    fs.writeFileSync(
      `${output}/${live ? 'live-' : ''}receipt.json`,
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
