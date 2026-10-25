import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeNavSubmission } from '../../src/features/backtest-setup/backtest-submission';
import { b4NavFixture } from './batch4-nav-fixture';

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('禁止合成 NAV 合同测试访问网络');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('第 4 批手机自有 NAV 合同夹具', () => {
  it('准备响应与定义、请求和结果保持关联，可由手机冻结为提交凭证', () => {
    const { navDefinition, navRequest, navPrepared, navResult } = b4NavFixture();
    if (navPrepared.status !== 'prepared' || !navPrepared.receipt)
      throw new Error('合成样本应包含已准备凭证');
    expect(navPrepared.requestId).toBe(navRequest.requestId);
    expect(navPrepared.binding.strategyVersionId).toBe(navRequest.strategyVersionId);
    expect(navPrepared.receipt.preparationHash).toBe(navPrepared.binding.preparationHash);
    expect(navResult.strategyVersionId).toBe(navRequest.strategyVersionId);
    expect(navResult.executionSymbol).toBe(navDefinition.executionInstrument.symbol);
    expect(navResult.dataAsOf).toBe(navPrepared.runConfig.dataAsOf);
    expect(navResult.executionModelDisclosure.model).toEqual(navPrepared.runConfig.executionModel);
    const pending = freezeNavSubmission(
      navRequest.strategyVersionId,
      navPrepared,
      'controlled-nav-key',
      Date.parse('2026-10-25T00:00:00Z'),
    );
    expect(pending).toEqual({
      kind: 'nav',
      body: {
        contractVersion: 3,
        preparationId: navPrepared.receipt.preparationId,
        preparationHash: navPrepared.receipt.preparationHash,
        idempotencyKey: 'controlled-nav-key',
      },
    });
  });

  it('独立回放不会共享可变的结果或请求数据', () => {
    const first = b4NavFixture();
    const originalAmount = first.navResult.cash.settled;
    first.navResult.cash.settled = '1';
    first.navRequest.requestId = 'changed-in-one-replay';
    const second = b4NavFixture();
    expect(second.navResult.cash.settled).toBe(originalAmount);
    expect(second.navRequest.requestId).not.toBe(first.navRequest.requestId);
  });
});
