import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RiskEventTable } from '../src/features/risk/RiskSections.js';
import { RiskRuleWorkbench } from '../src/features/risk/RiskRuleWorkbench.js';
import { toInput, validateDraft } from '../src/features/risk/RiskRuleEditorSheet.js';
import { isPortfolioScanReady, portfolioDataStatus } from '../src/features/risk/RiskOverview.js';
import {
  PortfolioModeNote,
  PortfolioModeSwitch,
} from '../src/features/shared/PortfolioModeSwitch.js';
import { buildRiskContexts } from '../src/features/risk/risk.actions.js';
import {
  formatThreshold,
  riskRuleNeedsAccount,
  riskRuleScopeOptionsForKind,
  riskTestRecordForRule,
  riskStatusLabel,
  riskStatusTone,
  rulePreview,
} from '../src/features/risk/risk.format.js';
import type { Portfolio } from '../src/features/portfolio/portfolio.types.js';

const portfolio: Portfolio = {
  totalMarketValue: 1000,
  totalCost: 900,
  totalPnl: 100,
  cashValue: 0,
  mode: 'actual',
  partial: false,
  valuedAt: '2026-08-23T01:00:00.000Z',
  positions: [
    {
      id: 'position-1',
      accountId: '00000000-0000-4000-8000-000000000001',
      symbol: '159516.SZ',
      quantity: 10,
      costPrice: 90,
      marketValue: 1000,
      pnl: 100,
      stale: false,
      updatedAt: '2026-08-22T00:00:00.000Z',
      asset: { name: 'ETF' },
    },
  ],
};

describe('风险中心 AB 交互契约', () => {
  it('扫描上下文跟随路由模式和当前组合数据', () => {
    const contexts = buildRiskContexts(portfolio, 'shadow');

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      mode: 'shadow',
      symbol: '159516.SZ',
      positionId: 'position-1',
      quantity: 10,
      price: 100,
      weight: 1,
      marketTime: portfolio.valuedAt,
      dataQuality: { portfolio: 'fresh' },
      positionUpdatedAt: '2026-08-22T00:00:00.000Z',
    });
  });

  it('按规则类型转换百分比并生成中文预览', () => {
    expect(formatThreshold('cost-stop', 0.1)).toBe('10%');
    expect(formatThreshold('trailing-stop', 0.1)).toBe('10%');
    expect(formatThreshold('price-below', 120)).toBe('120');
    expect(
      rulePreview({
        kind: 'position-concentration',
        scope: 'security',
        threshold: 0.6,
      }),
    ).toContain('持仓集中度 60%');
  });

  it('规则类型和范围保持联动', () => {
    expect(riskRuleScopeOptionsForKind('price-below').map((option) => option.value)).toEqual([
      'security',
    ]);
    expect(riskRuleScopeOptionsForKind('drawdown').map((option) => option.value)).toEqual([
      'account',
      'portfolio',
    ]);

    const invalidScope = validateDraft({
      kind: 'price-below',
      scope: 'account',
      severity: 'warning',
      threshold: '120',
      symbol: '',
      accountId: 'account-1',
      enabled: true,
    });
    expect(invalidScope.scope).toBe('价格低于仅支持证券范围。');
  });

  it('编辑 Sheet 的规则校验和百分比转换保持 API 语义', () => {
    const draft = {
      kind: 'cost-stop',
      scope: 'security' as const,
      severity: 'warning' as const,
      threshold: '10',
      symbol: '159516.SZ',
      accountId: '00000000-0000-4000-8000-000000000001',
      enabled: true,
    };

    expect(riskRuleNeedsAccount('cost-stop')).toBe(true);
    expect(riskRuleNeedsAccount('price-below')).toBe(false);
    expect(validateDraft(draft)).toEqual({});
    expect(toInput(draft)).toMatchObject({
      threshold: 0.1,
      symbol: '159516.SZ',
      accountId: '00000000-0000-4000-8000-000000000001',
      enabled: true,
    });
    expect(validateDraft({ ...draft, kind: 'trailing-stop', accountId: '' })).toMatchObject({
      accountId: '该规则需要绑定账户。',
    });
    expect(validateDraft({ ...draft, scope: 'account', symbol: '', accountId: '' })).toMatchObject({
      accountId: '账户范围必须选择账户。',
    });
    expect(
      validateDraft(
        { ...draft, scope: 'portfolio' as const, symbol: '', accountId: '' },
        'security',
      ),
    ).toMatchObject({
      scope: '已有证券规则不能切换为组合范围，请新建组合规则。',
    });
  });

  it('空组合是已加载空态，不满足扫描条件', () => {
    expect(portfolioDataStatus('empty')).toBe('空组合');
    expect(isPortfolioScanReady('empty')).toBe(false);
    expect(isPortfolioScanReady('ready')).toBe(true);
    expect(isPortfolioScanReady('stale')).toBe(true);
  });

  it('跨页面模式入口统一使用实际/模拟 Switch 文案和可访问标签', () => {
    const actualHtml = renderToStaticMarkup(
      <PortfolioModeSwitch mode="actual" onModeChange={() => undefined} ariaLabel="估值范围" />,
    );
    const shadowHtml = renderToStaticMarkup(
      <PortfolioModeSwitch mode="shadow" onModeChange={() => undefined} ariaLabel="风险范围" />,
    );

    expect(actualHtml).toContain('估值范围');
    expect(actualHtml).not.toContain('>估值</span>');
    expect(actualHtml).toContain('当前实际，切换到模拟');
    expect(actualHtml).toContain('>实际</span>');
    expect(actualHtml).not.toContain('>模拟</span>');
    expect(shadowHtml).toContain('风险范围');
    expect(shadowHtml).not.toContain('>风险</span>');
    expect(shadowHtml).toContain('当前模拟，切换到实际');
    expect(shadowHtml).toContain('>模拟</span>');
    expect(shadowHtml).not.toContain('>实际</span>');

    const noteHtml = renderToStaticMarkup(
      <PortfolioModeNote>仅用于研究和模拟。</PortfolioModeNote>,
    );
    expect(noteHtml).toContain('模拟模式');
    expect(noteHtml).toContain('仅用于研究和模拟。');
  });

  it('事件表保留实际或模拟语义、规则版本和数据时间', () => {
    const html = renderToStaticMarkup(
      <RiskEventTable
        loadState="ready"
        events={[
          {
            id: 'event-1',
            ruleId: 'rule-1',
            ruleVersion: 3,
            severity: 'critical',
            message: '价格低于已触发',
            symbol: '159516.SZ',
            marketTime: '2026-08-23T01:00:00.000Z',
            evaluatedAt: '2026-08-23T01:01:00.000Z',
            context: { value: 90, mode: 'shadow' },
          },
        ]}
      />,
    );

    expect(html).toContain('模拟风险');
    expect(html).toContain('v3');
    expect(html).toContain('159516.SZ');
  });

  it('事件模式未知时不回退为实际风险，通知状态保留可辨识语义', () => {
    const html = renderToStaticMarkup(
      <RiskEventTable
        loadState="ready"
        events={[
          {
            id: 'event-unknown-mode',
            ruleId: 'rule-1',
            ruleVersion: 3,
            severity: 'warning',
            message: '模式未知事件',
            symbol: null,
            marketTime: null,
            evaluatedAt: '2026-08-23T01:01:00.000Z',
            context: { value: 90, mode: 'untrusted' },
          },
        ]}
      />,
    );

    expect(html).toContain('模式未知');
    expect(html).not.toContain('实际风险');
    expect(riskStatusLabel('delivered')).toBe('已送达');
    expect(riskStatusLabel('retrying')).toBe('重试中');
    expect(riskStatusLabel('unexpected')).toBe('未知状态（unexpected）');
    expect(riskStatusTone('delivered')).toBe('secondary');
    expect(riskStatusTone('retrying')).toBe('outline');
  });

  it('人工测试结果按规则版本匹配，版本变更后不复用旧结果', () => {
    const records = {
      'rule-1': {
        ruleVersion: 2,
        results: [{ triggered: true, message: '旧版本结果' }],
        testedAt: '2026-08-23T01:01:00.000Z',
      },
    };

    expect(riskTestRecordForRule(records, { id: 'rule-1', version: 2 })).toMatchObject({
      ruleVersion: 2,
      results: [{ message: '旧版本结果' }],
    });
    expect(riskTestRecordForRule(records, { id: 'rule-1', version: 3 })).toBeNull();
    expect(riskTestRecordForRule(records, { id: 'rule-2', version: 1 })).toBeNull();
  });

  it('旧账户缺失规则显示待修复，和主动停用保持区分', () => {
    const html = renderToStaticMarkup(
      <RiskRuleWorkbench
        rules={[
          {
            id: 'rule-repair',
            version: 2,
            kind: 'cost-stop',
            scope: 'security',
            severity: 'warning',
            threshold: 0.1,
            enabled: false,
            needsRepair: true,
            repairReason: 'account-binding-required',
            symbol: '159516.SZ',
            accountId: null,
            effectiveAt: '2026-08-23T01:00:00.000Z',
          },
        ]}
        accounts={[]}
        positions={portfolio.positions}
        loadState="ready"
        busyAction={null}
        onCreate={async () => true}
        onUpdate={async () => true}
        onToggle={async () => true}
        onArchive={async () => true}
        onTest={async () => []}
        testRecords={{}}
        onTestComplete={() => undefined}
        onAudit={() => undefined}
      />,
    );

    expect(html).toContain('待修复');
    expect(html).toContain('需补齐账户和标的');
    expect(html).toContain('补齐目标后启用');
  });
});
