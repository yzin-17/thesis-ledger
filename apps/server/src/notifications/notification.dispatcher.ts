import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { loadConfig } from '../platform/config.js';
import { PrismaService } from '../platform/prisma.service.js';
import { NotificationService } from './notification.service.js';

const NOTIFICATION_POLL_INTERVAL_MS = 5_000;

@Injectable()
export class NotificationDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(
    private readonly notifications: NotificationService,
    private readonly prisma?: PrismaService,
  ) {}

  onModuleInit() {
    if (loadConfig().environment === 'test') return;
    this.timer = setInterval(() => void this.runNow(), NOTIFICATION_POLL_INTERVAL_MS);
    this.timer.unref?.();
    this.startupTimer = setTimeout(() => void this.runNow(), 0);
    this.startupTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  private cancelSupersededStrategyRiskDeliveries() {
    if (!this.prisma) return Promise.resolve(0);
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE "NotificationDelivery" AS delivery
      SET "status"='cancelled',
          "lastError"='策略风险应用已停用、升级或修改通知配置，取消旧修订提醒',
          "errorCode"='strategy_risk_application_superseded'
      FROM "RiskEvent" AS event
      LEFT JOIN "StrategyRiskApplication" AS application
        ON application."id" = NULLIF(event."context"->'metadata'->>'strategyRiskApplicationId', '')::uuid
      WHERE delivery."subjectType"='risk-event'
        AND delivery."subjectId"=event."id"::text
        AND delivery."status" IN ('pending', 'retrying')
        AND event."context"->'metadata'->>'strategyRiskApplicationId' IS NOT NULL
        AND (
          application."id" IS NULL
          OR application."archivedAt" IS NOT NULL
          OR application."enabled"=false
          OR application."revision"::text <> event."context"->'metadata'->>'applicationRevision'
          OR COALESCE((application."notification"->>'enabled')::boolean, true)=false
        )
    `);
  }

  async runNow(now = new Date()) {
    if (this.running) return { skipped: true, reason: 'notification dispatcher 上一轮仍在运行' };
    this.running = true;
    try {
      await this.cancelSupersededStrategyRiskDeliveries();
      return { skipped: false, deliveries: await this.notifications.dispatchDue(now) };
    } finally {
      this.running = false;
    }
  }
}
