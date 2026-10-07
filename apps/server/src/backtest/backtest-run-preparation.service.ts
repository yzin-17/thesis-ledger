import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  backtestRunPreparationRequestV3Schema,
  backtestRunPreparationIntentV3Schema,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { MarketBarReader } from '../market/market-bar-reader.js';
import { MarketControlService } from '../market/market-control.service.js';
import { prepareBacktestRunConfigV3 } from './backtest-run-preparation.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';

@Injectable()
export class BacktestRunPreparationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MarketBarReader) private readonly reader: MarketBarReader,
    @Inject(MarketControlService) private readonly control: MarketControlService,
  ) {}

  async prepare(input: unknown) {
    const request = backtestRunPreparationRequestV3Schema.parse(input);
    const version = await this.prisma.strategyVersion.findUnique({
      where: { id: request.strategyVersionId },
    });
    if (!version) throw new NotFoundException('策略版本不存在');
    if (version.schemaVersion !== 2)
      throw new BadRequestException('配置准备要求schemaVersion=2的策略版本');
    const strategy = strategySchema.parse(version.schema) as BacktestStrategy;
    return prepareBacktestRunConfigV3({
      request,
      strategy,
      reader: this.reader,
      control: this.control,
      checkedAt: new Date().toISOString(),
    });
  }

  async prepareDraft(intent: unknown, definition: unknown) {
    const parsed = backtestRunPreparationIntentV3Schema.parse(intent);
    const strategy = strategySchema.parse(definition) as BacktestStrategy;
    const strategyContentHash = hashCanonicalManifest(strategy);
    const result = await prepareBacktestRunConfigV3({
      request: { ...parsed, strategyVersionId: `draft:${strategyContentHash}` },
      strategy,
      reader: this.reader,
      control: this.control,
      checkedAt: new Date().toISOString(),
    });
    if (result.status === 'blocked') return result;
    if (result.executionPreflight.status !== 'ready') throw new Error('草稿准备缺少就绪预检');
    const { desiredRevision, effectiveRevision, catalogRevision } = result.executionPreflight.revisionStamp;
    // A draft is not a stored StrategyVersion and must not expose a Run creation stamp.
    return {
      status: result.status,
      requestId: result.requestId,
      checkedAt: result.checkedAt,
      runConfig: result.runConfig,
      actualSource: result.actualSource,
      strategyContentHash,
      routeRevisions: { desiredRevision, effectiveRevision, catalogRevision },
    };
  }
}
