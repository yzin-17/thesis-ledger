import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  strategySchema,
  researchStrategyMaterialV2Schema,
  researchScopeSnapshotV2Schema,
  type ResearchSubmissionV2,
} from '@thesis-ledger/schemas';
import type { InstrumentService } from '../market/instrument.service.js';
import type { ResearchPreparedContext } from './research-preparation-contract.js';

export async function readStrategyResearchContext(
  transaction: Prisma.TransactionClient,
  instruments: InstrumentService,
  input: ResearchSubmissionV2,
): Promise<ResearchPreparedContext> {
  if (input.scope.scope !== 'strategy') throw new BadRequestException('策略研究范围无效');
  const version = await transaction.strategyVersion.findUnique({
    where: { id: input.scope.strategyVersionId },
  });
  if (!version) throw new NotFoundException('策略版本不存在');
  const parsed = strategySchema.safeParse(version.schema);
  if (!parsed.success || version.schemaVersion !== Number(parsed.data.schemaVersion))
    throw new BadRequestException({
      code: 'RESEARCH_STRATEGY_DEFINITION_UNSUPPORTED',
      message: '策略版本定义未通过现有合同核验',
    });
  const definition = parsed.data;
  const symbols = [
    ...new Set([
      definition.executionInstrument.symbol,
      ...definition.signalSources.map((source) => source.asset.symbol),
      ...(definition.benchmark ? [definition.benchmark.symbol] : []),
    ]),
  ].sort();
  if (symbols.length > 1000) throw new BadRequestException('策略标的范围过大');
  const canonical = await instruments.resolveCanonicalSymbols(symbols, transaction);
  if (canonical.items.length > 10)
    throw new BadRequestException({
      code: 'RESEARCH_SCOPE_TOO_LARGE',
      message: '策略标的超过本次准备预算，请缩小范围',
    });
  const fetchedAt = new Date().toISOString();
  return {
    scopeSnapshot: researchScopeSnapshotV2Schema.parse({
      version: 'research-scope-v2',
      scope: 'strategy',
      mode: input.mode,
      confirmedAt: fetchedAt,
      strategyVersionId: version.id,
      instruments: canonical.items,
    }),
    privateMaterial: researchStrategyMaterialV2Schema.parse({
      version: 'research-strategy-material-v2',
      mode: input.mode,
      strategyVersionId: version.id,
      strategyId: version.strategyId,
      schemaVersion: version.schemaVersion,
      definition,
      unresolvedSymbols: canonical.unresolvedSymbols,
    }),
    fetchedAt,
    reasons: canonical.unresolvedSymbols.map((symbol) => `instrument_unresolved:${symbol}`),
  };
}
