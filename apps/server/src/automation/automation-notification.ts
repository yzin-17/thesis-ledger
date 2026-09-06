import { StructuredLogger } from '../platform/structured-logger.js';
import type {
  NotificationMessage,
  NotificationService,
  NotificationSubject,
} from '../notifications/notification.service.js';

export const automationNotificationLogger = new StructuredLogger('thesis-ledger.automation');

/** 沿用现有风险通知的冷却默认：同 dedupKey 冷却窗口内不重复入队。 */
const notificationPolicy = {
  cooldownMinutes: 30,
  maxAttempts: 3,
};

export type AutomationFailureNotificationInput = {
  jobId: string;
  jobName: string;
  runId: string;
  traceId: string;
  error: unknown;
};

const errorSummary = (error: unknown) =>
  (error instanceof Error ? error.message : '未知错误').slice(0, 200);

export const buildAutomationFailureNotification = (input: AutomationFailureNotificationInput): {
  subject: NotificationSubject;
  message: NotificationMessage;
} => ({
  subject: {
    type: 'automation-run',
    id: input.runId,
    dedupKey: `automation-failure:${input.jobId}`,
  },
  message: {
    title: '自动化任务失败',
    body: `任务「${input.jobName}」执行失败：${errorSummary(input.error)}`,
    severity: 'error',
    traceId: input.traceId,
  },
});

export const enqueueAutomationFailureNotification = async (
  notifications: NotificationService,
  input: AutomationFailureNotificationInput,
) => {
  const notification = buildAutomationFailureNotification(input);
  try {
    await notifications.enqueue(notification.subject, notification.message, notificationPolicy);
  } catch (error) {
    // 入队失败（如通知 Provider 未配置之外的异常）只记日志，不影响失败状态的记录与原始错误抛出。
    automationNotificationLogger.warn({
      operation: 'automation.failure_notification_enqueue_failed',
      jobId: input.jobId,
      runId: input.runId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
};
