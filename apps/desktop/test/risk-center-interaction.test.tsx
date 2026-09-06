import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  NotificationProviderNotice,
  RiskEventTable,
  RiskNotificationTable,
} from '../src/features/risk/RiskSections.js';
import { RiskRuleWorkbench } from '../src/features/risk/RiskRuleWorkbench.js';
import { toInput, validateDraft } from '../src/features/risk/RiskRuleEditorSheet.js';
import { isPortfolioScanReady, portfolioDataStatus } from '../src/features/risk/RiskOverview.js';
import {
  PortfolioModeNote,
  PortfolioModeSwitch,
} from '../src/features/shared/PortfolioModeSwitch.js';
import { buildRiskContexts, riskActionFeedback } from '../src/features/risk/risk.actions.js';
import {
  formatThreshold,
  riskRuleNeedsAccount,
  riskRuleScopeOptionsForKind,
  riskTestRecordForRule,
  riskEventValueLabel,
  riskStatusLabel,
  riskStatusTone,
  riskSubjectLabel,
  rulePreview,
} from '../src/features/risk/risk.format.js';
import type { Portfolio } from '../src/features/portfolio/portfolio.types.js';

describe('风险事件数值标签', () => {
  it('优先读取服务端 valueMetric 语义标识', () => {
    expect(
      riskEventValueLabel({ value: 0.15, metadata: { valueMetric: 'distance_to_cost' } }),
    ).toBe('距成本 15.00%');
    expect(riskEventValueLabel({ value: 0.25, metadata: { valueMetric: 'weight' } })).toBe(
      '权重 25.00%',
    );
    expect(
      riskEventValueLabel({ value: 71, metadata: { valueMetric: 'rsi', direction: 'above' } }),
    ).toBe('RSI 71');
  });

  it('存量事件按 inputs 反推，未知标识回落触发值', () => {
    expect(riskEventValueLabel({ value: 0.15, inputs: { costPrice: 100 } })).toBe('距成本 15.00%');
    expect(
      riskEventValueLabel({ value: 0.2, metadata: { valueMetric: 'future_metric' } }),
    ).toBe('触发值 0.2');
  });
});

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
    expect(actualHtml).toContain('data-slot="switch"');
    expect(actualHtml).toContain('data-mode="actual"');
    expect(actualHtml).toContain('实际');
    expect(actualHtml).toContain('模拟');
    expect(actualHtml).toContain('当前实际，切换到模拟');
    expect(actualHtml).toContain('left-2 px-1 opacity-100');
    expect(actualHtml).toContain('right-2 px-1 opacity-0');
    expect(shadowHtml).toContain('风险范围');
    expect(shadowHtml).toContain('data-slot="switch"');
    expect(shadowHtml).toContain('data-mode="shadow"');
    expect(shadowHtml).toContain('实际');
    expect(shadowHtml).toContain('模拟');
    expect(shadowHtml).toContain('当前模拟，切换到实际');
    expect(shadowHtml).toContain('left-2 px-1 opacity-0');
    expect(shadowHtml).toContain('right-2 px-1 opacity-100');

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
            message: '159516.SZ · 价格低于 90 已触发',
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
    // 副标题展示格式化后的触发指标，不再重复标的代码或暴露原始 value=
    expect(html).toContain('触发值 90');
    expect(html).not.toContain('value=');
  });

  it('事件副标题按规则族格式化触发指标', () => {
    const html = renderToStaticMarkup(
      <RiskEventTable
        loadState="ready"
        events={[
          {
            id: 'event-cost-stop',
            ruleId: 'rule-1',
            ruleVersion: 2,
            severity: 'warning',
            message: '510300.SH · 沪深300ETF华泰柏瑞 · 同花顺 · 成本止损 1% 已触发',
            symbol: '510300.SH',
            marketTime: '2026-08-23T01:00:00.000Z',
            evaluatedAt: '2026-08-23T01:01:00.000Z',
            context: {
              value: -0.0268,
              reference: 0.01,
              mode: 'actual',
              inputs: { price: 3.7, costPrice: 3.8 },
            },
          },
        ]}
      />,
    );

    expect(html).toContain('距成本 -2.68%');
    expect(html).not.toContain('510300.SH · 510300.SH');
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
    expect(riskSubjectLabel('risk-event')).toBe('风险事件');
    expect(riskSubjectLabel('recurring-cash-deposit-plan')).toBe('定期入账计划');
  });

  it('通知表使用 subject 字段并显示可识别的主题标签', () => {
    const html = renderToStaticMarkup(
      <RiskNotificationTable
        loadState="ready"
        routes={[
          { channel: 'feishu', provider: 'lark-webhook' },
          { channel: 'feishu', provider: '飞书' },
        ]}
        routingState="ready"
        deliveries={[
          {
            id: 'delivery-1',
            subjectType: 'risk-event',
            subjectId: 'event-1',
            channel: 'feishu',
            severity: 'warning',
            status: 'delivered',
            attemptCount: 1,
            scheduledAt: '2026-08-23T01:00:00.000Z',
            lastError: null,
          },
          {
            id: 'delivery-2',
            subjectType: 'risk-event',
            subjectId: 'event-2',
            channel: 'feishu',
            severity: 'warning',
            status: 'failed',
            attemptCount: 3,
            scheduledAt: '2026-08-23T01:00:00.000Z',
            lastError: 'notification_provider_unconfigured:feishu',
          },
        ]}
      />,
    );

    expect(html).toContain('飞书 · 风险事件');
    expect(html).toContain('lark-webhook（飞书）');
    // Provider 名称与渠道中文名相同时不追加括号，避免“飞书（飞书）”
    expect(html).not.toContain('飞书（飞书）');
    // 错误码转为可读文案（渠道已在行标题展示，不再重复），不展示原始代码
    expect(html).toContain('通知 Provider 未配置');
    expect(html).not.toContain('notification_provider_unconfigured');
    expect(html).toContain('主题 event-1');
    expect(html).not.toContain('事件 undefined');
  });

  it('通知表不内嵌 Provider 缺失提示，提示提升到风险中心主上下文', () => {
    const html = renderToStaticMarkup(
      <RiskNotificationTable loadState="ready" deliveries={[]} routes={[]} routingState="ready" />,
    );

    expect(html).not.toContain('尚未配置可用的通知 Provider');
    expect(html).not.toContain('配置通知 Provider');
  });

  it('路由读取失败时不误报为未配置', () => {
    const html = renderToStaticMarkup(
      <NotificationProviderNotice
        mode="actual"
        availability="unknown"
        routingState="error"
        onConfigure={vi.fn()}
      />,
    );

    expect(html).toContain('通知 Provider 状态暂不可用');
    expect(html).not.toContain('尚未配置可用的通知 Provider');
  });

  it('Provider 缺失提示在风险中心主上下文可见，模拟模式不重复警告', () => {
    const actual = renderToStaticMarkup(
      <NotificationProviderNotice
        mode="actual"
        availability="unconfigured"
        routingState="ready"
        onConfigure={vi.fn()}
      />,
    );
    const shadow = renderToStaticMarkup(
      <NotificationProviderNotice
        mode="shadow"
        availability="unconfigured"
        routingState="ready"
        onConfigure={vi.fn()}
      />,
    );

    expect(actual).toContain('尚未配置可用的通知 Provider');
    expect(actual).toContain('配置通知 Provider');
    expect(shadow).toBe('');
  });

  it('路由仍在确认时不把加载中误报为状态不可用', () => {
    const html = renderToStaticMarkup(
      <NotificationProviderNotice
        mode="actual"
        availability="unknown"
        routingState="loading"
        onConfigure={vi.fn()}
      />,
    );

    expect(html).toBe('');
  });

  it('风险动作反馈明确区分规则试算、Provider 缺失和模拟模式', () => {
    expect(riskActionFeedback('test', 'actual', 'unconfigured', 1)).toMatchObject({
      type: 'warning',
      description: expect.stringContaining('人工测试只验证规则，不发送通知'),
    });
    expect(riskActionFeedback('scan', 'actual', 'unconfigured', 1)).toMatchObject({
      type: 'warning',
      description: expect.stringContaining('当前未配置通知 Provider，本次未发送通知'),
    });
    expect(riskActionFeedback('scan', 'shadow', 'available', 1)).toMatchObject({
      type: 'info',
      description: expect.stringContaining('模拟模式不会发送通知'),
    });
  });

  it('风险扫描反馈覆盖已配置、状态未知和无新事件三种结果', () => {
    expect(riskActionFeedback('scan', 'actual', 'available', 2)).toMatchObject({
      type: 'success',
      description: expect.stringContaining('通知已按当前 Provider 配置处理'),
    });
    expect(riskActionFeedback('scan', 'actual', 'unknown', 2)).toMatchObject({
      type: 'warning',
      description: expect.stringContaining('暂时无法确认通知 Provider 状态'),
    });
    expect(riskActionFeedback('scan', 'actual', 'available', 0)).toMatchObject({
      type: 'success',
      description: expect.stringContaining('本次扫描未产生新的风险事件'),
    });
  });

  it('人工测试反馈在已配置 Provider 时说明是规则试算', () => {
    expect(riskActionFeedback('test', 'actual', 'available', 1)).toMatchObject({
      type: 'info',
      description: expect.stringContaining('人工测试只验证规则，不发送通知'),
    });
    expect(riskActionFeedback('test', 'actual', 'available', 1).description).not.toContain(
      '未配置通知 Provider',
    );
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
            archivedAt: null,
            assetName: '半导体设备ETF国泰',
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
        onRestore={async () => true}
        onTest={async () => []}
        testRecords={{}}
        onTestComplete={() => undefined}
        onAudit={() => undefined}
      />,
    );

    expect(html).toContain('待修复');
    expect(html).toContain('需补齐账户和标的');
    expect(html).toContain('补齐目标后启用');
    // 列表项为“标的名 · 代码”，悬停 title 保留完整标签
    expect(html).toContain('半导体设备ETF国泰 · 159516.SZ · v2');
  });

  it('已归档规则退出默认列表，显示已归档后仅保留恢复和审计', () => {
    const html = renderToStaticMarkup(
      <RiskRuleWorkbench
        rules={[
          {
            id: 'rule-archived',
            version: 3,
            kind: 'price-below',
            scope: 'security',
            severity: 'warning',
            threshold: 10,
            enabled: false,
            needsRepair: false,
            repairReason: null,
            archivedAt: '2026-09-05T00:00:00.000Z',
            assetName: '贵州茅台',
            symbol: '600519.SH',
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
        onRestore={async () => true}
        onTest={async () => []}
        testRecords={{}}
        onTestComplete={() => undefined}
        onAudit={() => undefined}
      />,
    );

    expect(html).toContain('已归档');
    expect(html).toContain('显示已归档');
    expect(html).toContain('恢复规则');
    expect(html).toContain('查看审计');
    // 标的名展示在标题小字中，网格不再重复“范围/目标”
    expect(html).toContain('证券 · 600519.SH · 贵州茅台');
    expect(html).not.toContain('>目标<');
    expect(html).not.toContain('>范围<');
    expect(html).not.toContain('>归档规则<');
    expect(html).not.toContain('>启用规则<');
    expect(html).not.toContain('>人工测试<');
  });
});
