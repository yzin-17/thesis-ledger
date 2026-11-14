import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { updateRuleMonitorExecutionTime } from '../src/features/providers/rule-monitor-schedule-api.js';
import { automationJobDraftFromJob } from '../src/features/providers/providers.types.js';
import { automationScheduleOptions } from '../src/features/providers/automation-schedule-options.js';
import type { DesktopRequestClient } from '../src/features/shared/request.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../../../packages/schemas/fixtures/rule-source-monitor-v1.json', import.meta.url),
      'utf8',
    ),
  );

describe('自动化执行时间与规则页来源分工', () => {
  it('时间更新使用最新修订且只提交计划，不发送来源或开关', async () => {
    const sample = fixture();
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ...sample.status, config: sample.taskResponse.config })
      .mockResolvedValueOnce(sample.scheduleResponse);
    const client = { request } as unknown as DesktopRequestClient;
    const result = await updateRuleMonitorExecutionTime({ cron: '0 9 * * *' }, client);
    expect(request.mock.calls[1]![0]).toBe('/api/market-data/rule-monitor/schedule');
    expect(JSON.parse(request.mock.calls[1]![1].body)).toEqual(sample.scheduleRequest);
    expect(result.cron).toBe('0 9 * * *');
    expect(result.enabled).toBe(sample.taskResponse.config.enabled);
    expect(result.nextRunAt).toBe(sample.scheduleResponse.config.nextRunAt);
  });
  it('只允许时间字段，未创建任务不能在自动化中隐式创建', async () => {
    const request = vi.fn().mockResolvedValue(fixture().status);
    const client = { request } as unknown as DesktopRequestClient;
    await expect(updateRuleMonitorExecutionTime({ enabled: true }, client)).rejects.toThrow(
      '只调整执行时间',
    );
    expect(request).not.toHaveBeenCalled();
    await expect(updateRuleMonitorExecutionTime({ cron: '0 9 * * *' }, client)).rejects.toThrow(
      '先在规则检测页创建',
    );
    expect(request).toHaveBeenCalledOnce();
  });
  it('默认24小时与预设回显复用同一中文标签，普通任务不增加间隔选项', () => {
    const sample = fixture();
    const config = sample.taskResponse.config;
    const draft = automationJobDraftFromJob({
      id: 'rule-source-monitor',
      name: '收费资料更新检查',
      type: 'rule-source-monitor',
      managed: true,
      source: 'rule-monitor',
      ...config,
    });
    expect(draft.schedulePreset).toBe('@every24h');
    expect(
      automationScheduleOptions(true).find((item) => item.value === draft.schedulePreset)?.label,
    ).toBe('每24小时');
    expect(automationScheduleOptions(false).some((item) => item.value === '@every24h')).toBe(false);
    expect(
      automationScheduleOptions(true).find((item) => item.value === '0 16 * * 1-5')?.label,
    ).toBe('每个工作日 16:00');
  });
});
