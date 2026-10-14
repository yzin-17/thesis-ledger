import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { cnTradingCalendar } from '@thesis-ledger/domain';
import {
  executionPriceProtocolSchema,
  marketKnownCashExchangeV3Schema,
  type MarketKnownCashRequestV3,
} from '@thesis-ledger/schemas';
import {
  prepareKnownCashResearchV3,
  verifyKnownCashPreparationV3,
} from '../../src/backtest/backtest-known-cash-preparation-v3.js';
import { projectKnownCashResearchAccountingV3 } from '../../src/backtest/backtest-known-cash-research-v3.js';
import { hashCanonicalManifest } from '../../src/backtest/backtest-snapshot.js';

function fixture() {
  const base = '../../../../packages/schemas/fixtures/';
  const exchange = marketKnownCashExchangeV3Schema.parse(
    JSON.parse(
      readFileSync(new URL(`${base}market-known-cash-v3.exchange.json`, import.meta.url), 'utf8'),
    ),
  );
  const protocol = executionPriceProtocolSchema.parse({
    ...JSON.parse(
      readFileSync(new URL(`${base}execution-price.raw-events.json`, import.meta.url), 'utf8'),
    ),
    history: { basis: 'fixed-provider-snapshot' },
    cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
  });
  const { routeTarget, dataAsOf, ...scope } = exchange.request;
  const read = vi.fn(async (request: Omit<MarketKnownCashRequestV3, 'routeTarget'>) => ({
    request: { ...request, routeTarget },
    response: { ...exchange.response, ...request, routeTarget },
  }));
  const times = ['2026-10-09T13:00:00Z', '2026-10-09T13:01:01Z'];
  return {
    exchange,
    options: {
      scope,
      executionPriceProtocol: protocol,
      clock: { mode: 'requested-time' as const, requestedDataAsOf: dataAsOf },
      read,
      now: vi.fn(() => times.shift()!),
    },
  };
}

describe('标准方案读取到独立准备包', () => {
  it('按原范围读取，未知覆盖与各自来源冻结，沿用既有应收/发放投影', async () => {
    const { options, exchange } = fixture();
    const result = await prepareKnownCashResearchV3(options);
    expect(options.read).toHaveBeenCalledOnce();
    expect(options.read).toHaveBeenCalledWith({
      ...options.scope,
      dataAsOf: options.clock.requestedDataAsOf,
    });
    expect(result.input.source).toEqual(exchange.response.source);
    expect(result.input.scope.dataAsOf).toBe(options.clock.requestedDataAsOf);
    expect(result.input.coverage.complete).toBe(false);
    expect(result.input.executionPriceProtocol).toEqual(options.executionPriceProtocol);
    const projected = projectKnownCashResearchAccountingV3(result.input, result.input.contentHash, {
      calendar: cnTradingCalendar,
      bars: [{ openedAt: '2025-06-18T01:30:00Z' }, { openedAt: '2025-06-27T01:30:00Z' }],
    });
    expect(projected.actions[0]).toMatchObject({
      cashAmount: '0.088',
      cashSettlementAt: '2025-06-27T01:30:00Z',
    });
    expect(projected.actions[0]).not.toHaveProperty('strategyVisibility');
  });
  it('显式取得后模式使用实际完成时刻，保留原截止和独立读取上限', async () => {
    const { options, exchange } = fixture();
    exchange.response.fetchedAt = '2026-10-09T13:00:29Z';
    options.now = vi
      .fn()
      .mockReturnValueOnce('2026-10-09T13:00:00Z')
      .mockReturnValueOnce('2026-10-09T13:00:30Z');
    const result = await prepareKnownCashResearchV3({
      ...options,
      clock: {
        mode: 'after-acquisition',
        requestedDataAsOf: '2025-06-01T00:00:00Z',
        readDeadlineAt: '2026-10-09T13:01:00Z',
      },
    });
    expect(result.input.scope.dataAsOf).toBe('2026-10-09T13:00:30Z');
    expect(result.acquisition.exchange.request.dataAsOf).toBe('2026-10-09T13:01:00Z');
    expect(result.acquisition.clock.requestedDataAsOf).toBe('2025-06-01T00:00:00Z');
  });
  it('来源晚于用户截止不自动换成取得后时钟', async () => {
    const { options } = fixture();
    options.clock.requestedDataAsOf = '2026-10-09T12:59:59.999999Z';
    await expect(prepareKnownCashResearchV3(options)).rejects.toThrow();
  });
  it('取得超时拒绝，空占位仍保存未知覆盖', async () => {
    const { options, exchange } = fixture();
    exchange.response.records = [];
    exchange.response.ignoredEmptyRows = 1;
    const prepared = await prepareKnownCashResearchV3(options);
    expect(prepared.input.records).toEqual([]);
    expect(prepared.input.ignoredEmptyRows).toBe(1);
    expect(prepared.input.coverage.complete).toBe(false);
    const late = fixture();
    await expect(
      prepareKnownCashResearchV3({
        ...late.options,
        clock: {
          mode: 'after-acquisition',
          requestedDataAsOf: late.options.clock.requestedDataAsOf,
          readDeadlineAt: '2026-10-09T13:01:00Z',
        },
      }),
    ).rejects.toThrow('越界');
  });
  it('非法时钟上限/价格协议在调用来源之前拒绝', async () => {
    const { options } = fixture();
    await expect(
      prepareKnownCashResearchV3({
        ...options,
        clock: {
          mode: 'after-acquisition',
          requestedDataAsOf: options.clock.requestedDataAsOf,
          readDeadlineAt: '2026-10-09T13:01:01Z',
        },
      }),
    ).rejects.toThrow('60秒');
    expect(options.read).not.toHaveBeenCalled();
    const other = fixture();
    other.options.executionPriceProtocol.history = {
      basis: 'point-in-time',
      reconstructionEvidenceRef: 'old-proof',
    };
    await expect(prepareKnownCashResearchV3(other.options)).rejects.toThrow('固定快照');
    expect(other.options.read).not.toHaveBeenCalled();
  });
  it('来源失败保持原原因，不伪造空包', async () => {
    const { options } = fixture();
    const failure = new Error('source:configuration_changed');
    options.read.mockRejectedValueOnce(failure);
    await expect(prepareKnownCashResearchV3(options)).rejects.toBe(failure);
  });
  it('读取端口不得改变原证券/范围/规则/版本，参数变异也不能偷换', async () => {
    const { options, exchange } = fixture();
    options.read.mockImplementationOnce(async (scope) => {
      scope.start = '2025-05-01';
      return {
        request: { ...exchange.request, ...scope },
        response: { ...exchange.response, ...scope },
      };
    });
    await expect(prepareKnownCashResearchV3(options)).rejects.toThrow('准备请求不一致');
    expect(options.scope.start).toBe('2025-06-01');
  });
});

describe('准备包离线校验及版本围栏', () => {
  it('序列化重放只读取冻结包，网络零调用', async () => {
    const { options } = fixture();
    const prepared = await prepareKnownCashResearchV3(options);
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('离线'));
    try {
      const replay = verifyKnownCashPreparationV3(
        JSON.parse(JSON.stringify(prepared)),
        prepared.contentHash,
      );
      expect(replay).toEqual(prepared);
      expect(network).not.toHaveBeenCalled();
      expect(options.read).toHaveBeenCalledOnce();
    } finally {
      network.mockRestore();
    }
  });
  it.each([
    [
      '来源版本',
      (x: ReturnType<typeof fixture>) => {
        x.exchange.response.source.providerRevision = 'new-response';
      },
    ],
    [
      '配置版本',
      (x: ReturnType<typeof fixture>) => {
        x.exchange.response.source.controlIdentity.providerConfigVersion++;
      },
    ],
    [
      '价格观察时钟',
      (x: ReturnType<typeof fixture>) => {
        x.options.executionPriceProtocol.priceBasis.observedAt = '2026-09-01T00:00:00Z';
      },
    ],
    [
      '原请求截止',
      (x: ReturnType<typeof fixture>) => {
        x.options.clock.requestedDataAsOf = '2026-10-09T14:01:00Z';
      },
    ],
  ])('改变%s重新冻结得到新准备摘要，不能沿用旧摘要', async (_label, mutate) => {
    const first = await prepareKnownCashResearchV3(fixture().options);
    const other = fixture();
    mutate(other);
    const second = await prepareKnownCashResearchV3(other.options);
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(() => verifyKnownCashPreparationV3(second, first.contentHash)).toThrow('需重新准备');
    expect(verifyKnownCashPreparationV3(second, second.contentHash)).toEqual(second);
  });
  it('仅重算外层摘要不能掩盖内层金额或时钟篡改', async () => {
    const value = await prepareKnownCashResearchV3(fixture().options);
    value.input.recordsHash = 'f'.repeat(64);
    value.contentHash = hashCanonicalManifest(value);
    expect(() => verifyKnownCashPreparationV3(value, value.contentHash)).toThrow('摘要不一致');
  });
});
