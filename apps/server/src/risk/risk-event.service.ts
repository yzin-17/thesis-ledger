import { Injectable } from '@nestjs/common';
import { evaluateCompleteRule } from '@thesis-ledger/domain';
import { NotificationService } from '../notifications/notification.service.js';
import { PrismaService } from '../platform/prisma.service.js';
import type {
  EvaluationCandidate,
  PortfolioMode,
  StoredRule,
} from './risk-types.js';

type RiskEvaluationEvent = NonNullable<ReturnType<typeof evaluateCompleteRule>>;

type RiskRuleTriggerStateRecord = {
  id: string;
  ruleId: string;
  targetKey: string;
  symbol: string;
  mode: string;
  positionId: string | null;
  ruleVersion: number;
  breachActive: boolean;
  activeEventId: string | null;
  lastScanId: string | null;
  triggeredAt: Date | null;
};

type RiskRuleTriggerStateDelegate = {
  upsert: (args: {
    where: {
      ruleId_targetKey_symbol_mode: {
        ruleId: string;
        targetKey: string;
        symbol: string;
        mode: string;
      };
    };
    create: {
      id: string;
      ruleId: string;
      targetKey: string;
      symbol: string;
      mode: string;
      positionId?: string;
      ruleVersion: number;
      breachActive: boolean;
      lastScanId?: string;
    };
    update: {
      positionId?: string | null;
      ruleVersion?: number;
      breachActive?: boolean;
      activeEventId?: string | null;
      lastScanId?: string | null;
      triggeredAt?: Date | null;
    };
  }) => Promise<RiskRuleTriggerStateRecord>;
  updateMany: (args: {
    where: {
      ruleId: string;
      targetKey: string;
      symbol: string;
      mode: string;
      ruleVersion: number;
      breachActive: boolean;
    };
    data: {
      breachActive: boolean;
      lastScanId?: string | null;
      triggeredAt?: Date | null;
      activeEventId?: string | null;
    };
  }) => Promise<{ count: number }>;
  findUnique: (args: {
    where: {
      ruleId_targetKey_symbol_mode: {
        ruleId: string;
        targetKey: string;
        symbol: string;
        mode: string;
      };
    };
  }) => Promise<RiskRuleTriggerStateRecord | null>;
  update: (args: {
    where: { id: string };
    data: {
      positionId?: string | null;
      ruleVersion?: number;
      activeEventId?: string | null;
      lastScanId?: string | null;
      breachActive: boolean;
      triggeredAt?: Date | null;
    };
  }) => Promise<RiskRuleTriggerStateRecord>;
};

type RiskEventRecord = {
  id: string;
  [key: string]: unknown;
};

type RiskEventDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<RiskEventRecord>;
  findUnique?: (args: { where: { dedupeKey: string } }) => Promise<RiskEventRecord | null>;
};

@Injectable()
export class RiskEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  persist(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: RiskEvaluationEvent,
    scanId: string,
    traceId: string,
  ) {
    return stored.kind === 'trailing-stop'
      ? this.persistTrailingEvent(stored, candidate, event, scanId, traceId)
      : this.persistRegularEvent(stored, candidate, event, scanId, traceId);
  }

  history(mode: PortfolioMode = 'actual', options: { cursor?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 200, 1), 200);
    return this.prisma.riskEvent.findMany({
      where: { mode },
      orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
  }

  private riskEventDelegate(prisma: unknown = this.prisma): RiskEventDelegate | null {
    const delegate = (prisma as PrismaService & { riskEvent?: unknown }).riskEvent;
    if (!delegate || typeof delegate !== 'object') return null;
    const candidate = delegate as { create?: unknown; findUnique?: unknown };
    if (typeof candidate.create !== 'function') return null;
    return candidate as unknown as RiskEventDelegate;
  }

  private eventDedupeKey(scanId: string, stored: StoredRule, candidate: EvaluationCandidate) {
    return [
      scanId,
      stored.id,
      stored.version,
      candidate.mode,
      candidate.scope,
      candidate.accountId ?? 'all',
      candidate.symbol ?? candidate.domain.symbol,
    ].join(':');
  }

  private eventData(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: RiskEvaluationEvent,
    scanId: string,
    traceId: string,
    dedupeKey: string,
  ): Record<string, unknown> {
    return {
      ruleId: stored.id,
      ruleVersion: stored.version,
      triggered: true,
      severity: event.severity,
      message: event.message,
      mode: candidate.mode,
      scanId,
      dedupeKey,
      ...(candidate.accountId === undefined ? {} : { accountId: candidate.accountId }),
      ...(candidate.scope === 'security' && candidate.symbol ? { symbol: candidate.symbol } : {}),
      triggerValue: event.context.value,
      threshold: Number(stored.threshold),
      marketTime: new Date(candidate.marketTime),
      context: {
        ...event.context,
        mode: candidate.mode,
        scope: candidate.scope,
        traceId,
        scanId,
        dataQuality: candidate.dataQuality,
        ...(candidate.affectedAccountIds === undefined
          ? {}
          : { affectedAccountIds: candidate.affectedAccountIds }),
      },
    };
  }

  private async persistRiskEvent(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: RiskEvaluationEvent,
    scanId: string,
    traceId: string,
    dedupeKey: string,
    prisma: unknown = this.prisma,
  ): Promise<{ eventId: string; created: boolean }> {
    const delegate = this.riskEventDelegate(prisma);
    if (!delegate) throw new Error('RiskEvent 数据访问不可用');
    const data = this.eventData(stored, candidate, event, scanId, traceId, dedupeKey);
    try {
      const saved = await delegate.create({ data });
      return { eventId: saved.id, created: true };
    } catch (error) {
      if (!delegate.findUnique) throw error;
      const existing = await delegate.findUnique({ where: { dedupeKey } });
      if (!existing) throw error;
      return { eventId: existing.id, created: false };
    }
  }

  private async persistRegularEvent(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: RiskEvaluationEvent,
    scanId: string,
    traceId: string,
  ): Promise<{ eventId?: string; created: boolean }> {
    const triggerState = this.riskRuleTriggerStateDelegate();
    const dedupeKey = this.eventDedupeKey(scanId, stored, candidate);
    if (!triggerState) {
      if (!event.triggered) return { created: false };
      return this.persistRiskEvent(stored, candidate, event, scanId, traceId, dedupeKey);
    }

    const targetKey = candidate.accountId ?? 'all';
    const symbol = candidate.symbol ?? candidate.domain.symbol;
    return this.withTransaction(async (client) => {
      const stateDelegate = this.riskRuleTriggerStateDelegate(client);
      if (!stateDelegate) throw new Error('RiskRuleTriggerState 数据访问不可用');
      let state = await stateDelegate.findUnique({
        where: {
          ruleId_targetKey_symbol_mode: {
            ruleId: stored.id,
            targetKey,
            symbol,
            mode: candidate.mode,
          },
        },
      });
      if (!state && !event.triggered) return { created: false };
      if (!state) {
        state = await stateDelegate.upsert({
          where: {
            ruleId_targetKey_symbol_mode: {
              ruleId: stored.id,
              targetKey,
              symbol,
              mode: candidate.mode,
            },
          },
          create: {
            id: crypto.randomUUID(),
            ruleId: stored.id,
            targetKey,
            symbol,
            mode: candidate.mode,
            ...(candidate.domain.positionId === undefined
              ? {}
              : { positionId: candidate.domain.positionId }),
            ruleVersion: stored.version,
            breachActive: false,
          },
          update: { ruleVersion: stored.version },
        });
      }

      const positionChanged =
        candidate.domain.positionId !== undefined &&
        state.positionId !== candidate.domain.positionId;
      const versionChanged = state.ruleVersion !== stored.version;
      if (positionChanged || versionChanged) {
        state = await stateDelegate.update({
          where: { id: state.id },
          data: {
            ...(candidate.domain.positionId === undefined
              ? {}
              : { positionId: candidate.domain.positionId }),
            ruleVersion: stored.version,
            breachActive: false,
            activeEventId: null,
            lastScanId: null,
            triggeredAt: null,
          },
        });
      }

      if (!event.triggered) {
        if (state.activeEventId !== null) {
          await stateDelegate.update({
            where: { id: state.id },
            data: {
              breachActive: false,
              activeEventId: null,
              lastScanId: scanId,
              triggeredAt: null,
            },
          });
        }
        return { created: false };
      }

      if (state.activeEventId && state.lastScanId === scanId)
        return { eventId: state.activeEventId, created: false };
      if (candidate.mode === 'actual' && state.activeEventId) {
        const deliveryStatus = await this.notifications.subjectDeliveryStatus({
          type: 'risk-event',
          id: state.activeEventId,
        });
        if (deliveryStatus.shouldRetry) return { eventId: state.activeEventId, created: false };
      }

      const outcome = await this.persistRiskEvent(
        stored,
        candidate,
        event,
        scanId,
        traceId,
        dedupeKey,
        client,
      );
      await stateDelegate.update({
        where: { id: state.id },
        data: {
          ruleVersion: stored.version,
          breachActive: false,
          activeEventId: outcome.eventId,
          lastScanId: scanId,
          triggeredAt: new Date(),
        },
      });
      return outcome;
    });
  }

  private async persistTrailingEvent(
    stored: StoredRule,
    candidate: EvaluationCandidate,
    event: RiskEvaluationEvent,
    scanId: string,
    traceId: string,
  ): Promise<{ eventId?: string; created: boolean }> {
    const triggerState = this.riskRuleTriggerStateDelegate();
    const dedupeKey = this.eventDedupeKey(scanId, stored, candidate);
    if (!triggerState) {
      if (!event.triggered) return { created: false };
      return this.persistRiskEvent(stored, candidate, event, scanId, traceId, dedupeKey);
    }

    const targetKey = candidate.accountId ?? 'all';
    const symbol = candidate.symbol ?? candidate.domain.symbol;
    return this.withTransaction(async (client) => {
      const stateDelegate = this.riskRuleTriggerStateDelegate(client);
      if (!stateDelegate) throw new Error('RiskRuleTriggerState 数据访问不可用');
      let state = await stateDelegate.findUnique({
        where: {
          ruleId_targetKey_symbol_mode: {
            ruleId: stored.id,
            targetKey,
            symbol,
            mode: candidate.mode,
          },
        },
      });
      if (!state) {
        state = await stateDelegate.upsert({
          where: {
            ruleId_targetKey_symbol_mode: {
              ruleId: stored.id,
              targetKey,
              symbol,
              mode: candidate.mode,
            },
          },
          create: {
            id: crypto.randomUUID(),
            ruleId: stored.id,
            targetKey,
            symbol,
            mode: candidate.mode,
            ...(candidate.domain.positionId === undefined
              ? {}
              : { positionId: candidate.domain.positionId }),
            ruleVersion: stored.version,
            breachActive: false,
          },
          update: { ruleVersion: stored.version },
        });
      }

      const positionChanged =
        candidate.domain.positionId !== undefined &&
        state.positionId !== candidate.domain.positionId;
      const versionChanged = state.ruleVersion !== stored.version;
      if (positionChanged || versionChanged) {
        state = await stateDelegate.update({
          where: { id: state.id },
          data: {
            positionId:
              candidate.domain.positionId === undefined
                ? state.positionId
                : candidate.domain.positionId,
            ruleVersion: stored.version,
            breachActive: false,
            activeEventId: null,
            lastScanId: null,
            triggeredAt: null,
          },
        });
      }

      if (!event.triggered) {
        if (state.breachActive || state.activeEventId !== null) {
          await stateDelegate.update({
            where: { id: state.id },
            data: {
              breachActive: false,
              activeEventId: null,
              lastScanId: scanId,
              triggeredAt: null,
            },
          });
        }
        return { created: false };
      }

      if (state.breachActive && state.activeEventId) {
        return { eventId: state.activeEventId, created: false };
      }

      const claim = await stateDelegate.updateMany({
        where: {
          ruleId: stored.id,
          targetKey,
          symbol,
          mode: candidate.mode,
          ruleVersion: stored.version,
          breachActive: false,
        },
        data: {
          breachActive: true,
          lastScanId: scanId,
          triggeredAt: new Date(),
          activeEventId: null,
        },
      });
      if (claim.count === 0) {
        const current = await stateDelegate.findUnique({
          where: {
            ruleId_targetKey_symbol_mode: {
              ruleId: stored.id,
              targetKey,
              symbol,
              mode: candidate.mode,
            },
          },
        });
        return current?.activeEventId
          ? { eventId: current.activeEventId, created: false }
          : { created: false };
      }

      const outcome = await this.persistRiskEvent(
        stored,
        candidate,
        event,
        scanId,
        traceId,
        dedupeKey,
        client,
      );
      await stateDelegate.update({
        where: { id: state.id },
        data: {
          breachActive: true,
          activeEventId: outcome.eventId,
          lastScanId: scanId,
          triggeredAt: new Date(),
        },
      });
      return outcome;
    });
  }

  private riskRuleTriggerStateDelegate(
    prisma: unknown = this.prisma,
  ): RiskRuleTriggerStateDelegate | null {
    const delegate = (prisma as PrismaService & { riskRuleTriggerState?: unknown })
      .riskRuleTriggerState;
    if (!delegate || typeof delegate !== 'object') return null;
    const candidate = delegate as {
      upsert?: unknown;
      updateMany?: unknown;
      findUnique?: unknown;
      update?: unknown;
    };
    if (
      typeof candidate.upsert !== 'function' ||
      typeof candidate.updateMany !== 'function' ||
      typeof candidate.findUnique !== 'function' ||
      typeof candidate.update !== 'function'
    )
      return null;
    return candidate as unknown as RiskRuleTriggerStateDelegate;
  }

  private async withTransaction<T>(callback: (client: PrismaService) => Promise<T>): Promise<T> {
    const transaction = this.prisma as PrismaService & {
      $transaction?: (fn: (client: PrismaService) => Promise<T>) => Promise<T>;
    };
    if (typeof transaction.$transaction !== 'function') return callback(this.prisma);
    return transaction.$transaction(callback);
  }
}
