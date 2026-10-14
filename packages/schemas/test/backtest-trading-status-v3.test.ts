import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backtestTradingStatusSnapshotV3Schema,
  backtestTradingStatusSnapshotRefV3Schema,
  tradingStatusFreezeVersionV3,
  tradingStatusArtifactKeyV3,
} from '../src/backtest-trading-status-v3.js';

const sourceSnapshot = () => ({
  freezeVersion: tradingStatusFreezeVersionV3,
  runConfigChecksum: 'a'.repeat(64),
  disclosure: {
    status: 'source',
    response: JSON.parse(
      readFileSync(
        new URL('../fixtures/market-trading-status-v3.response.json', import.meta.url),
        'utf8',
      ),
    ).response,
    fallbackReason: '主源不可用，整窗使用已配置备用。',
  },
});

describe('独立停复牌冻结合同', () => {
  it('完整来源与 unknown 可以冻结，版本引用不混入价格或执行模型', () => {
    const snapshot = sourceSnapshot();
    expect(backtestTradingStatusSnapshotV3Schema.parse(snapshot)).toEqual(snapshot);
    expect(
      backtestTradingStatusSnapshotRefV3Schema.parse({
        artifactKey: `run-id/${tradingStatusArtifactKeyV3}`,
        freezeVersion: tradingStatusFreezeVersionV3,
      }).freezeVersion,
    ).toBe(tradingStatusFreezeVersionV3);
  });
  it('未纳入真实约束必须给出原因，不接受虚构正常状态', () => {
    const snapshot = {
      ...sourceSnapshot(),
      disclosure: { status: 'notIncluded', reason: '未配置状态源，沿用已选研究假设。' },
    };
    expect(backtestTradingStatusSnapshotV3Schema.parse(snapshot)).toEqual(snapshot);
    expect(
      backtestTradingStatusSnapshotV3Schema.safeParse({
        ...snapshot,
        disclosure: { status: 'notIncluded', reason: '' },
      }).success,
    ).toBe(false);
    expect(
      backtestTradingStatusSnapshotV3Schema.safeParse({
        ...snapshot,
        disclosure: { ...snapshot.disclosure, days: [{ date: '2023-08-17', state: 'trading' }] },
      }).success,
    ).toBe(false);
  });
  it.each(['version', 'identity', 'response'] as const)('拒绝无效 %s', (field) => {
    const snapshot = sourceSnapshot();
    if (field === 'version') snapshot.freezeVersion = 'future' as typeof snapshot.freezeVersion;
    else if (field === 'identity') snapshot.runConfigChecksum = 'missing';
    else snapshot.disclosure.response.days.pop();
    expect(backtestTradingStatusSnapshotV3Schema.safeParse(snapshot).success).toBe(false);
  });
});
