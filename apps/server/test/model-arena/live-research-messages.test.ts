import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arenaLiveAccountSchema, arenaLiveResearchStepSchema } from '@thesis-ledger/schemas';
import { buildLiveResearchMessages } from '../../src/model-arena/live/live-research-messages.js';
import { liveProtocolFixture } from './live-fixture.js';

describe('自主研究日期与观察时刻契约', () => {
  it('真实失败样本仅因委托到期日混入时间而拒绝，日期或空值仍有效', () => {
    const sample = JSON.parse(readFileSync(new URL('./fixtures/invalid-order-expiry.json', import.meta.url), 'utf8'));
    const result = arenaLiveResearchStepSchema.safeParse(sample);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toEqual([['decision', 'orders', 0, 'expiresOn']]);
    expect(sample.decision.orders[0].expiresOn).toBe('2026-11-12T21:00:00Z');
    for (const value of ['2026-11-12', null]) {
      const corrected = structuredClone(sample); corrected.decision.orders[0].expiresOn = value;
      expect(arenaLiveResearchStepSchema.safeParse(corrected).success).toBe(true);
    }
    const market = structuredClone(sample); market.decision.orders[0].kind = 'market';
    market.decision.orders[0].expiresOn = '2026-11-12';
    expect(arenaLiveResearchStepSchema.safeParse(market).success).toBe(false);
  });
  it('完整生成消息明确两个字段的业务语义，保留冻结时间与回放资料边界', () => {
    const asOf = '2026-11-12T16:37:00.000Z';
    const account = arenaLiveAccountSchema.parse({ revision: 0, cash: '100000', positions: [],
      cashSettlements: [], orders: [], wakeups: [], watchedSymbols: [], fills: [] });
    const messages = buildLiveResearchMessages({ protocol: liveProtocolFixture(), account, asOf, replay: true });
    expect(messages[0]!.content).toContain('orders[].expiresOn');
    expect(messages[0]!.content).toContain('填写 YYYY-MM-DD 或 null');
    expect(messages[0]!.content).toContain('未来 UTC 时刻');
    expect(messages[0]!.content).toContain('日线、新闻和网页暂不可用');
    expect(messages[0]!.content).toContain('委托到期交易日');
    expect(messages[0]!.content).toContain('decision.summary 必须用简体中文');
    expect(messages[0]!.content).toContain('不得翻译');
    expect(messages[0]!.content).toContain('orders');
    expect(messages[0]!.content).toContain('wakeups');
    expect(JSON.parse(messages[1]!.content).asOf).toBe(asOf);
    expect(account.cash).toBe('100000');
    const realtime = buildLiveResearchMessages({
      protocol: liveProtocolFixture({ allowWebSearch: true }),
      account,
      asOf,
      replay: false,
      marketSession: { state: 'closed', date: '2026-11-12', reason: null },
    });
    expect(JSON.parse(realtime[1]!.content).marketSession).toEqual({ state: 'closed', date: '2026-11-12', reason: null });
    expect(realtime[0]!.content).toContain('盘前、盘后、休市');
    expect(realtime[0]!.content).toContain('此时 orders=[]');
    expect(realtime[0]!.content).toContain('decision.summary 必须用简体中文');
    expect(realtime[0]!.content).toContain('允许web_search');
    expect(realtime[0]!.content).toContain('exitGroup');
    expect(realtime[0]!.content).toContain('不能用 exitGroup 连接买入单与止损单');
    expect(realtime[0]!.content).toContain('先预约 kind=fill');
  });
});
