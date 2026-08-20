import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadConfig } from '../platform/config.js';
import { NotificationService } from './notification.service.js';

const NOTIFICATION_POLL_INTERVAL_MS = 5_000;

@Injectable()
export class NotificationDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(private readonly notifications: NotificationService) {}

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

  async runNow(now = new Date()) {
    if (this.running) return { skipped: true, reason: 'notification dispatcher 上一轮仍在运行' };
    this.running = true;
    try {
      return { skipped: false, deliveries: await this.notifications.dispatchDue(now) };
    } finally {
      this.running = false;
    }
  }
}
