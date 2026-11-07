// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi } from './mobile-view-harness';
import { ledgerAccount, ledgerAccountId } from './ledger-fixture';
import { riskRuleResponseSchema, portfolioValuationResponseSchema } from '@thesis-ledger/schemas';
import { buildRiskInput, riskForm } from '../../src/features/risk-rules/risk-rule-form';
import { mobileRiskContexts } from '../../src/features/risk-rules/risk-context';
import { RiskRuleForm } from '../../src/features/risk-rules/RiskRuleForm';
const portfolio = portfolioValuationResponseSchema.parse({
  positions: [
    {
      id: ledgerAccountId,
      accountId: ledgerAccountId,
      symbol: '510300.SH',
      quantity: 100,
      costPrice: 4,
      marketPrice: null,
      marketValue: null,
      costValue: 400,
      pnl: null,
      pnlRatio: null,
      stale: true,
    },
  ],
  cashValue: 0,
  cashByAccount: [],
  totalCost: 400,
  totalMarketValue: 0,
  totalPnl: 0,
  unrealizedPnl: null,
  unrealizedPnlRatio: null,
  realizedPnl: null,
  realizedPnlRatio: null,
  cumulativePnl: null,
  cumulativePnlRatio: null,
  partial: true,
  mode: 'shadow',
  valuedAt: '2026-10-23T01:00:00Z',
});
describe('M15 风险规则与试算输入', () => {
  it('百分比、账户绑定与规则范围受约束，新规则默认停用', () => {
    const form = {
      ...riskForm(),
      kind: 'cost-stop' as const,
      threshold: '10',
      symbol: '510300.SH',
      accountId: ledgerAccountId,
    };
    expect(buildRiskInput(form)).toMatchObject({
      threshold: 0.1,
      enabled: false,
      accountId: ledgerAccountId,
    });
    expect(() => buildRiskInput({ ...form, accountId: '' })).toThrow('绑定账户');
    expect(() => buildRiskInput({ ...form, threshold: '101' })).toThrow('100%');
    expect(() => buildRiskInput({ ...form, scope: 'portfolio' })).toThrow('作用范围');
  });
  it('缺报价不推测价格或权重，陈旧标记传递服务端', () => {
    const contexts = mobileRiskContexts(portfolio);
    expect(contexts[0]).not.toHaveProperty('price');
    expect(contexts[0]).not.toHaveProperty('weight');
    expect(contexts[0]?.dataQuality).toEqual({ portfolio: 'partial', marketData: 'stale' });
  });
  it('保存冲突保留阈值并锁住重复提交', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'Conflict', message: '风险规则版本冲突' }, { status: 409 }),
      );
    setApi(fetcher);
    await mount(
      <RiskRuleForm accounts={[ledgerAccount]} portfolio={portfolio} readable reload={vi.fn()} />,
    );
    await click(button('510300.SH · 510300.SH'));
    await input(field('风险阈值（数值）'), '3.5');
    await click(button('保存风险规则'));
    expect(field('风险阈值（数值）').value).toBe('3.5');
    expect(button('保存风险规则').disabled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body).enabled).toBe(false);
  });
  it.each([1 / 3, 0.26645084677376735, 1e-9, Number.MIN_VALUE])(
    '修改其他字段时保留阈值 %s',
    (threshold) => {
      const previous = riskRuleResponseSchema.parse({
        id: ledgerAccountId,
        version: 1,
        kind: 'cost-stop',
        scope: 'security',
        severity: 'warning',
        threshold,
        enabled: false,
        needsRepair: false,
        repairReason: null,
        archivedAt: null,
        symbol: '510300.SH',
        accountId: ledgerAccountId,
        effectiveAt: '2026-11-06T01:00:00Z',
      });
      const form = riskForm(previous);
      expect(buildRiskInput({ ...form, severity: 'critical' }, previous)).toMatchObject({
        threshold,
        severity: 'critical',
      });
    },
  );
  it('拒绝非零百分比下溢，同时保留普通数值阈值', () => {
    const form = {
      ...riskForm(),
      kind: 'cost-stop' as const,
      threshold: '1e-323',
      symbol: '510300.SH',
      accountId: ledgerAccountId,
    };
    expect(() => buildRiskInput(form)).toThrow();
    expect(
      buildRiskInput({ ...form, kind: 'price-below', threshold: '123.45678901234566' }).threshold,
    ).toBe(123.45678901234567);
  });
});
