import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadConfig } from '../platform/config.js';
import { ProviderHealthService } from './provider-health.service.js';

@Injectable()
export class ProviderHealthScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(private readonly health: ProviderHealthService) {}

  onModuleInit() {
    const config = loadConfig();
    if (config.environment === 'test') return;

    this.timer = setInterval(() => void this.runNow(), config.providerHealthCheckIntervalMs);
    this.timer.unref?.();
    this.startupTimer = setTimeout(() => void this.runNow(), 0);
    this.startupTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  async runNow() {
    if (this.running) return { skipped: true, reason: '健康检查已有实例运行' };
    this.running = true;
    try {
      return { skipped: false, checks: await this.health.checkAll('scheduled') };
    } finally {
      this.running = false;
    }
  }
}
