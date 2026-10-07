import {
  Inject,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  backtestNavPreparationRequestV3Schema,
  backtestNavPreparationBlockedResultV3Schema,
  backtestNavPreparationResultV3Schema,
  strategySchema,
} from '@thesis-ledger/schemas';
import { MarketNavReaderV3 } from '../market/market-nav-reader-v3.js';
import { PrismaService } from '../platform/prisma.service.js';
import { prepareNavRunConfigV3 } from './backtest-nav-preparation.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import {
  BacktestNavPreparationRepository,
  NavPreparationReceiptError,
} from './backtest-nav-preparation-repository.js';
import {
  NavPreparationStaleError,
  navPreparationDiagnostic,
  publicNavPreparationResult,
} from './backtest-nav-preparation-result.js';

export const NAV_PREPARATION_TIMEOUT_MS = Symbol('NAV_PREPARATION_TIMEOUT_MS');

@Injectable()
export class BacktestNavPreparationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MarketNavReaderV3) private readonly reader: MarketNavReaderV3,
    @Inject(NAV_PREPARATION_TIMEOUT_MS) private readonly timeoutMs: number,
    @Inject(BacktestNavPreparationRepository)
    private readonly receipts: BacktestNavPreparationRepository,
  ) {}

  /** 内部完整证据入口；公开准备须先持久化再返回创建引用。 */
  async prepareEvidence(input: unknown) {
    const request = backtestNavPreparationRequestV3Schema.parse(input);
    const version = await this.prisma.strategyVersion.findUnique({
      where: { id: request.strategyVersionId },
    });
    if (!version) throw new NotFoundException('策略版本不存在');
    const strategy = strategySchema.safeParse(version.schema);
    if (version.schemaVersion !== 2 || !strategy.success) {
      throw new UnprocessableEntityException({
        code: 'STRATEGY_INVALID',
        message: '策略版本不符合净值准备合同',
      });
    }
    try {
      const prepared = await prepareNavRunConfigV3({
        request,
        strategy: strategy.data,
        reader: this.reader,
        acquisitionTimeoutMs: this.timeoutMs,
      });
      const current = await this.prisma.strategyVersion.findUnique({
        where: { id: request.strategyVersionId },
      });
      const definition = strategySchema.safeParse(current?.schema);
      if (
        current?.schemaVersion !== 2 ||
        !definition.success ||
        hashCanonicalManifest(definition.data) !== prepared.binding.strategyContentHash
      ) {
        throw new NavPreparationStaleError();
      }
      return prepared;
    } catch (error) {
      const diagnostic = navPreparationDiagnostic(error);
      if (!diagnostic) throw error;
      return backtestNavPreparationBlockedResultV3Schema.parse({
        contractVersion: 3,
        status: 'blocked',
        scope: 'nav-input-plan',
        requestId: request.requestId,
        checkedAt: new Date().toISOString(),
        diagnostics: [diagnostic],
      });
    }
  }

  async prepare(input: unknown) {
    const evidence = await this.prepareEvidence(input);
    if (evidence.status === 'blocked') return evidence;
    let receipt;
    try {
      receipt = await this.receipts.save(input, evidence);
    } catch (error) {
      if (!(error instanceof NavPreparationReceiptError)) throw error;
      const body = { code: error.code, message: error.message };
      if (error.statusCode === 409) throw new ConflictException(body);
      throw new UnprocessableEntityException(body);
    }
    return backtestNavPreparationResultV3Schema.parse({
      ...publicNavPreparationResult(evidence),
      receipt,
    });
  }
}
