import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  marketKnownCashControlExchangeV3Schema,
  marketKnownCashControlRequestV3Schema,
  marketKnownCashControlResponseV3Schema,
  marketKnownCashControlErrorV3Schema,
} from '../src/market-known-cash-control-v3.js';
import { marketKnownCashRequestV3Schema } from '../src/market-known-cash-wire-v3.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/market-known-cash-control-v3.exchange.json', import.meta.url),
      'utf8',
    ),
  );

describe('已知方案控制身份的只读复核合同', () => {
  const published = new URL(
    '../../../../daily-stock-analysis/tests/fixtures/thesis_ledger_known_cash_control_v3.shared.json',
    import.meta.url,
  );
  it.skipIf(!existsSync(published))('DSA单仓发布副本与主仓共享样例一致', () => {
    expect(JSON.parse(readFileSync(published, 'utf8')).exchange).toEqual(fixture());
  });
  it('绑定保存顺序与当前身份，当前复核时钟不改写历史截止', () => {
    const value = marketKnownCashControlExchangeV3Schema.parse(fixture());
    expect(value.response.checkedAt > value.request.dataAsOf).toBe(true);
    expect(value.response).toMatchObject({
      readOnly: true,
      upstreamRead: false,
      status: 'verified',
    });
    expect(value.response.controlIdentity).toEqual(value.request.expectedControlIdentity);
    expect(value.response.targetSequence[0]).toEqual(value.request.routeTarget);
  });
  it('备用位置也可明确复核，不能自动换主源', () => {
    const value = fixture();
    value.request.routeTarget = value.response.targetSequence[1];
    value.response.routeTarget = value.request.routeTarget;
    expect(
      marketKnownCashControlExchangeV3Schema.parse(value).response.routeTarget.routeIndex,
    ).toBe(1);
  });
  it.each(['requestId', 'symbol', 'start', 'end', 'dataAsOf', 'catalogRevision'])(
    '响应%s不同则拒绝',
    (key) => {
      const value = fixture();
      const changes = {
        requestId: 'other',
        symbol: '510050.SH',
        start: '2025-05-01',
        end: '2025-07-01',
        dataAsOf: '2026-10-10T00:00:00Z',
        catalogRevision: 2,
      };
      value.response[key] = changes[key as keyof typeof changes];
      expect(marketKnownCashControlExchangeV3Schema.safeParse(value).success).toBe(false);
    },
  );
  it.each([
    [
      '配置版本',
      (x: ReturnType<typeof fixture>) => {
        x.response.controlIdentity.providerConfigVersion++;
      },
    ],
    [
      '凭证修订',
      (x: ReturnType<typeof fixture>) => {
        x.response.controlIdentity.credentialRevision = 'hmac-sha256-v1:' + 'c'.repeat(64);
      },
    ],
    [
      '缺身份',
      (x: ReturnType<typeof fixture>) => {
        delete x.request.expectedControlIdentity;
      },
    ],
    [
      '顺序跳号',
      (x: ReturnType<typeof fixture>) => {
        x.response.targetSequence[1].routeIndex = 0;
      },
    ],
    [
      '重复来源',
      (x: ReturnType<typeof fixture>) => {
        x.response.targetSequence[1] = { ...x.response.targetSequence[0], routeIndex: 1 };
      },
    ],
    [
      '位置偷换',
      (x: ReturnType<typeof fixture>) => {
        x.response.targetSequence.reverse();
      },
    ],
    [
      '缺选中来源',
      (x: ReturnType<typeof fixture>) => {
        x.response.targetSequence.shift();
      },
    ],
    [
      '目标回显偷换',
      (x: ReturnType<typeof fixture>) => {
        x.response.routeTarget = x.response.targetSequence[1];
      },
    ],
    [
      '期望身份回显偷换',
      (x: ReturnType<typeof fixture>) => {
        x.response.expectedControlIdentity.providerConfigVersion++;
        x.response.controlIdentity.providerConfigVersion++;
      },
    ],
    [
      '执行了上游',
      (x: ReturnType<typeof fixture>) => {
        x.response.upstreamRead = true;
      },
    ],
    [
      '状态写入',
      (x: ReturnType<typeof fixture>) => {
        x.response.readOnly = false;
      },
    ],
    [
      '旧完整覆盖',
      (x: ReturnType<typeof fixture>) => {
        x.response.coverage = { complete: true };
      },
    ],
    [
      '分红记录',
      (x: ReturnType<typeof fixture>) => {
        x.response.records = [];
      },
    ],
    [
      '凭证内容',
      (x: ReturnType<typeof fixture>) => {
        x.response.credential = { token: 'forbidden' };
      },
    ],
    [
      '未知复核偏移',
      (x: ReturnType<typeof fixture>) => {
        x.response.checkedAt = '2026-10-10T00:00:00-00:00';
      },
    ],
  ])('%s不能成为已验证复核', (_label, mutate) => {
    const value = fixture();
    mutate(value);
    expect(marketKnownCashControlExchangeV3Schema.safeParse(value).success).toBe(false);
  });
  it.each([
    [
      '未应用版本',
      (x: ReturnType<typeof fixture>) => {
        x.request.effectivePolicyRevision++;
      },
    ],
    [
      '倒置区间',
      (x: ReturnType<typeof fixture>) => {
        x.request.start = '2026-01-01';
      },
    ],
    [
      '严格历史规则',
      (x: ReturnType<typeof fixture>) => {
        x.request.researchPolicy.historicalAvailability = 'verified';
      },
    ],
    [
      '股票能力',
      (x: ReturnType<typeof fixture>) => {
        x.request.routeKey.assetType = 'STOCK';
      },
    ],
    [
      '额外执行指令',
      (x: ReturnType<typeof fixture>) => {
        x.request.readUpstream = true;
      },
    ],
  ])('拒绝%s', (_label, mutate) => {
    const value = fixture();
    mutate(value);
    expect(marketKnownCashControlRequestV3Schema.safeParse(value.request).success).toBe(false);
  });
  it('旧资料读取不接受复核请求，复核响应不接受旧资料字段', () => {
    const value = fixture();
    expect(marketKnownCashRequestV3Schema.safeParse(value.request).success).toBe(false);
    expect(
      marketKnownCashControlResponseV3Schema.safeParse({
        ...value.response,
        fetchedAt: value.response.checkedAt,
      }).success,
    ).toBe(false);
  });
  it('复核请求不接受未知UTC偏移或无效年份', () => {
    for (const dataAsOf of ['2026-10-10T00:00:00-00:00', '0000-10-10T00:00:00Z']) {
      expect(
        marketKnownCashControlRequestV3Schema.safeParse({ ...fixture().request, dataAsOf }).success,
      ).toBe(false);
    }
  });
  it('安全失败原因与独立协议保持，不透传未知源错误', () => {
    const error = {
      contractVersion: 3,
      protocolVersion: 'known-cash-control-v1',
      requestId: 'control-check',
      error: {
        code: 'policy_not_applied',
        reason: 'configuration_changed',
        message: '控制身份已变化',
      },
    };
    expect(marketKnownCashControlErrorV3Schema.parse(error)).toEqual(error);
    expect(
      marketKnownCashControlErrorV3Schema.safeParse({
        ...error,
        error: { ...error.error, reason: 'raw-secret-error' },
      }).success,
    ).toBe(false);
  });
});
