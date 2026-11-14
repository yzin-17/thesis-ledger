import { describe, expect, it, vi } from 'vitest';
import type { RuleMonitorHistory } from '@thesis-ledger/schemas';
import { ruleMonitorStatusSchema } from '@thesis-ledger/schemas';
import { readFileSync } from 'node:fs';
import { AutomationReadService } from '../../src/automation/automation-read.service.js';
import { AutomationController } from '../../src/automation/automation.controller.js';
import {
  ruleMonitorAutomationJob,
  ruleMonitorAutomationRun,
} from '../../src/automation/rule-monitor-automation-projection.js';

const run = (): RuleMonitorHistory['items'][number] => ({
  id: '00000000-0000-4000-8000-000000000001',
  status: 'partial',
  attempt: 1,
  sourceIds: ['official-rules/cn-stock-auction-fees'],
  trigger: 'scheduled',
  createdAt: '2026-11-09T00:00:00Z',
  startedAt: '2026-11-09T00:00:01Z',
  finishedAt: '2026-11-09T00:00:02Z',
  counts: { documents: 2, changed: 1, unavailable: 1 },
  errorCode: null,
  failureDetailsAvailable: true,
  failures: [
    {
      kind: 'document',
      identity: 'https://www.sse.com.cn/rule',
      name: '收费通告',
      errorCode: 'document_http_error',
    },
  ],
});

describe('规则监测自动化读取投影', () => {
  it('部分不可读如实呈现该次失败，历史缺口不借当前观察补造', () => {
    const current = ruleMonitorAutomationRun(run());
    expect(current.status).toBe('partial');
    expect(current.error).toContain('收费通告：资料网站返回错误');
    expect(current.summary).toContain('自动检查');
    const old = ruleMonitorAutomationRun({
      ...run(),
      trigger: 'unknown',
      failures: [],
      failureDetailsAvailable: false,
    });
    expect(old.error).toContain('未保留逐项失败原因');
    expect(old.summary).toContain('触发方式未记录');
    expect(ruleMonitorAutomationJob(null)?.enabled).toBeNull();
  });
  it('任务创建后显示持久执行时间，未创建时不虚构自动化任务', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../../../../packages/schemas/fixtures/rule-source-monitor-v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(ruleMonitorAutomationJob(ruleMonitorStatusSchema.parse(fixture.status))).toBeNull();
    const status = ruleMonitorStatusSchema.parse(fixture.scheduledStatus);
    expect(ruleMonitorAutomationJob(status)).toMatchObject({
      cron: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      nextRunAt: status.config.nextRunAt,
    });
  });
  it('同一自动化历史纳入监测，读取失败保留本地历史并说明缺口', async () => {
    const local = { items: [{ id: 'local' }], page: 1, pageSize: 20, total: 1, totalPages: 1 };
    const automations = { list: vi.fn(async () => []), history: vi.fn(async () => local) };
    const prisma = {
      automationRun: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    };
    const monitor = {
      status: vi.fn(async () => {
        throw new Error('offline');
      }),
      history: vi.fn(async (offset, limit) => ({
        version: 'rule-source-monitor-v1',
        offset,
        limit,
        total: 1,
        items: [run()],
      })),
    };
    const reads = new AutomationReadService(
      automations as never,
      prisma as never,
      monitor as never,
    );
    expect((await reads.list())[0]).toMatchObject({
      source: 'rule-monitor',
      enabled: null,
      readError: 'rule_monitor_unavailable',
    });
    expect((await reads.history()).items[0]).toMatchObject({
      source: 'rule-monitor',
      status: 'partial',
    });
    monitor.history.mockRejectedValue(new Error('offline'));
    expect(await reads.history()).toMatchObject({
      ...local,
      sourceWarnings: [{ source: 'rule-monitor', code: 'rule_monitor_unavailable' }],
    });
    expect(await reads.history('rule-source-monitor')).toMatchObject({
      sourceWarnings: [{ source: 'rule-monitor' }],
    });
    expect(automations.history).not.toHaveBeenCalledWith(
      'rule-source-monitor',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
  it('通用写入入口不能对监测任务启停、编辑、删除或执行', async () => {
    const automation = { update: vi.fn(), delete: vi.fn() };
    const prisma = { automationJob: { update: vi.fn(), findUnique: vi.fn() } };
    const controller = new AutomationController(
      automation as never,
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(() => controller.update('rule-source-monitor', { enabled: true })).toThrow('规则监测');
    expect(() => controller.setEnabled('rule-source-monitor', { enabled: true })).toThrow(
      '规则监测',
    );
    expect(() => controller.remove('rule-source-monitor')).toThrow('规则监测');
    await expect(controller.run('rule-source-monitor')).rejects.toThrow('规则监测');
    expect(prisma.automationJob.findUnique).not.toHaveBeenCalled();
    expect(prisma.automationJob.update).not.toHaveBeenCalled();
    expect(automation.update).not.toHaveBeenCalled();
    expect(automation.delete).not.toHaveBeenCalled();
  });
});
