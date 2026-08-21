import { describe, expect, it, vi } from 'vitest';
import {
  buildDailyDigest,
  channelsForSeverity,
  classifyDeliveryError,
  isQuietTime,
  NotificationService,
} from '../../src/notifications/notification.service.js';

describe('通知策略', () => {
  const policy = {
    channels: { warning: ['feishu'] },
    quietHours: { start: '22:00', end: '08:00', timezone: 'Asia/Shanghai' },
    cooldownMinutes: 30,
    maxAttempts: 3,
  };
  it('跨午夜静默时段有效', () =>
    expect(isQuietTime(new Date('2025-01-01T15:00:00Z'), policy)).toBe(true));
  it('白天不静默', () => expect(isQuietTime(new Date('2025-01-01T04:00:00Z'), policy)).toBe(false));
  it.each(['info', 'warning', 'error', 'critical'] as const)('路由 %s 严重级别', (severity) =>
    expect(
      channelsForSeverity(
        { ...policy, channels: { warning: ['fallback'], [severity]: [severity] } },
        severity,
      ),
    ).toEqual([severity]),
  );
  it('区分永久错误、重试和最终失败', () => {
    expect(classifyDeliveryError('feishu_http_400:bad', 1, 3).status).toBe('failed');
    expect(classifyDeliveryError('feishu_http_500:oops', 1, 3).status).toBe('retrying');
    expect(classifyDeliveryError('feishu_http_500:oops', 3, 3).status).toBe('failed');
  });
  it('低优先级事件可聚合为日报', () =>
    expect(
      buildDailyDigest([
        { title: 'A', body: 'a', severity: 'info', traceId: '1' },
        { title: 'B', body: 'b', severity: 'warning', traceId: '2' },
      ]),
    ).toMatchObject({ title: '风险摘要（2 条）', severity: 'info' }));

  it('实际通知投递结果写入 delivery 健康来源', async () => {
    const record = vi.fn(async () => undefined);
    const service = new NotificationService(
      {
        notificationDelivery: {
          update: vi.fn(async () => ({ status: 'delivered' })),
        },
      } as never,
      {} as never,
      { record } as never,
    );

    await service.deliver(
      'delivery-1',
      { title: '测试', body: '内容', severity: 'warning', traceId: 'trace-1' },
      {
        id: 'feishu-webhook',
        send: async () => ({ summary: 'ok' }),
      },
    );

    expect(record).toHaveBeenCalledWith(
      'feishu-webhook',
      true,
      expect.any(Number),
      undefined,
      expect.any(Date),
      'delivery',
    );
  });
});
