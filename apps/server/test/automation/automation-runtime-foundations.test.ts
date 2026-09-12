import { describe, expect, it, vi } from 'vitest';
import { cnTradingCalendar } from '@thesis-ledger/domain';
import {
  automationJobTypes,
  automationJobTypeSchema,
  isMarketAutomationJobType,
} from '@thesis-ledger/schemas';
import { AutomationRuntimeHandlers } from '../../src/automation/automation-runtime.service.js';
import { AutomationController } from '../../src/automation/automation.controller.js';
import {
  AutomationService,
  DEFAULT_AUTOMATION_HISTORY_PAGE_SIZE,
  MAX_AUTOMATION_HISTORY_PAGE_SIZE,
  nextCronOccurrence,
} from '../../src/automation/automation.service.js';

describe('Automation history pagination', () => {
  it('按任务过滤并只读取请求页，使用稳定倒序', async () => {
    const count = vi.fn(async () => 45);
    const findMany = vi.fn(async () => [{ id: 'run-21' }]);
    const service = new AutomationService(
      { automationRun: { count, findMany } } as never,
      {} as never,
      {} as never,
    );

    await expect(service.history('job-1', 2, 20)).resolves.toEqual({
      items: [{ id: 'run-21' }],
      page: 2,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
    expect(count).toHaveBeenCalledWith({ where: { jobId: 'job-1' } });
    expect(findMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1' },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 20,
    });
  });

  it('限制单页数量并把越界页回落到最后一页', async () => {
    const findMany = vi.fn(async () => []);
    const service = new AutomationService(
      { automationRun: { count: vi.fn(async () => 201), findMany } } as never,
      {} as never,
      {} as never,
    );

    await expect(service.history(undefined, 99, 500)).resolves.toMatchObject({
      page: 3,
      pageSize: MAX_AUTOMATION_HISTORY_PAGE_SIZE,
      total: 201,
      totalPages: 3,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 200, take: MAX_AUTOMATION_HISTORY_PAGE_SIZE }),
    );
  });

  it('空历史和非法数字使用安全默认值', async () => {
    const findMany = vi.fn(async () => []);
    const service = new AutomationService(
      { automationRun: { count: vi.fn(async () => 0), findMany } } as never,
      {} as never,
      {} as never,
    );

    await expect(service.history(undefined, Number.NaN, 0)).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: DEFAULT_AUTOMATION_HISTORY_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    });
  });

  it('Controller 不把非法查询参数传给服务', () => {
    const automations = { history: vi.fn() };
    const controller = new AutomationController(
      automations as never,
      {} as never,
      {} as never,
      {} as never,
    );

    controller.history('job-1', 'not-a-page', '-3');
    expect(automations.history).toHaveBeenCalledWith('job-1', undefined, undefined);
  });
});

describe('Automation cron', () => {
  it('单值小时只匹配指定小时', () => {
    expect(
      nextCronOccurrence('0 9 * * *', 'Asia/Shanghai', new Date('2026-08-20T00:00:00Z')),
    ).toEqual(new Date('2026-08-20T01:00:00Z'));
    expect(
      nextCronOccurrence('0 9 * * *', 'Asia/Shanghai', new Date('2026-08-20T01:00:30Z')),
    ).toEqual(new Date('2026-08-21T01:00:00Z'));
  });

  it('支持 step、range 和 list', () => {
    expect(
      nextCronOccurrence('*/5 * * * *', 'Asia/Shanghai', new Date('2026-08-20T01:01:00Z')),
    ).toEqual(new Date('2026-08-20T01:05:00Z'));
    expect(
      nextCronOccurrence('0,30 9-10 * * *', 'Asia/Shanghai', new Date('2026-08-20T01:00:00Z')),
    ).toEqual(new Date('2026-08-20T01:30:00Z'));
  });

  it('timezone 会随 DST 改变 UTC 执行时刻', () => {
    expect(
      nextCronOccurrence('0 9 * * *', 'America/New_York', new Date('2026-01-15T00:00:00Z')),
    ).toEqual(new Date('2026-01-15T14:00:00Z'));
    expect(
      nextCronOccurrence('0 9 * * *', 'America/New_York', new Date('2026-07-15T00:00:00Z')),
    ).toEqual(new Date('2026-07-15T13:00:00Z'));
  });
});

describe('Automation job types', () => {
  it('所有 job type 都由 schemas 单一来源约束', () => {
    expect(automationJobTypes.map((type) => automationJobTypeSchema.parse(type))).toEqual([
      'market-sync',
      'risk-evaluation',
      'daily-digest',
      'valuation-intraday-sample',
      'snapshot-close-estimate',
      'snapshot-official-reconcile',
      'backup',
      'provider-health',
      'cash-deposit-materialization',
      'fund-investment-materialization',
    ]);
    expect(isMarketAutomationJobType('market-sync')).toBe(true);
    expect(isMarketAutomationJobType('risk-evaluation')).toBe(true);
    expect(isMarketAutomationJobType('daily-digest')).toBe(true);
    expect(isMarketAutomationJobType('valuation-intraday-sample')).toBe(true);
    expect(isMarketAutomationJobType('snapshot-close-estimate')).toBe(true);
    expect(isMarketAutomationJobType('snapshot-official-reconcile')).toBe(false);
    expect(isMarketAutomationJobType('backup')).toBe(false);
    expect(isMarketAutomationJobType('provider-health')).toBe(false);
    expect(isMarketAutomationJobType('cash-deposit-materialization')).toBe(false);
    expect(isMarketAutomationJobType('fund-investment-materialization')).toBe(false);
  });
});

describe('Automation runtime handlers', () => {
  it('定期现金入账 handler 使用调度时刻补齐到期实例', async () => {
    const materializeDue = vi.fn(async () => ({ planCount: 1, results: [] }));
    const handlers = new AutomationRuntimeHandlers(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { materializeDue } as never,
      { materializeDue: vi.fn() } as never,
    );
    const scheduledAt = new Date('2026-08-31T01:00:00.000Z');

    await expect(
      handlers.for('cash-deposit-materialization').run(new AbortController().signal, scheduledAt),
    ).resolves.toEqual({ planCount: 1, results: [] });
    expect(materializeDue).toHaveBeenCalledWith(scheduledAt);
  });

  it('基金定投 handler 使用调度时刻生成待确认记录', async () => {
    const materializeDue = vi.fn(async () => ({ planCount: 1, results: [] }));
    const handlers = new AutomationRuntimeHandlers(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { materializeDue: vi.fn() } as never,
      { materializeDue } as never,
    );
    const scheduledAt = new Date('2026-09-08T01:00:00.000Z');

    await expect(
      handlers
        .for('fund-investment-materialization')
        .run(new AbortController().signal, scheduledAt),
    ).resolves.toEqual({ planCount: 1, results: [] });
    expect(materializeDue).toHaveBeenCalledWith(scheduledAt);
  });
});

describe('A 股 TradingCalendar', () => {
  it('春节、国庆休市，普通工作日开市', () => {
    expect(cnTradingCalendar.status('2026-02-20T12:00:00+08:00')).toMatchObject({
      open: false,
      reason: 'exchange-holiday',
    });
    expect(cnTradingCalendar.status('2026-10-05T12:00:00+08:00')).toMatchObject({
      open: false,
      reason: 'exchange-holiday',
    });
    expect(cnTradingCalendar.status('2026-08-20T12:00:00+08:00')).toMatchObject({
      open: true,
      reason: 'open',
    });
  });

  it('未覆盖年份保守跳过而不是猜测开市', () => {
    expect(cnTradingCalendar.status('2027-03-01T12:00:00+08:00')).toMatchObject({
      open: false,
      reason: 'calendar-unavailable',
    });
  });
});
