import { Injectable } from '@nestjs/common';
import type { Severity } from '@thesis-ledger/domain';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import { ProviderHealthService } from '../providers/provider-health.service.js';

export interface NotificationPolicy {
  channels: Partial<Record<Severity, string[]>>;
  quietHours?: { start: string; end: string; timezone: string };
  cooldownMinutes: number;
  maxAttempts: number;
}

export interface NotificationMessage {
  title: string;
  body: string;
  severity: Severity;
  traceId: string;
}

export interface NotificationProvider {
  readonly id: string;
  send(message: NotificationMessage, signal: AbortSignal): Promise<{ summary: string }>;
}

export const channelsForSeverity = (policy: NotificationPolicy, severity: Severity) =>
  policy.channels[severity] ?? policy.channels.warning ?? [];

export const classifyDeliveryError = (detail: string, attempt: number, maxAttempts: number) => {
  const status = Number(detail.match(/_http_(\d{3})/)?.[1]);
  const permanent = status >= 400 && status < 500 && status !== 429;
  const exhausted = attempt >= maxAttempts;
  return {
    status: permanent || exhausted ? ('failed' as const) : ('retrying' as const),
    retryable: !permanent && !exhausted,
    errorCode: detail.split(':')[0] || 'notification_error',
    retryAfterMs: permanent || exhausted ? null : 1000 * 2 ** (attempt - 1),
  };
};

export const buildDailyDigest = (messages: readonly NotificationMessage[]) => ({
  title: `风险摘要（${messages.length} 条）`,
  body: messages
    .map((message) => `- [${message.severity}] ${message.title}: ${message.body}`)
    .join('\n'),
  severity: messages.some((message) => message.severity === 'critical')
    ? ('critical' as const)
    : messages.some((message) => message.severity === 'error')
      ? ('error' as const)
      : ('info' as const),
  traceId: crypto.randomUUID(),
});

export class FeishuWebhookProvider implements NotificationProvider {
  readonly id = 'feishu-webhook';
  constructor(private readonly webhookUrl: string) {}
  async send(message: NotificationMessage, signal: AbortSignal) {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text: `${message.title}\n${message.body}` },
      }),
    });
    const summary = (await response.text()).slice(0, 500);
    if (!response.ok) throw new Error(`feishu_http_${response.status}:${summary}`);
    return { summary };
  }
}

export const isQuietTime = (date: Date, policy: NotificationPolicy): boolean => {
  if (!policy.quietHours) return false;
  const local = new Intl.DateTimeFormat('en-GB', {
    timeZone: policy.quietHours.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  const { start, end } = policy.quietHours;
  return start <= end ? local >= start && local < end : local >= start || local < end;
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly providerHealth: ProviderHealthService,
  ) {}

  async enqueue(eventId: string, severity: Severity, policy: NotificationPolicy, now = new Date()) {
    const channels = channelsForSeverity(policy, severity);
    const scheduledAt =
      isQuietTime(now, policy) && severity !== 'critical'
        ? new Date(new Date(now).setHours(8, 0, 0, 0) + 86_400_000)
        : now;
    return Promise.all(
      channels.map(async (channel) => {
        const dedupKey = `${eventId}:${severity}`;
        const reserved = await this.redis.client.set(
          redisKey('cache', `notification:${channel}:${dedupKey}`),
          '1',
          'EX',
          Math.max(1, policy.cooldownMinutes * 60),
          'NX',
        );
        if (!reserved) return null;
        return this.prisma.notificationDelivery.upsert({
          where: { dedupKey_channel: { dedupKey, channel } },
          update: { status: 'pending', scheduledAt },
          create: {
            eventId,
            severity,
            channel,
            provider: channel,
            status: 'pending',
            dedupKey,
            scheduledAt,
          },
        });
      }),
    );
  }

  async deliver(
    id: string,
    message: NotificationMessage,
    provider: NotificationProvider,
    maxAttempts = 3,
  ) {
    const started = Date.now();
    try {
      const result = await provider.send(message, AbortSignal.timeout(5000));
      const delivery = await this.prisma.notificationDelivery.update({
        where: { id },
        data: {
          provider: provider.id,
          status: 'delivered',
          attemptCount: { increment: 1 },
          deliveredAt: new Date(),
          responseSummary: result.summary,
        },
      });
      await this.recordDeliveryHealth(provider.id, true, Date.now() - started);
      return delivery;
    } catch (error) {
      const detail = error instanceof Error ? error.message : '通知失败';
      const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id } });
      const failure = classifyDeliveryError(detail, delivery.attemptCount + 1, maxAttempts);
      const updated = await this.prisma.notificationDelivery.update({
        where: { id },
        data: {
          provider: provider.id,
          status: failure.status,
          attemptCount: { increment: 1 },
          lastError: detail.slice(0, 500),
          errorCode: failure.errorCode,
          ...(failure.retryAfterMs === null
            ? {}
            : { scheduledAt: new Date(Date.now() + failure.retryAfterMs) }),
        },
      });
      await this.recordDeliveryHealth(provider.id, false, Date.now() - started, failure.errorCode);
      return updated;
    }
  }

  private async recordDeliveryHealth(
    provider: string,
    success: boolean,
    latencyMs: number,
    errorCode?: string,
  ) {
    try {
      await this.providerHealth.record(
        provider,
        success,
        latencyMs,
        errorCode,
        new Date(),
        'delivery',
      );
    } catch {
      // Delivery state remains authoritative if health history persistence is unavailable.
    }
  }

  list(status?: string) {
    return this.prisma.notificationDelivery.findMany({
      ...(status ? { where: { status } } : {}),
      orderBy: { scheduledAt: 'desc' },
      take: 200,
    });
  }
}
