import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ruleMonitorCheckSchema,
  ruleMonitorConfigureSchema,
  ruleMonitorJobResponseSchema,
  ruleMonitorStatusSchema,
  ruleMonitorVersionsSchema,
  ruleMonitorHistorySchema,
  ruleMonitorTaskSchema,
  ruleMonitorScheduleSchema,
  ruleMonitorConfigResponseSchema,
} from '../src/rule-source-monitor.js';

const fixture = () =>
  JSON.parse(
    readFileSync(new URL('../fixtures/rule-source-monitor-v1.json', import.meta.url), 'utf8'),
  );
describe('DSA生成的收费资料监测合同', () => {
  it('解析当前九来源、受控首次观察与变化版本，来源配置默认关闭', () => {
    const sample = fixture();
    const first = ruleMonitorStatusSchema.parse(sample.status);
    const changed = ruleMonitorStatusSchema.parse(sample.changedStatus);
    expect(first.sources).toHaveLength(9);
    expect(first.config.enabled).toBe(false);
    expect(first.latestRun?.counts.documents).toBe(5);
    expect(changed.latestRun?.counts.changed).toBe(5);
    expect(ruleMonitorJobResponseSchema.parse(sample.queued).run.attempt).toBe(0);
    expect(ruleMonitorVersionsSchema.parse(sample.versions).versions).toHaveLength(2);
    const history = ruleMonitorHistorySchema.parse(sample.history);
    expect(history.items).toHaveLength(2);
    expect(history.items[0]?.trigger).toBe('manual');
    expect(history.total).toBe(2);
  });
  it('不接受任意URL、重复来源、无来源开启或不合法执行状态', () => {
    const sample = fixture();
    expect(
      ruleMonitorCheckSchema.safeParse({ ...sample.request, url: 'https://example.invalid' })
        .success,
    ).toBe(false);
    expect(
      ruleMonitorCheckSchema.safeParse({
        ...sample.request,
        sourceIds: [...sample.request.sourceIds, ...sample.request.sourceIds],
      }).success,
    ).toBe(false);
    expect(
      ruleMonitorConfigureSchema.safeParse({
        version: sample.request.version,
        expectedRevision: 0,
        enabled: true,
        sourceIds: [],
      }).success,
    ).toBe(false);
    sample.queued.run.status = 'succeeded';
    expect(ruleMonitorJobResponseSchema.safeParse(sample.queued).success).toBe(false);
  });
  it('创建默认24小时任务，时间保存与来源保存各有独立字段', () => {
    const sample = fixture();
    expect(ruleMonitorTaskSchema.parse(sample.taskRequest).sourceIds).toHaveLength(1);
    const created = ruleMonitorConfigResponseSchema.parse(sample.taskResponse).config;
    expect(created.taskCreated).toBe(true);
    expect(created.cron).toBe('@every24h');
    expect(ruleMonitorScheduleSchema.parse(sample.scheduleRequest).cron).toBe('0 9 * * *');
    expect(
      ruleMonitorTaskSchema.safeParse({ ...sample.taskRequest, cron: '0 9 * * *' }).success,
    ).toBe(false);
    expect(
      ruleMonitorScheduleSchema.safeParse({
        ...sample.scheduleRequest,
        sourceIds: sample.taskRequest.sourceIds,
      }).success,
    ).toBe(false);
  });
});
