const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.DATE_INPUT_QA_ORIGIN || 'http://localhost:5173';
const output = process.env.DATE_INPUT_QA_OUTPUT || '/tmp/date-input-consistency-qa';
const popupSelector = '[data-slot="popover-content"]';

async function checkBounds(page) {
  const geometry = await page.locator(popupSelector).evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      rootOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      panelOverflow: element.scrollWidth > element.clientWidth + 1,
      contained:
        box.left >= -1 &&
        box.right <= innerWidth + 1 &&
        box.top >= -1 &&
        box.bottom <= innerHeight + 1,
    };
  });
  assert.deepEqual(geometry, { rootOverflow: false, panelOverflow: false, contained: true });
}

(async () => {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.DATE_INPUT_QA_CHROMIUM,
  });
  const results = [],
    errors = [],
    writes = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
        locale: 'en-US',
      });
      await context.route('**/api/**', (route) => {
        if (route.request().method() === 'GET') return route.continue();
        writes.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      page.on('pageerror', (error) => errors.push(error.message));
      for (const theme of ['light', 'dark']) {
        for (const surface of ['page', 'drawer', 'dialog']) {
          console.log(JSON.stringify({ width, theme, surface }));
          await page.goto(origin + '/test/browser-date-selection.html');
          await page.locator('#sample-date').waitFor();
          await page.evaluate((value) => {
            document.documentElement.dataset.theme = value;
          }, theme);
          if (surface === 'drawer')
            await page.getByRole('button', { name: '打开 Drawer', exact: true }).click();
          if (surface === 'dialog')
            await page.getByRole('button', { name: '打开对话框', exact: true }).click();
          const date = page.locator('#sample-date');
          const time = page.locator('#sample-time');
          const month = page.locator('#sample-month');
          assert.equal(await date.inputValue(), '2026-11-06');
          assert.equal(await time.inputValue(), '2026-11-06 12:34:56.789');
          assert.equal(await date.getAttribute('type'), 'text');
          await time.focus();
          assert.equal(await time.inputValue(), '2026-11-06 12:34:56.789');
          await page.locator('label[for="sample-time"]').click();
          assert.equal(await time.getAttribute('aria-expanded'), 'false');
          await time.click();
          assert.equal(await time.evaluate((el) => document.activeElement === el), true);
          await checkBounds(page);
          await time.fill('2026-11-07 08:09:10.123');
          assert.equal(
            await page.locator('input[name="time"]').inputValue(),
            '2026-11-07T08:09:10.123',
          );
          await time.press('Escape');
          await page.locator(popupSelector).waitFor({ state: 'hidden' });
          assert.equal(await time.inputValue(), '2026-11-07 08:09:10.123');
          if (surface !== 'page')
            assert.equal(
              await page
                .getByRole('dialog', {
                  name: surface === 'drawer' ? '日期 Drawer' : '日期对话框',
                  exact: true,
                })
                .isVisible(),
              true,
            );
          await date.press('Alt+ArrowDown');
          const selected = page.locator(popupSelector + ' [data-selected-single="true"]');
          await selected.waitFor();
          assert.equal(await selected.innerText(), '6');
          const colors = await selected.evaluate((el) => ({
            color: getComputedStyle(el).color,
            background: getComputedStyle(el).backgroundColor,
          }));
          await selected.hover();
          assert.equal(await selected.evaluate((el) => getComputedStyle(el).color), colors.color);
          assert.equal(
            await selected.evaluate(
              (el) => getComputedStyle(el.parentElement.previousElementSibling).backgroundColor,
            ),
            'rgba(0, 0, 0, 0)',
          );
          await checkBounds(page);
          await page.screenshot({
            path: `${output}/${surface}-${theme}-${width}.png`,
            animations: 'disabled',
          });
          await selected.press('ArrowRight');
          await page.keyboard.press('Enter');
          await page.locator(popupSelector).waitFor({ state: 'hidden' });
          assert.equal(await date.inputValue(), '2026-11-07');
          await month.focus();
          await month.press('Alt+ArrowDown');
          await checkBounds(page);
          const selectedMonth = page.locator(popupSelector + ' button[aria-pressed="true"]');
          assert.equal(await selectedMonth.innerText(), '11月');
          assert.equal(
            await selectedMonth.evaluate((el) => getComputedStyle(el).color),
            colors.color,
          );
          await page
            .locator(popupSelector)
            .getByRole('button', { name: '12月', exact: true })
            .click();
          assert.equal(await month.inputValue(), '2026-12');
          await date.fill('2026-02-30');
          assert.equal(
            await page.locator('input[name="date"]').evaluate((el) => el.validity.customError),
            true,
          );
          await date.press('Escape');
          assert.equal(await date.inputValue(), '2026-11-07');
          await page.getByRole('button', { name: '验证提交', exact: true }).click();
          const submitted = JSON.parse(await page.getByLabel('提交内容').innerText());
          assert.deepEqual(submitted, {
            month: '2026-12',
            date: '2026-11-07',
            time: '2026-11-07T08:09:10.123',
          });
          results.push({
            width,
            theme,
            surface,
            format: true,
            selection: true,
            keyboard: true,
            bounds: true,
            originalSubmission: true,
          });
        }
      }
      await context.close();
    }
    for (const surface of ['page', 'drawer', 'dialog']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 420 },
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await page.goto(origin + '/test/browser-date-selection.html');
      if (surface === 'drawer')
        await page.getByRole('button', { name: '打开 Drawer', exact: true }).click();
      if (surface === 'dialog')
        await page.getByRole('button', { name: '打开对话框', exact: true }).click();
      await page.locator('#sample-time').click();
      await checkBounds(page);
      await page.locator(popupSelector).getByRole('button', { name: '完成', exact: true }).click();
      await page.locator(popupSelector).waitFor({ state: 'hidden' });
      results.push({ width: 390, height: 420, surface, bounds: true, completion: true });
      await context.close();
    }
    const live = [];
    for (const width of [1440, 1024, 768, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      await context.route('**/api/**', (route) => {
        if (route.request().method() === 'GET') return route.continue();
        writes.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin + '/journal');
      const field = page.locator('[data-slot="date-input"]').first();
      const visible = field.locator('input[type="text"]');
      await visible.waitFor();
      const raw = await field.locator('input[data-slot="date-input-value"]').inputValue();
      await visible.focus();
      assert.equal(await visible.inputValue(), raw.replace('T', ' '));
      await visible.click();
      await checkBounds(page);
      await visible.press('Escape');
      await page.locator(popupSelector).waitFor({ state: 'hidden' });
      assert.equal(await field.locator('input[data-slot="date-input-value"]').inputValue(), raw);
      await field.locator('..').screenshot({ path: `${output}/journal-field-${width}.png` });
      live.push({ width, readOnly: true, format: true, bounds: true, unchanged: true });
      await context.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    writeFileSync(
      output + '/results.json',
      JSON.stringify({ results, live, errors, writes }, null, 2),
    );
    console.log(
      JSON.stringify({ scenarios: results.length, live: live.length, errors, writes, output }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
