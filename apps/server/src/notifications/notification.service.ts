import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Severity } from '@thesis-ledger/domain';
import { normalizeProviderCredential } from '../platform/credential-security.js';
import { PrismaService } from '../platform/prisma.service.js';
import { RedisService, redisKey } from '../platform/redis.service.js';
import {
  normalizeProviderName,
  ProviderHealthService,
} from '../providers/provider-health.service.js';
import { assertAllowedFeishuWebhookUrl } from './feishu-webhook-security.js';

export interface NotificationPolicy {
  channels: Partial<Record<Severity, string[]>>;
  quietHours?: { start: string; end: string; timezone: string };
  cooldownMinutes: number;
  maxAttempts: number;
  criticalBypassCooldown?: boolean;
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

const DEFAULT_MAX_ATTEMPTS = 3;
const DELIVERY_CLAIM_TTL_MS = 15_000;
const severityValues = new Set<Severity>(['info', 'warning', 'error', 'critical']);

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

const stableSerialize = (value: unknown): string => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.description ?? 'symbol';
  if (typeof value === 'function') return value.name || 'function';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(',')}}`;
};

export const notificationRiskFingerprint = (input: {
  ruleId: string;
  accountId?: string | null;
  symbol?: string | null;
  severity: Severity;
  kind?: string | null;
  threshold?: string | number | null;
  condition?: unknown;
  parameters?: unknown;
}) =>
  createHash('sha256')
    .update(
      stableSerialize({
        ruleId: input.ruleId,
        accountId: input.accountId ?? null,
        symbol: input.symbol ?? null,
        severity: input.severity,
        kind: input.kind ?? null,
        threshold: input.threshold ?? null,
        condition: input.condition ?? null,
        parameters: input.parameters ?? null,
      }),
    )
    .digest('hex')
    .slice(0, 32);

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

const feishuBusinessError = (summary: string) => {
  let payload: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(summary) as unknown;
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const rawCode = payload?.code ?? payload?.StatusCode;
  const code =
    typeof rawCode === 'string'
      ? rawCode
      : typeof rawCode === 'number'
        ? rawCode.toString()
        : undefined;
  if (code === undefined || Number(code) === 0) return null;
  const rawMessage = payload?.msg ?? payload?.StatusMessage;
  const message =
    typeof rawMessage === 'string' || typeof rawMessage === 'number'
      ? String(rawMessage).slice(0, 200)
      : 'Feishu webhook business error';
  return { code, message };
};

export class FeishuWebhookProvider implements NotificationProvider {
  constructor(
    private readonly webhookUrl: string,
    readonly id = 'feishu-webhook',
  ) {}

  async send(message: NotificationMessage, signal: AbortSignal) {
    const url = assertAllowedFeishuWebhookUrl(this.webhookUrl);
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: { text: `${message.title}\n${message.body}` },
      }),
    });
    const summary = (await response.text()).slice(0, 500);
    if (!response.ok) throw new Error(`feishu_http_${response.status}:${summary}`);
    const businessError = feishuBusinessError(summary);
    if (businessError)
      throw new Error(`feishu_business_${businessError.code}:${businessError.message}`);
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
    const fingerprint = await this.cooldownFingerprint(eventId, severity);
    const bypassCooldown = severity === 'critical' && policy.criticalBypassCooldown === true;

    return Promise.all(
      channels.map(async (channel) => {
        const deliveryDedupKey = `${fingerprint}:${eventId}`;
        const cooldownKey = redisKey('cache', `notification:${channel}:${fingerprint}`);
        const reservationToken = crypto.randomUUID();
        if (!bypassCooldown) {
          const reserved = await this.redis.client.set(
            cooldownKey,
            reservationToken,
            'EX',
            Math.max(1, policy.cooldownMinutes * 60),
            'NX',
          );
          if (!reserved) return null;
        }
        try {
          return await this.prisma.notificationDelivery.upsert({
            where: { dedupKey_channel: { dedupKey: deliveryDedupKey, channel } },
            update: { status: 'pending', scheduledAt },
            create: {
              eventId,
              severity,
              channel,
              provider: channel,
              status: 'pending',
              dedupKey: deliveryDedupKey,
              scheduledAt,
            },
          });
        } catch (error) {
          if (!bypassCooldown) {
            const current = await this.redis.client.get(cooldownKey);
            if (current === reservationToken) await this.redis.client.del(cooldownKey);
          }
          throw error;
        }
      }),
    );
  }

  async deliver(
    id: string,
    message: NotificationMessage,
    provider: NotificationProvider,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
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
          lastError: null,
          errorCode: null,
        },
      });
      await this.recordDeliveryHealth(provider.id, true, Date.now() - started);
      return delivery;
    } catch (error) {
      const detail = error instanceof Error ? error.message : '通知失败';
      const failed = await this.updateFailure(id, detail, maxAttempts);
      await this.recordDeliveryHealth(
        provider.id,
        false,
        Date.now() - started,
        failed.failure.errorCode,
      );
      return failed.delivery;
    }
  }

  async dispatchDue(now = new Date()) {
    const due = await this.prisma.notificationDelivery.findMany({
      where: {
        status: { in: ['pending', 'retrying'] },
        scheduledAt: { lte: now },
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    const results = [];
    for (const delivery of due) results.push(await this.dispatchOne(delivery.id, now));
    return results;
  }

  async dispatchOne(id: string, now = new Date(), messageOverride?: NotificationMessage) {
    const lockKey = redisKey('lock', `notification-delivery:${id}`);
    const token = crypto.randomUUID();
    const claimed = await this.redis.client.set(lockKey, token, 'PX', DELIVERY_CLAIM_TTL_MS, 'NX');
    if (!claimed) return { skipped: true, reason: '通知已有 dispatcher 处理' } as const;

    try {
      const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id } });
      if (
        !['pending', 'retrying'].includes(delivery.status) ||
        new Date(delivery.scheduledAt).getTime() > now.getTime()
      )
        return { skipped: true, reason: '通知当前不可投递' } as const;

      try {
        const provider = await this.resolveProvider(delivery.channel);
        const message = messageOverride ?? (await this.messageForDelivery(delivery));
        const result = await this.deliver(id, message, provider);
        return { skipped: false, delivery: result } as const;
      } catch (error) {
        const detail = error instanceof Error ? error.message : '通知准备失败';
        const failed = await this.updateFailure(id, detail, DEFAULT_MAX_ATTEMPTS);
        return { skipped: false, delivery: failed.delivery } as const;
      }
    } finally {
      const current = await this.redis.client.get(lockKey);
      if (current === token) await this.redis.client.del(lockKey);
    }
  }

  private async cooldownFingerprint(eventId: string, severity: Severity) {
    if (typeof this.prisma.riskEvent?.findUnique !== 'function')
      return `event:${eventId}:${severity}`;
    const event = await this.prisma.riskEvent.findUnique({
      where: { id: eventId },
      include: { rule: true },
    });
    if (!event) return `event:${eventId}:${severity}`;
    return notificationRiskFingerprint({
      ruleId: event.ruleId,
      accountId: event.accountId,
      symbol: event.symbol,
      severity,
      kind: event.rule.kind,
      threshold: String(event.rule.threshold),
      condition: event.rule.condition,
      parameters: event.rule.parameters,
    });
  }

  private async resolveProvider(channel: string): Promise<NotificationProvider> {
    if (normalizeProviderName(channel) !== 'feishu')
      throw new Error(`notification_provider_unconfigured:${channel}`);

    const configs = await this.prisma.providerConfig.findMany({
      where: { type: 'notification', enabled: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    const config = configs.find(
      (candidate) =>
        normalizeProviderName(candidate.name) === 'feishu' &&
        Boolean(candidate.encryptedCredentials),
    );
    if (config?.encryptedCredentials) {
      const normalized = normalizeProviderCredential(config.encryptedCredentials);
      if (normalized.needsRotation) {
        await this.prisma.providerConfig.update({
          where: { name: config.name },
          data: { encryptedCredentials: normalized.payload },
        });
      }
      const webhook = normalized.credential.trim();
      if (webhook) return new FeishuWebhookProvider(webhook, config.name);
    }

    throw new Error('notification_provider_unconfigured:feishu');
  }

  private async messageForDelivery(delivery: {
    eventId: string;
    severity: string;
  }): Promise<NotificationMessage> {
    const event = await this.prisma.riskEvent.findUnique({ where: { id: delivery.eventId } });
    if (!event) throw new Error(`notification_event_not_found:${delivery.eventId}`);
    const severity = severityValues.has(delivery.severity as Severity)
      ? (delivery.severity as Severity)
      : 'warning';
    const context =
      event.context && typeof event.context === 'object'
        ? (event.context as Record<string, unknown>)
        : undefined;
    return {
      title: '风险提醒',
      body: event.message,
      severity,
      traceId: typeof context?.traceId === 'string' ? context.traceId : crypto.randomUUID(),
    };
  }

  private async updateFailure(id: string, detail: string, maxAttempts: number) {
    const delivery = await this.prisma.notificationDelivery.findUniqueOrThrow({ where: { id } });
    const failure = classifyDeliveryError(detail, delivery.attemptCount + 1, maxAttempts);
    const updated = await this.prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: failure.status,
        attemptCount: { increment: 1 },
        lastError: detail.slice(0, 500),
        errorCode: failure.errorCode,
        ...(failure.retryAfterMs === null
          ? {}
          : { scheduledAt: new Date(Date.now() + failure.retryAfterMs) }),
      },
    });
    return { delivery: updated, failure };
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
