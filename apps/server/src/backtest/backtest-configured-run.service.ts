import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  backtestRunCreateSchemaV3,
  runConfigSchemaV3,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketBarReader } from '../market/market-bar-reader.js';
import { MarketRouteRevisionService } from '../market/market-route-revision.service.js';
import { findExistingBacktestRun } from './backtest-v3-run-lifecycle.js';
import { planSnapshotInputsV3 } from './backtest-snapshot-v3-input-plan.js';
import { preflightBacktestExecutionWindowV3 } from './backtest-preflight-v3-execution.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { planBacktestDependencies } from './backtest-dependency-plan.js';

/** Prepare a stamp for an already fixed protocol; never replace it with newly observed facts. */
@Injectable()
export class BacktestConfiguredRunService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MarketBarReader) private readonly reader: MarketBarReader,
    @Inject(MarketRouteRevisionService) private readonly revisions: MarketRouteRevisionService,
  ) {}

  async resolve(
    strategyVersionId: string,
    config: unknown,
    idempotencyKey: string,
    options: { rebindStrategyInputs?: boolean } = {},
  ) {
    let runConfig = runConfigSchemaV3.parse(config);
    let candidate: BacktestStrategy | undefined;
    if (options.rebindStrategyInputs) {
      const version = await this.prisma.strategyVersion.findUnique({
        where: { id: strategyVersionId },
      });
      if (!version) throw new NotFoundException('策略版本不存在');
      if (version.schemaVersion !== 2)
        throw new BadRequestException('V3运行要求schemaVersion=2的策略');
      candidate = strategySchema.parse(version.schema) as BacktestStrategy;
      const dependencies = planBacktestDependencies({ strategy: candidate, runConfig });
      runConfig = runConfigSchemaV3.parse({
        ...runConfig,
        priceInputBindings: {
          signals: dependencies.signalSources.map(({ id }) => ({
            sourceId: id,
            binding: 'execution-series',
          })),
          benchmark: { binding: 'execution-series' },
        },
      });
      // Validate coordinate identity and frozen warmup limits before any Market read.
      planSnapshotInputsV3({ strategy: candidate, runConfig });
    }
    const existing = await findExistingBacktestRun(
      this.prisma,
      { strategyVersionId, idempotencyKey },
      runConfig,
    );
    if (existing) return { kind: 'existing' as const, job: existing };
    const version = candidate
      ? { schemaVersion: 2, schema: candidate }
      : await this.prisma.strategyVersion.findUnique({
          where: { id: strategyVersionId },
        });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2)
      throw new BadRequestException('V3运行要求schemaVersion=2的策略');
    const strategy = strategySchema.parse(version.schema) as BacktestStrategy;
    const inputPlan = planSnapshotInputsV3({ strategy, runConfig });
    const routeRevisions = await this.revisions.readCurrent(inputPlan.executionRouteKey);
    const preflight = await preflightBacktestExecutionWindowV3({
      strategy,
      runConfig,
      dependencyPlan: inputPlan.plan,
      reader: this.reader,
      context: {
        checkedAt: new Date().toISOString(),
        routeRevisions,
        request: {
          contractVersion: 3,
          requestId: idempotencyKey,
          strategyVersionId,
          strategyContentHash: hashCanonicalManifest(strategy),
          runConfigChecksum: hashCanonicalManifest(runConfig),
          requirements: [
            {
              symbol: strategy.executionInstrument.symbol,
              capability: 'DAILY_BAR',
              purpose: 'execution',
              dateRange: { startDate: inputPlan.warmup.startDate, endDate: runConfig.endDate },
              routeKey: inputPlan.executionRouteKey,
            },
          ],
        },
      },
    });
    if (preflight.status !== 'ready')
      throw new BadRequestException({
        code: 'DATA_UNAVAILABLE',
        message: '当前行情不能复用冻结的运行协议',
        diagnostics: preflight.diagnostics,
      });
    return {
      kind: 'prepared' as const,
      input: backtestRunCreateSchemaV3.parse({
        contractVersion: 3,
        strategyVersionId,
        runConfig,
        idempotencyKey,
        preparationStamp: preflight.revisionStamp,
      }),
    };
  }
}
