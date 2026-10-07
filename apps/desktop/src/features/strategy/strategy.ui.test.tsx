import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { strategySchema } from '@thesis-ledger/schemas';
import { completenessLabel } from './BacktestModelDisclosure.js';
import {
  StrategyJobs,
  StrategyLibrary,
  backtestStageLabel,
  jobStatusLabel,
} from './StrategySections.js';
import {
  createDefaultStrategySchema,
  schemaFromVersion,
  schemaSymbols,
  setStrategyExecutionAssetType,
  setStrategyExecutionSymbol,
  setStrategyPrimaryTimeframe,
} from './strategy.schema.js';
import {
  fractionToPercent,
  hasUnappliedJson,
  percentToFraction,
  shouldApplyAdvancedJson,
  sizingDefaultValue,
  sizingFieldDescription,
  sizingFieldLabel,
  stopLossDefaultValue,
  stopLossFieldDescription,
  stopLossFieldLabel,
} from './strategy.formats.js';
import { validateBacktestSetup } from './strategy.actions.js';
import type { BacktestJob, StrategyRecord } from './strategy.types.js';

const schema = createDefaultStrategySchema('可复现策略');
const version = { id: 'version-1', version: 1, schema, createdAt: '2026-08-25T00:00:00.000Z' };
const strategy: StrategyRecord = {
  id: 'strategy-1',
  name: '可复现策略',
  status: 'active',
  updatedAt: '2026-08-25T00:00:00.000Z',
  versions: [version],
};
const job: BacktestJob = {
  id: 'job-1',
  strategyVersionId: 'version-1',
  status: 'running',
  progress: 45,
  period: { start: '2026-01-01', end: '2026-01-31' },
  createdAt: '2026-08-25T00:00:00.000Z',
  input: { initialCash: 100_000 },
  warnings: [],
};

describe('策略实验工作台 UI 契约', () => {
  it('策略中心页面头部使用共享刷新按钮并绑定两个策略查询的刷新状态', () => {
    const source = readFileSync(new URL('./StrategyDashboard.tsx', import.meta.url), 'utf8');

    expect(source).toContain("import { RefreshIconButton } from '../shared/RefreshIconButton.js';");
    expect(source).toContain('<RefreshIconButton');
    expect(source).toContain('label="刷新策略中心"');
    expect(source).toContain('refreshing={refreshing}');
    expect(source).not.toContain("from 'lucide-react'");
  });

  it('回测弹窗说明后台准备行情与任务进度位置', () => {
    const source = readFileSync(new URL('./BacktestSetupDialog.tsx', import.meta.url), 'utf8');

    expect(source).toContain('提交后将在后台准备行情并启动任务，进度可在回测任务中查看。');
    expect(source).toContain('grid-rows-[auto_minmax(0,1fr)_auto]');
    expect(source).toContain('variant="compact"');
    expect(source).toContain('<BacktestPricePreparation');
    expect(source).toContain('disabled={busy || !version || !currentStrategy || !prepared}');
    expect(source).not.toContain('可选，仅在需要覆盖执行假设时填写');
    expect(source).not.toContain('排队成功后将在后台启动任务');
  });

  it('策略库空态只提供首条策略 CTA，非空态在标题行提供新建入口', () => {
    const emptyHtml = renderToStaticMarkup(
      <StrategyLibrary
        strategies={[]}
        jobs={[]}
        loadState="ready"
        busyAction={null}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onBacktest={vi.fn()}
      />,
    );
    expect(emptyHtml).toContain('创建第一条策略');
    expect(emptyHtml).not.toContain('新建策略');

    const readyHtml = renderToStaticMarkup(
      <StrategyLibrary
        strategies={[
          {
            ...strategy,
            description: '这是一段足够长的策略描述，用来确认列表会截断展示而不会撑宽整张表格。',
          },
        ]}
        jobs={[{ ...job, status: 'succeeded', progress: 100 }]}
        loadState="ready"
        busyAction={null}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onBacktest={vi.fn()}
      />,
    );
    expect(readyHtml).toContain('可复现策略');
    expect(readyHtml).toContain('v1');
    expect(readyHtml).toContain('已完成');
    expect(readyHtml).toContain('开始回测');
    expect(readyHtml).toContain('新建策略');
    expect(readyHtml).toContain('max-w-80 truncate');
    expect(readyHtml).toContain('title="未配置标的 · 这是一段足够长的策略描述');
  });

  it('任务表使用中文状态、运行进度和可重试操作', () => {
    expect(jobStatusLabel('queued')).toBe('排队中');
    expect(jobStatusLabel('unknown')).toBe('未知状态（unknown）');
    const html = renderToStaticMarkup(
      <StrategyJobs
        jobs={[job]}
        strategies={[strategy]}
        loadState="ready"
        busyAction={null}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onViewResult={vi.fn()}
      />,
    );
    expect(html).toContain('运行中');
    expect(html).toContain('45%');
    expect(html).toContain('取消');
    expect(html).toContain('<td><strong>可复现策略 · v1</strong></td>');

    const terminalHtml = renderToStaticMarkup(
      <StrategyJobs
        jobs={[{ ...job, status: 'succeeded', progress: 100 }]}
        strategies={[strategy]}
        loadState="ready"
        busyAction={null}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onViewResult={vi.fn()}
      />,
    );
    expect(terminalHtml).toContain('已完成');
    expect(terminalHtml).not.toContain('100%');
  });

  it('回测阶段在展示层转换为中文', () => {
    expect(backtestStageLabel('snapshot-finalized')).toBe('快照已完成');
    expect(backtestStageLabel('artifact-read')).toBe('其他阶段');
  });

  it('V2 失败任务展示阶段、执行次数和快照重试入口', () => {
    const html = renderToStaticMarkup(
      <StrategyJobs
        jobs={[
          {
            ...job,
            mode: 'V3',
            status: 'failed',
            stage: 'artifact-read',
            executionAttempt: 2,
            errorSummary: 'Artifact 校验失败',
            diagnostics: { code: 'DATA_UNAVAILABLE', message: 'Artifact 校验失败' },
          },
        ]}
        strategies={[strategy]}
        loadState="ready"
        busyAction={null}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        onViewResult={vi.fn()}
      />,
    );

    expect(html).toContain('阶段：其他阶段');
    expect(html).toContain('执行次数：2');
    expect(html).toContain('行情文件校验失败');
    expect(html).toContain('DATA_UNAVAILABLE');
    expect(html).toContain('查看失败详情');
    expect(html).not.toContain('Artifact 校验失败');
    expect(html).toContain('重试');
  });

  it('回测任务空态只引导返回策略库', () => {
    const html = renderToStaticMarkup(
      <StrategyJobs
        jobs={[]}
        strategies={[]}
        loadState="ready"
        busyAction={null}
        onRun={vi.fn()}
        onCancel={vi.fn()}
        onViewResult={vi.fn()}
        onOpenLibrary={vi.fn()}
      />,
    );

    expect(html).toContain('返回策略库');
    expect(html).not.toContain('创建策略');
  });

  it('编辑 Schema 会同步父策略名称，执行标的来自当前合同', () => {
    const editedSchema = schemaFromVersion(version, strategy.name);
    expect(editedSchema.name).toBe(strategy.name);
    const selectedSchema = {
      ...schema,
      executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    };
    const selectedVersion = {
      ...version,
      schema: selectedSchema,
    };
    expect(schemaSymbols(selectedVersion.schema)).toEqual(['600519.SH']);
  });

  it('结果任务保留引擎、数据时点和结果校验和字段', () => {
    const resultJob: BacktestJob = {
      ...job,
      status: 'succeeded',
      result: {
        finalValue: 101_000,
        metrics: { cumulativeReturn: 0.01 },
        equityCurve: [{ date: '2026-01-01', value: 100_000 }],
        trades: [],
      },
      engineVersion: 'engine-v1',
      resultChecksum: 'checksum',
    };
    expect(resultJob.engineVersion).toBe('engine-v1');
    expect(resultJob.resultChecksum).toBe('checksum');
    expect(resultJob.result).toMatchObject({ finalValue: 101_000 });
  });

  it('数据完整性标签保持中文', () => {
    expect(completenessLabel('partial')).toBe('部分完整');
  });

  it('回测配置拒绝反向日期和非正资金', () => {
    expect(
      validateBacktestSetup({
        period: { start: '2026-02-01', end: '2026-01-01' },
        initialCash: 100,
      }),
    ).toContain('开始日期');
    expect(
      validateBacktestSetup({ period: { start: '2026-01-01', end: '2026-01-31' }, initialCash: 0 }),
    ).toContain('初始资金');
  });

  it('新建策略使用当前合同且不预填标的，比例显示与存储转换一致', () => {
    const emptySchema = createDefaultStrategySchema();
    expect(emptySchema.schemaVersion).toBe('2');
    expect(emptySchema.description).toContain('示例规则');
    expect(schemaSymbols(emptySchema)).toEqual([]);
    expect(strategySchema.safeParse(emptySchema).success).toBe(false);
    const selectedSchema = setStrategyExecutionSymbol(emptySchema, '600519.SH');
    expect(strategySchema.safeParse(selectedSchema).success).toBe(true);
    const etfSchema = setStrategyExecutionAssetType(selectedSchema, 'etf');
    expect(strategySchema.safeParse(etfSchema).success).toBe(true);
    expect(etfSchema.signalSources).toMatchObject([{ asset: { assetType: 'etf' } }]);
    expect(setStrategyPrimaryTimeframe(selectedSchema, '60m').signalSources).toMatchObject([
      { timeframe: '60m' },
    ]);
    expect(fractionToPercent(0.125)).toBe('12.5');
    expect(percentToFraction('12.5')).toBeCloseTo(0.125);
    expect(stopLossFieldLabel('atr')).toBe('ATR 倍数');
    expect(stopLossDefaultValue('fixed')).toBe(0.1);
    expect(stopLossDefaultValue('trailing')).toBe(0.1);
    expect(stopLossDefaultValue('atr')).toBe(2);
    expect(stopLossFieldDescription('fixed')).toContain('0–100%');
    expect(stopLossFieldDescription('atr')).toContain('ATR 倍数');
    expect(sizingFieldLabel('fixed')).toBe('固定投入金额');
    expect(sizingDefaultValue('fixed')).toBe(10_000);
    expect(sizingDefaultValue('weight')).toBe(0.5);
    expect(sizingDefaultValue('risk')).toBe(0.01);
    expect(sizingFieldDescription('weight')).toContain('0–100%');
    expect(sizingFieldDescription('risk')).toContain('0–100%');
    expect(hasUnappliedJson('{"name":"changed"}', { name: 'original' })).toBe(true);
    expect(
      hasUnappliedJson(JSON.stringify({ name: 'original' }, null, 2), { name: 'original' }),
    ).toBe(false);
    expect(
      shouldApplyAdvancedJson('advanced', 'common', JSON.stringify({ name: 'original' }, null, 2), {
        name: 'original',
      }),
    ).toBe(false);
    expect(
      shouldApplyAdvancedJson('advanced', 'common', '{"name":"changed"}', { name: 'original' }),
    ).toBe(true);
  });
});
