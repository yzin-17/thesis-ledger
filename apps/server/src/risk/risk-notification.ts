import { notificationRiskFingerprint } from '../notifications/notification.service.js';
import type {
  NotificationMessage,
  NotificationService,
  NotificationSubject,
} from '../notifications/notification.service.js';

const notificationPolicy = {
  cooldownMinutes: 30,
  maxAttempts: 3,
  criticalBypassCooldown: true,
};

export type RiskNotificationInput = {
  eventId: string;
  severity: NotificationMessage['severity'];
  message: string;
  traceId: string;
  rule: {
    id: string;
    kind: string;
    threshold: unknown;
    condition?: unknown;
    parameters?: unknown;
  };
  accountId?: string;
  symbol?: string;
  policy?: {
    enabled?: boolean;
    cooldownMinutes?: number;
    channels?: string[];
  };
};

export const buildRiskNotification = (
  input: RiskNotificationInput,
): { subject: NotificationSubject; message: NotificationMessage } => ({
  subject: {
    type: 'risk-event',
    id: input.eventId,
    dedupKey: notificationRiskFingerprint({
      ruleId: input.rule.id,
      accountId: input.accountId ?? null,
      symbol: input.symbol ?? null,
      severity: input.severity,
      kind: input.rule.kind,
      threshold: String(input.rule.threshold),
      condition: input.rule.condition,
      parameters: input.rule.parameters,
    }),
  },
  message: {
    title: '风险提醒',
    body: input.message,
    severity: input.severity,
    traceId: input.traceId,
  },
});

export const enqueueRiskNotificationIfNeeded = async (
  notifications: NotificationService,
  input: RiskNotificationInput & { mode: 'actual' | 'shadow'; created: boolean },
) => {
  if (input.mode === 'shadow' || input.policy?.enabled === false) return;
  // 当前 NotificationService 唯一可投递渠道为 feishu；策略应用显式移除该渠道时不入队。
  if (input.policy?.channels && !input.policy.channels.includes('feishu')) return;
  if (
    !input.created &&
    !(await notifications.subjectDeliveryStatus({ type: 'risk-event', id: input.eventId }))
      .shouldRetry
  )
    return;
  const notification = buildRiskNotification(input);
  await notifications.enqueue(notification.subject, notification.message, {
    ...notificationPolicy,
    ...(input.policy?.cooldownMinutes === undefined
      ? {}
      : { cooldownMinutes: Math.max(0, Math.floor(input.policy.cooldownMinutes)) }),
  });
};
