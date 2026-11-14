import { optimizationAdoptionReadSchema, type OptimizationAdoptionRead } from '@thesis-ledger/schemas';
import { StructuredLogger } from '../platform/structured-logger.js';
import type { OptimizationAdoptionRow } from './strategy-optimization-adoption.js';

type ReadyDetails = Pick<Extract<OptimizationAdoptionRead, { detailsStatus: 'ready' }>,
  'adoptionContext' | 'monitoringPlan' | 'monitoringDiff' | 'riskApplicationDiffs'>;
const logger = new StructuredLogger('thesis-ledger.optimization');

/** 核心回执由已提交事务提供；附加读取失败不能改变采纳结果。 */
export async function committedOptimizationAdoptionResponse(
  adoption: OptimizationAdoptionRow,
  readDetails: () => Promise<ReadyDetails>,
): Promise<OptimizationAdoptionRead> {
  const core = {
    strategyVersion: {
      id: adoption.formalStrategyVersionId,
      strategyId: adoption.formalStrategyId,
      version: adoption.formalVersion,
    },
    source: {
      experimentId: adoption.experimentId,
      candidateId: adoption.candidateId,
      candidateHash: adoption.candidateHash,
    },
    riskApplicationEnabled: false as const,
  };
  try {
    return optimizationAdoptionReadSchema.parse({ ...core, ...await readDetails(), detailsStatus: 'ready' });
  } catch {
    logger.warn({ operation: 'optimization.adoption_details_unavailable', adoptionId: adoption.id });
    return { ...core, detailsStatus: 'unavailable', detailsErrorCode: 'ADOPTION_DETAILS_UNAVAILABLE' };
  }
}
