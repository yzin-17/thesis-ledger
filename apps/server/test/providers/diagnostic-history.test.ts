import { describe, expect, it, vi } from 'vitest';
import { ProviderHealthService } from '../../src/providers/provider-health.service.js';
import { ProviderHealthController } from '../../src/providers/provider-health.controller.js';
import { AutomationService } from '../../src/automation/automation.service.js';
import { AutomationController } from '../../src/automation/automation.controller.js';
import { NotificationService } from '../../src/notifications/notification.service.js';

describe('诊断历史查询', () => {
  it('来源异常先过滤再分页，排除操作过程状态并保留无错误码的慢响应降级', async () => {
    const count = vi.fn(async () => 21);
    const findMany = vi.fn(async () => [
      {
        provider: 'dsa',
        errorCode: 'timeout',
        details: { kind: 'ai_provider_validation', status: 'failed' },
      },
    ]);
    const service = new ProviderHealthService(
      { providerHealthCheck: { count, findMany } } as never,
      {} as never,
    );
    const controller = new ProviderHealthController(service);
    const page = await controller.issues('DSA', '2', '20');
    expect(page).toMatchObject({
      total: 21,
      totalPages: 2,
      page: 2,
      items: [{ errorCode: 'timeout' }],
    });
    expect(page.items[0]).not.toHaveProperty('details');
    const where = {
      provider: 'dsa',
      state: { in: ['degraded', 'down'] },
      OR: [
        { errorCode: null },
        { errorCode: { notIn: ['pending', 'operation_authorized', 'validation_cancelled'] } },
      ],
    };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
      skip: 20,
      take: 20,
    });
    await controller.history();
    expect(count).toHaveBeenLastCalledWith({ where: {} });
  });

  it('自动化筛出失败和结果待确认，分页收缩按异常数计算', async () => {
    const count = vi.fn(async () => 1);
    const findMany = vi.fn(async () => [{ id: 'run', status: 'unknown_outcome' }]);
    const service = new AutomationService(
      { automationRun: { count, findMany } } as never,
      {} as never,
      {} as never,
    );
    const controller = new AutomationController(service, {} as never, {} as never, {} as never, service as never);
    expect(await controller.issues('job', '8', '20')).toMatchObject({
      page: 1,
      total: 1,
      items: [{ status: 'unknown_outcome' }],
    });
    const where = { jobId: 'job', status: { in: ['failed', 'unknown_outcome'] } };
    expect(count).toHaveBeenCalledWith({ where });
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 20,
    });
    await controller.history();
    expect(count).toHaveBeenLastCalledWith({ where: {} });
  });

  it('通知支持失败和重试中的并集，原单状态查询保持原行为', async () => {
    const findMany = vi.fn(async () => []);
    const service = new NotificationService(
      { notificationDelivery: { findMany } } as never,
      {} as never,
      {} as never,
    );
    await service.list('failed,retrying');
    expect(findMany).toHaveBeenLastCalledWith({
      where: { status: { in: ['failed', 'retrying'] } },
      orderBy: { scheduledAt: 'desc' },
      take: 200,
    });
    await service.list('failed');
    expect(findMany).toHaveBeenLastCalledWith({
      where: { status: 'failed' },
      orderBy: { scheduledAt: 'desc' },
      take: 200,
    });
  });
});
