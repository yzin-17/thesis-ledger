import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketSessionBoundaryViolation as check } from './market-session-boundaries.mjs';
test('当前状态消费者不能重新引入内置年度日历', () => {
  const source = 'import { openTradingMarketsAt } from "@thesis-ledger/domain";';
  assert(check('apps/server/src/market/fund.ts', source));
  assert(check('apps/desktop/src/features/watchlist/trend.ts', source));
  assert.equal(check('apps/server/src/backtest/replay.ts', source), null);
  assert.equal(check('apps/server/test/market/fixture.ts', source), null);
});
test('允许事实投影与共享状态消费', () => {
  assert.equal(check('apps/server/src/market/session.ts', 'import { projectMarketSession, tradingCalendarFromFact } from "@thesis-ledger/domain";'), null);
  assert.equal(check('apps/server/src/automation/job.ts', 'import { MarketSessionReader } from "../market/market-session-reader.js";'), null);
});
test('会话累计与时钟只读冻结日历，保留其他历史回测入口的独立合同', () => {
  for (const file of ['apps/server/src/backtest/backtest-session-series.ts',
    'packages/domain/src/backtest-session-clock.ts', 'packages/domain/src/backtest-session-vwap.ts']) {
    assert(check(file, 'const calendar = new MarketService();'));
    assert(check(file, 'const calendar = cnTradingCalendar;'));
    assert.equal(check(file, 'const calendar = tradingCalendarFromFact(frozen);'), null);
  }
});
