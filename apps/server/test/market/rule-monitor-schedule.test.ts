import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MarketRuleMonitorController } from '../../src/market/market-rule-monitor.controller.js';

const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL('../../../../packages/schemas/fixtures/rule-source-monitor-v1.json', import.meta.url),
      'utf8',
    ),
  );

describe('监测来源创建与执行时间接口', () => {
  it('两个写入口分别绑定来源与计划，并核对响应修订', async () => {
    const sample = fixture();
    const control = vi
      .fn()
      .mockResolvedValueOnce(sample.taskResponse)
      .mockResolvedValueOnce(sample.scheduleResponse);
    const controller = new MarketRuleMonitorController({ control } as never);
    expect(await controller.createTask(sample.taskRequest)).toEqual(sample.taskResponse);
    expect(control.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(sample.taskRequest),
    });
    expect(await controller.schedule(sample.scheduleRequest)).toEqual(sample.scheduleResponse);
    expect(control.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify(sample.scheduleRequest),
    });
  });
  it('来源创建不能设置时间，时间编辑不能带来源或启用字段', async () => {
    const sample = fixture();
    const control = vi.fn();
    const controller = new MarketRuleMonitorController({ control } as never);
    await expect(
      controller.createTask({ ...sample.taskRequest, cron: '0 9 * * *' }),
    ).rejects.toThrow('检查来源');
    await expect(
      controller.schedule({ ...sample.scheduleRequest, sourceIds: sample.taskRequest.sourceIds }),
    ).rejects.toThrow('执行时间');
    await expect(controller.schedule({ ...sample.scheduleRequest, enabled: true })).rejects.toThrow(
      '执行时间',
    );
    expect(control).not.toHaveBeenCalled();
  });
  it('未绑定的计划响应不能视为保存成功', async () => {
    const sample = fixture();
    const control = vi.fn().mockResolvedValue(sample.taskResponse);
    const controller = new MarketRuleMonitorController({ control } as never);
    await expect(controller.schedule(sample.scheduleRequest)).rejects.toThrow('响应与请求不一致');
  });
});
