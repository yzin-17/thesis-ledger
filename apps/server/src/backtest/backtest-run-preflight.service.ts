import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  backtestPreflightDiagnosticV3Schema,
  backtestPreflightResultV3Schema,
  backtestRunPreflightRequestV3Schema,
  strategySchema,
  type BacktestPreflightRevisionStampV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { DsaClient } from '../integration/dsa/dsa.client.js';
import { MarketBarReader } from '../market/market-bar-reader.js';
import { MarketRouteRevisionService } from '../market/market-route-revision.service.js';
import { MarketPitReconstructionRepository } from '../market/market-pit-reconstruction.repository.js';
import type { BacktestReconstructionPreflightPortV3 } from './backtest-reconstruction-preflight-v3.js';
import { PrismaService } from '../platform/prisma.service.js';
import { BacktestCreationGuardService } from './backtest-creation-guard.service.js';
import { preflightBacktestDependenciesV3 } from './backtest-preflight-v3-dependencies.js';
import { tradabilityWindowFromResponseV3, type SnapshotTradabilityWindowV3 } from './backtest-snapshot-v3-tradability.js';
import { preflightBacktestExecutionWindowV3 } from './backtest-preflight-v3-execution.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { planSnapshotInputsV3 } from './backtest-snapshot-v3-input-plan.js';

const staleDiagnostic = () => backtestPreflightDiagnosticV3Schema.parse({
  severity: 'error', category: 'data-unavailable', code: 'DATA_UNAVAILABLE',
  message: '策略或路由修订不可用或在检查期间变化，请重新预检。',
  symbol: null, capability: null, purpose: null, dateRange: null, routeKey: null,
  missingFields: ['currentPreparationRevision'], incompatibleRules: [], targetSources: [],
  suggestedActions: [{ action: 'retry-preflight', description: '读取稳定的策略和路由状态后重新检查。' }],
});

@Injectable()
export class BacktestRunPreflightService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MarketBarReader) private readonly reader: MarketBarReader,
    @Inject(MarketRouteRevisionService) private readonly revisions: MarketRouteRevisionService,
    @Inject(DsaClient) private readonly dsa: DsaClient,
    @Inject(BacktestCreationGuardService) private readonly guard: BacktestCreationGuardService,
    @Inject(MarketPitReconstructionRepository) private readonly reconstruction?: BacktestReconstructionPreflightPortV3,
  ) {}

  async check(input: unknown) {
    const request = backtestRunPreflightRequestV3Schema.parse(input);
    const { strategyVersionId, runConfig, requestId } = request;
    const version = await this.prisma.strategyVersion.findUnique({ where: { id: strategyVersionId } });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2) throw new BadRequestException('V3预检要求schemaVersion=2的策略');
    const strategy = strategySchema.parse(version.schema) as BacktestStrategy;
    const checkedAt = new Date().toISOString();
    const base = { contractVersion: 3 as const, requestId, checkedAt };
    let plan: ReturnType<typeof planSnapshotInputsV3>;
    try {
      plan = planSnapshotInputsV3({ strategy, runConfig });
    } catch {
      return backtestPreflightResultV3Schema.parse({
        ...base, status: 'invalid-input', revisionStamp: null,
        diagnostics: [{ ...staleDiagnostic(), category: 'input-invalid', code: 'INVALID_PARAMETER',
          message: '策略与配置的依赖绑定不受支持或不一致。', missingFields: ['priceInputBindings'],
          suggestedActions: [{ action: 'correct-input', description: '核对显式价格绑定及支持的标的、周期和币种。' }] }],
      });
    }
    const requirement = {
      symbol: strategy.executionInstrument.symbol, capability: 'DAILY_BAR', purpose: 'execution' as const,
      dateRange: { startDate: plan.warmup.startDate, endDate: runConfig.endDate }, routeKey: plan.executionRouteKey,
    };
    const identity = { strategyVersionId, strategyContentHash: hashCanonicalManifest(strategy),
      runConfigChecksum: hashCanonicalManifest(runConfig) };
    let stamp: BacktestPreflightRevisionStampV3 = { ...identity,
      desiredRevision: null, effectiveRevision: null, catalogRevision: null,
      targetSequences: [{ requirement, targets: [] }],
    };
    const stale = () => backtestPreflightResultV3Schema.parse({
      ...base, status: 'blocked', revisionStamp: stamp, diagnostics: [staleDiagnostic()],
    });
    let routeRevisions: Awaited<ReturnType<MarketRouteRevisionService['readCurrent']>>;
    try {
      routeRevisions = await this.revisions.readCurrent(plan.executionRouteKey);
    } catch { return stale(); }
    let tradabilityWindow: SnapshotTradabilityWindowV3 | undefined;
    const execution = await preflightBacktestExecutionWindowV3({
      strategy, runConfig, dependencyPlan: plan.plan,
      reader: { readV3: async (request) => {
        const result = await this.reader.readV3(request);
        if (result.status === 'selected') tradabilityWindow = tradabilityWindowFromResponseV3(result.selection.response);
        return result;
      } },
      ...(this.reconstruction ? { reconstruction: this.reconstruction } : {}),
      context: { checkedAt, routeRevisions, request: {
        contractVersion: 3, requestId, ...identity, requirements: [requirement],
      } },
    });
    if (execution.status !== 'ready') return execution;
    stamp = execution.revisionStamp;
    const diagnostics = await preflightBacktestDependenciesV3({
      strategy, runConfig, plan: plan.plan,
      tradabilityWindow,
      eventRevisions: { desiredRevision: stamp.desiredRevision!,
        effectivePolicyRevision: stamp.effectiveRevision!, catalogRevision: stamp.catalogRevision! },
    }, this.dsa);
    try {
      await this.guard.check({ contractVersion: 3, strategyVersionId, runConfig,
        idempotencyKey: requestId, preparationStamp: stamp }, strategy);
    } catch { return stale(); }
    return backtestPreflightResultV3Schema.parse({ ...base,
      status: diagnostics.length ? 'blocked' : 'ready', revisionStamp: stamp, diagnostics,
    });
  }
}
