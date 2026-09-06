import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  AutomationTable,
  ProviderHistoryTables,
} from '../src/features/providers/ProviderSettingsSections.js';
import { ProviderSettings } from '../src/features/providers/ProviderSettings.js';
import { Toaster } from '../src/components/ui/toast.js';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import {
  AUTOMATION_SCHEDULE_CUSTOM,
  automationJobDraftFromJob,
  automationJobTypeLabel,
  automationRunStatusLabel,
  automationScheduleLabel,
  type AutomationSchedulePreset,
  dataQualitySeverityLabel,
  newAutomationJobDraft,
  notificationDeliveryStatusLabel,
  notificationErrorCodeLabel,
  providerHealthStateLabel,
} from '../src/features/providers/providers.types.js';
import {
  buildCreateAutomationJobPayload,
  buildUpdateAutomationJobPatch,
} from '../src/features/providers/providers.automation-actions.js';
import type {
  AutomationHistoryRecord,
  AutomationJob,
  NotificationFailureRecord,
  ProviderIssueRecord,
} from '../src/features/providers/providers.types.js';

const job = (overrides: Partial<AutomationJob> = {}): AutomationJob => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: '每日估值快照',
  type: 'snapshot',
  cron: '0 16 * * 1-5',
  timezone: 'Asia/Shanghai',
  enabled: true,
  nextRunAt: '2026-09-07T08:00:00.000Z',
  ...overrides,
});

describe('自动化任务标签映射', () => {
  it('七种任务类型、运行状态、健康与投递状态均有中文名且未知值兜底', () => {
    expect(automationJobTypeLabel('market-sync')).toBe('市场数据同步');
    expect(automationJobTypeLabel('risk-evaluation')).toBe('风险评估');
    expect(automationJobTypeLabel('daily-digest')).toBe('每日摘要');
    expect(automationJobTypeLabel('snapshot')).toBe('估值快照');
    expect(automationJobTypeLabel('backup')).toBe('数据备份');
    expect(automationJobTypeLabel('provider-health')).toBe('Provider 健康检查');
    expect(automationJobTypeLabel('cash-deposit-materialization')).toBe('定期入账生成');
    expect(automationJobTypeLabel('unknown-type')).toBe('其他（unknown-type）');

    expect(automationRunStatusLabel('running')).toBe('运行中');
    expect(automationRunStatusLabel('succeeded')).toBe('成功');
    expect(automationRunStatusLabel('failed')).toBe('失败');
    expect(automationRunStatusLabel('other')).toBe('其他（other）');

    expect(providerHealthStateLabel('healthy')).toBe('健康');
    expect(providerHealthStateLabel('degraded')).toBe('降级');
    expect(providerHealthStateLabel('down')).toBe('宕机');

    expect(notificationDeliveryStatusLabel('pending')).toBe('待投递');
    expect(notificationDeliveryStatusLabel('retrying')).toBe('重试中');
    expect(notificationDeliveryStatusLabel('delivered')).toBe('已送达');
    expect(notificationDeliveryStatusLabel('failed')).toBe('失败');

    expect(dataQualitySeverityLabel('info')).toBe('提示');
    expect(dataQualitySeverityLabel('warning')).toBe('警告');
    expect(dataQualitySeverityLabel('error')).toBe('错误');
  });

  it('通知未配置错误码映射为可读文案，其余原样保留', () => {
    expect(notificationErrorCodeLabel('notification_provider_unconfigured:feishu')).toBe(
      '通知 Provider 未配置',
    );
    expect(notificationErrorCodeLabel('feishu_http_500:boom')).toBe('feishu_http_500:boom');
  });

  it('执行时间预设展示预设名，未命中的 cron 显示自定义', () => {
    expect(automationScheduleLabel('0 16 * * 1-5')).toBe('每个交易日 16:00');
    expect(automationScheduleLabel('0 9 * * 1-5')).toBe('每个工作日 09:00');
    expect(automationScheduleLabel('30 15 * * *' as AutomationSchedulePreset)).toBe('自定义');
  });
});

describe('自动化任务草稿与提交契约', () => {
  it('新建草稿默认估值快照并带交易日预设', () => {
    expect(newAutomationJobDraft()).toEqual({
      name: '估值快照',
      type: 'snapshot',
      schedulePreset: '0 16 * * 1-5',
      cron: '0 16 * * 1-5',
      enabled: true,
    });
  });

  it('编辑草稿从任务预填，未命中预设的 cron 回退自定义', () => {
    const draft = automationJobDraftFromJob(job({ cron: '30 15 * * *', enabled: false }));
    expect(draft).toEqual({
      name: '每日估值快照',
      type: 'snapshot',
      schedulePreset: AUTOMATION_SCHEDULE_CUSTOM,
      cron: '30 15 * * *',
      enabled: false,
    });
  });

  it('创建载荷补齐服务端 schema 要求的默认值', () => {
    const payload = buildCreateAutomationJobPayload(newAutomationJobDraft());
    expect(payload.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(payload).toMatchObject({
      name: '估值快照',
      type: 'snapshot',
      cron: '0 16 * * 1-5',
      timezone: 'Asia/Shanghai',
      enabled: true,
      retry: { maxAttempts: 3, backoffMs: 1000 },
      lockTtlMs: 300000,
    });
  });

  it('更新载荷只包含实际变更的字段', () => {
    const current = job();
    expect(buildUpdateAutomationJobPatch({ ...automationJobDraftFromJob(current), name: '改名' }, current)).toEqual({
      name: '改名',
    });
    expect(
      buildUpdateAutomationJobPatch(
        { ...automationJobDraftFromJob(current), cron: '0 9 * * 1-5', enabled: false },
        current,
      ),
    ).toEqual({ cron: '0 9 * * 1-5', enabled: false });
    expect(buildUpdateAutomationJobPatch(automationJobDraftFromJob(current), current)).toEqual({});
  });
});

describe('自动化编辑器 Sheet 契约', () => {
  const source = readFileSync(
    new URL('../src/features/providers/AutomationEditorSheet.tsx', import.meta.url),
    'utf8',
  );

  it('创建与编辑共用表单，编辑模式禁用任务类型', () => {
    expect(source).toContain('automationJobTypes.map');
    expect(source).toContain('disabled={Boolean(editingJob)}');
    expect(source).toContain('创建任务');
    expect(source).toContain('保存修改');
    expect(source).toContain('任务类型创建后不可修改');
  });

  it('执行时间预设引用共享预设清单并提供自定义输入', () => {
    expect(source).toContain('automationSchedulePresets.map');
    expect(source).toContain('<SelectItem key={preset.value} value={preset.value}>');
    expect(source).toContain('AUTOMATION_SCHEDULE_CUSTOM');
    expect(source).toContain('Cron 表达式');
    expect(source).toContain('aria-label="启用任务"');
  });
});

describe('自动化任务表渲染', () => {
  it('类型与操作列使用中文文案并提供新建入口', () => {
    const markup = renderToStaticMarkup(
      <AutomationTable
        loadState="ready"
        jobs={[
          job({ type: 'market-sync', name: '市场数据同步任务' }),
          job({ id: '00000000-0000-4000-8000-000000000002', enabled: false }),
        ]}
        togglingJobId={null}
        runningJobId={null}
        onToggle={() => {}}
        onEdit={() => {}}
        onRun={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
      />,
    );

    expect(markup).toContain('新建任务');
    expect(markup).toContain('休市日自动跳过');
    expect(markup).toContain('市场数据同步');
    expect(markup).toContain('估值快照');
    expect(markup).toContain('编辑');
    expect(markup).toContain('立即运行');
    expect(markup).toContain('删除');
    expect(markup).not.toContain('market-sync');
    expect(markup).not.toContain('>snapshot<');
  });

  it('运行中的任务显示忙碌态', () => {
    const running = job();
    const markup = renderToStaticMarkup(
      <AutomationTable
        loadState="ready"
        jobs={[running]}
        togglingJobId={null}
        runningJobId={running.id}
        onToggle={() => {}}
        onEdit={() => {}}
        onRun={() => {}}
        onDelete={() => {}}
        onCreate={() => {}}
      />,
    );

    expect(markup).toContain('运行中…');
  });
});

describe('运行历史与状态表渲染', () => {
  const historyJob = job();
  const jobHistory: AutomationHistoryRecord[] = [
    {
      id: 'run-1',
      jobId: historyJob.id,
      status: 'succeeded',
      startedAt: '2026-09-05T08:00:00.000Z',
      error: null,
    },
    {
      id: 'run-2',
      jobId: 'missing-job-id',
      status: 'failed',
      startedAt: '2026-09-05T09:00:00.000Z',
      error: '行情接口超时',
    },
  ];
  const notificationFailures: NotificationFailureRecord[] = [
    {
      id: 'delivery-1',
      provider: 'feishu',
      status: 'retrying',
      lastError: 'notification_provider_unconfigured:feishu',
    },
  ];
  const issues: ProviderIssueRecord[] = [
    {
      id: 'issue-1',
      provider: 'tushare',
      symbol: null,
      severity: 'warning',
      code: 'stale_bars',
      status: 'open',
    },
  ];

  it('运行历史任务列解析任务名，未知任务回退 jobId 前 8 位', () => {
    const markup = renderToStaticMarkup(
      <ProviderHistoryTables
        loadState="ready"
        jobs={[historyJob]}
        jobHistory={jobHistory}
        notificationFailures={notificationFailures}
        issues={issues}
      />,
    );

    expect(markup).toContain('每日估值快照');
    expect(markup).toContain('missing-');
    expect(markup).not.toContain('missing-job-id');
    expect(markup).toContain('成功');
    expect(markup).toContain('失败');
    expect(markup).toContain('行情接口超时');
  });

  it('通知失败与数据质量级别展示中文状态', () => {
    const markup = renderToStaticMarkup(
      <ProviderHistoryTables
        loadState="ready"
        jobs={[historyJob]}
        jobHistory={[]}
        notificationFailures={notificationFailures}
        issues={issues}
      />,
    );

    expect(markup).toContain('重试中');
    expect(markup).toContain('通知 Provider 未配置');
    expect(markup).not.toContain('notification_provider_unconfigured');
    expect(markup).toContain('警告');
  });

  it('健康历史状态列展示中文', () => {
    const source = readFileSync(
      new URL('../src/features/providers/ProviderSettingsSections.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('providerHealthStateLabel(item.state)');
  });
});

describe('Provider 页接线', () => {
  const settingsSource = readFileSync(
    new URL('../src/features/providers/ProviderSettings.tsx', import.meta.url),
    'utf8',
  );

  it('页面头部使用标准 page-header 结构并包含 ghost 刷新按钮', () => {
    expect(settingsSource).toContain('<header className="page-header">');
    expect(settingsSource).toContain('page-header-actions');
    expect(settingsSource).not.toContain('entry-page-heading');
    expect(settingsSource).toContain('<RefreshIconButton');
    expect(settingsSource).toContain('label="刷新 Provider 与自动化"');
    expect(settingsSource).toContain('refreshing={providerRefreshing}');

    const refreshButtonSource = readFileSync(
      new URL('../src/features/shared/RefreshIconButton.tsx', import.meta.url),
      'utf8',
    );
    expect(refreshButtonSource).toContain('variant="ghost"');
    expect(refreshButtonSource).toContain('h-7 w-7 rounded-lg text-muted-foreground');
    expect(refreshButtonSource).toContain(
      "className={cn('size-[18px]', refreshing && 'animate-spin')}",
    );
    expect(refreshButtonSource).toContain('disabled={disabled || refreshing}');
  });

  it('页面渲染包含自动化任务面板、新建入口与刷新按钮', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <Toaster>
          <ConfirmDialogProvider>
            <ProviderSettings />
          </ConfirmDialogProvider>
        </Toaster>
      </QueryClientProvider>,
    );

    expect(markup).toContain('自动化任务');
    expect(markup).toContain('新建任务');
    expect(markup).toContain('数据与自动化');
    expect(markup).toContain('刷新 Provider 与自动化');
    expect(markup).toContain('休市日自动跳过');
  });
});
