const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.INTERNAL_NAV_QA_URL || 'http://localhost:5173';
const output = '/tmp/internal-navigation-qa';
const account = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '导航验收账户',
  type: 'securities',
  mode: 'actual',
  currency: 'USD',
  institution: null,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
mkdirSync(output, { recursive: true });

async function analysisFixture(browser, accountId) {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.route('**/api/**', (route) =>
    new URL(route.request().url()).pathname.startsWith('/api/') ? route.abort() : route.continue(),
  );
  await page.goto(origin + '/test/browser-journal-review.html?layout=1');
  await page.getByRole('tab', { name: '单笔复盘', exact: true }).waitFor();
  const analysis = await page.evaluate(async (id) => {
    const { journalUiEvidenceFixture } = await import('/test/journal-review.fixture.ts');
    const input = journalUiEvidenceFixture();
    const response = await fetch('/api/v1/journal/analysis/object', {
      method: 'POST',
      body: JSON.stringify({
        accountId: id,
        mode: 'actual',
        reference: input.reference,
        evidenceFingerprint: 'source-1',
        analysisDraft: {},
      }),
    });
    if (!response.ok) throw new Error('受控复盘样本生成失败');
    return response.json();
  }, accountId);
  await page.close();
  return analysis;
}

async function checkJournalNavigation(browser, width, account, analysis) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  const writes = [],
    documents = [],
    errors = [];
  let controlledAnalyses = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documents.push(request.url());
  });
  await page.route('**/api/**', (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path.endsWith('/journal/analysis/object') && request.method() === 'POST') {
      controlledAnalyses++;
      return route.fulfill({ json: analysis });
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      writes.push({ method: request.method(), path });
      return route.abort();
    }
    if (path.endsWith('/accounts')) return route.fulfill({ json: [account] });
    if (path.endsWith('/journal/review-candidates'))
      return route.fulfill({
        json: {
          items: [analysis.candidate],
          legacyItems: [],
          total: 1,
          nextCursor: null,
          ledgerRevision: '12',
          projectionGeneration: '7',
          instrumentDirectory: { generation: 1, items: [], unresolvedSymbols: ['AAPL.US'] },
        },
      });
    if (path.includes('/journal/review-objects/'))
      return route.fulfill({ json: analysis.candidate });
    return route.continue();
  });
  const params = new URLSearchParams({
    accountId: account.id,
    mode: 'actual',
    reviewObjectId: analysis.candidate.input.reference.reviewObjectId,
  });
  const journal = origin + '/journal?' + params.toString();
  await page.goto(journal);
  try {
    await page.getByRole('button', { name: '开始复盘', exact: true }).click();
  } catch (error) {
    await page.screenshot({ path: `${output}/failure-${width}.png` });
    throw error;
  }
  const link = page.getByRole('link', { name: '配置 AI 模型', exact: true });
  await link.waitFor();
  await link.scrollIntoViewIfNeeded();
  const bounds = await link.boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/journal-${width}.png` });
  const marker = await page.evaluate(() => {
    window.__internalNavigationQa = String(Math.random());
    return window.__internalNavigationQa;
  });
  const documentCount = documents.length;
  await link.click();
  await page.waitForURL(origin + '/providers');
  await page.getByRole('heading', { name: '数据与自动化', exact: true }).waitFor();
  assert.equal(documents.length, documentCount);
  assert.equal(await page.evaluate(() => window.__internalNavigationQa), marker);
  await page.goBack();
  await page.waitForURL(journal);
  await page.getByRole('button', { name: '开始复盘', exact: true }).click();
  await link.waitFor();
  assert.equal(await page.evaluate(() => window.__internalNavigationQa), marker);
  await link.focus();
  await link.press('Enter');
  await page.waitForURL(origin + '/providers');
  assert.equal(documents.length, documentCount);
  await page.locator('a[href="/market-data"]:visible').first().click();
  await page.waitForURL(origin + '/market-data');
  await page.locator('a[href="/journal"]:visible').first().click();
  await page.waitForURL(origin + '/journal');
  assert.equal(documents.length, documentCount);
  assert.equal(await page.evaluate(() => window.__internalNavigationQa), marker);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  assert.equal(controlledAnalyses, 2);
  console.log(
    JSON.stringify({
      width,
      journalConfig: true,
      keyboard: true,
      back: true,
      sidebar: true,
      newDocuments: 0,
      realWrites: 0,
      controlledAnalyses,
    }),
  );
  await page.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
  });
  try {
    const analysis = await analysisFixture(browser, account.id);
    for (const width of [1440, 1024, 768, 390])
      await checkJournalNavigation(browser, width, account, analysis);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
