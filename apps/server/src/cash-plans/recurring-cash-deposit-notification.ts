import type {
  NotificationMessage,
  NotificationPolicy,
  NotificationSubject,
} from '../notifications/notification.service.js';

export const recurringCashDepositNotificationPolicy: NotificationPolicy = {
  cooldownMinutes: 1,
  maxAttempts: 3,
};

export const buildRecurringCashDepositNotification = (input: {
  planId: string;
  planName: string;
  periods: readonly string[];
  traceId: string;
}): { subject: NotificationSubject; message: NotificationMessage } => {
  const periodSummary = input.periods.join('、');
  const body =
    input.periods.length === 1
      ? `${periodSummary} 的计划入账已到期，请确认实际金额和到账时间。`
      : `停机期间已补齐 ${input.periods.length} 期待确认入账（${periodSummary}），请逐期确认。`;
  return {
    subject: {
      type: 'recurring-cash-deposit-plan',
      id: input.planId,
      dedupKey: `recurring-cash-deposit:${input.planId}:${input.periods.join(',')}`,
    },
    message: {
      title: `${input.planName} · 待确认入账`,
      body,
      severity: 'info',
      traceId: input.traceId,
    },
  };
};
