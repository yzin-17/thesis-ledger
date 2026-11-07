import { it } from 'vitest';

it.skipIf(!process.env.JOURNAL_REVIEW_DATABASE_URL || !process.env.ARENA_QUEUE_TEST_SCOPE)(
  '从身份自选分组到自动模拟成交、周报进程中断和按原证据回读',
  async () => {
    const { checkJourney } = await import('./journey-scenario.mjs');
    const inspect = process.env.ARENA_BROWSER_EXECUTABLE
      ? (await import('./journey-browser.mjs')).inspectDesktop
      : undefined;
    await checkJourney(inspect);
  },
  60000,
);
