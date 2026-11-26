import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ruleMonitorCheckSchema,
  ruleMonitorConfigureSchema,
  ruleMonitorConfigResponseSchema,
  ruleMonitorJobResponseSchema,
  ruleMonitorStatusSchema,
  ruleMonitorTaskSchema,
  ruleMonitorHistorySchema,
} from '../src/rule-source-monitor.js';

const sample = JSON.parse(
  readFileSync(new URL('../fixtures/rule-source-monitor-v1.json', import.meta.url), 'utf8'),
);

describe('监测来源目录扩展', () => {
  it('完整接收扩展后的文档计数与失败历史', () => {
    const count = 53;
    const status = structuredClone(sample.status);
    status.sources[0].documentCount = count;
    expect(ruleMonitorStatusSchema.parse(status).sources[0]?.documentCount).toBe(count);
    const history = structuredClone(sample.history);
    history.items[0].failures = Array.from({ length: count }, (_, index) => ({
      kind: 'document',
      identity: `https://www.sse.com.cn/rule-${index}`,
      name: '受控文档',
      errorCode: 'run_budget_exceeded',
    }));
    expect(ruleMonitorHistorySchema.parse(history).items[0]?.failures).toHaveLength(count);
  });
  it.each([10, 17])('完整接受 %i 个来源的请求、配置、目录和任务结果', (count) => {
    const sourceIds = Array.from({ length: count }, (_, i) => `official-rules/source-${i}`);
    expect(ruleMonitorTaskSchema.parse({ ...sample.taskRequest, sourceIds }).sourceIds).toEqual(
      sourceIds,
    );
    expect(
      ruleMonitorConfigureSchema.parse({
        ...sample.taskRequest,
        sourceIds,
        enabled: true,
      }).sourceIds,
    ).toEqual(sourceIds);
    expect(ruleMonitorCheckSchema.parse({ ...sample.request, sourceIds }).sourceIds).toEqual(
      sourceIds,
    );
    const config = { ...sample.taskResponse.config, sourceIds };
    expect(
      ruleMonitorConfigResponseSchema.parse({ ...sample.taskResponse, config }).config.sourceIds,
    ).toEqual(sourceIds);
    expect(
      ruleMonitorJobResponseSchema.parse({
        ...sample.queued,
        run: { ...sample.queued.run, sourceIds },
      }).run.sourceIds,
    ).toEqual(sourceIds);
    const status = ruleMonitorStatusSchema.parse({
      ...sample.status,
      config,
      sources: sourceIds.map((identity) => ({ ...sample.status.sources[0], identity })),
    });
    expect(status.sources.map((source) => source.identity)).toEqual(sourceIds);
    for (const invalid of [
      [],
      [...sourceIds, sourceIds[0]],
      [...sourceIds, 'https://invalid.test'],
    ]) {
      expect(
        ruleMonitorTaskSchema.safeParse({ ...sample.taskRequest, sourceIds: invalid }).success,
      ).toBe(false);
      expect(
        ruleMonitorCheckSchema.safeParse({ ...sample.request, sourceIds: invalid }).success,
      ).toBe(false);
      expect(
        ruleMonitorConfigureSchema.safeParse({
          ...sample.taskRequest,
          sourceIds: invalid,
          enabled: true,
        }).success,
      ).toBe(false);
    }
    expect(
      ruleMonitorConfigureSchema.parse({
        ...sample.taskRequest,
        sourceIds: [],
        enabled: false,
      }).sourceIds,
    ).toEqual([]);
  });
});
