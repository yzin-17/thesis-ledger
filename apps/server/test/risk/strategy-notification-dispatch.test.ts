import { describe, expect, it, vi } from 'vitest';
import { NotificationDispatcher } from '../../src/notifications/notification.dispatcher.js';

describe('策略风险通知发送前门禁', () => {
  it('投递前先清理已经失效的策略应用修订', async () => {
    const calls: string[] = [];
    const prisma = {
      $executeRaw: vi.fn(async () => {
        calls.push('guard');
        return 1;
      }),
    };
    const notifications = {
      dispatchDue: vi.fn(async () => {
        calls.push('dispatch');
        return [];
      }),
    };
    const dispatcher = new NotificationDispatcher(notifications as never, prisma as never);

    await expect(dispatcher.runNow(new Date('2026-09-11T08:00:00Z'))).resolves.toEqual({
      skipped: false,
      deliveries: [],
    });
    expect(calls).toEqual(['guard', 'dispatch']);
  });
});
