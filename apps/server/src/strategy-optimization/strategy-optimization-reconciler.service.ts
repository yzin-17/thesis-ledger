import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { loadConfig } from '../platform/config.js';
import { optimizationFeatureEnabled } from './strategy-optimization-common.js';
import { StrategyOptimizationService } from './strategy-optimization.service.js';

const RECONCILE_INTERVAL_MS = 15_000;

@Injectable()
export class StrategyOptimizationReconciler implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(private readonly optimization: StrategyOptimizationService) {}

  onModuleInit() {
    if (loadConfig().environment === 'test' || !optimizationFeatureEnabled()) return;
    this.timer = setInterval(() => void this.runNow(), RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runNow() {
    if (!optimizationFeatureEnabled())
      return { skipped: true, reason: 'AI 策略优化当前已关闭' } as const;
    if (this.running) return { skipped: true, reason: '策略优化恢复上一轮仍在运行' } as const;
    this.running = true;
    try {
      return { skipped: false, ...(await this.optimization.reconcilePending(100)) } as const;
    } finally {
      this.running = false;
    }
  }
}
