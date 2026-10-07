import type { RunConfigV3 } from '@thesis-ledger/schemas';
import type { MarketPitReconstructionInputV3 } from '../market/market-pit-reconstruction-content-v3.js';
import type { MarketPitReconstructionRepository } from '../market/market-pit-reconstruction.repository.js';
import {
  backtestHistoryInputFailureV3,
  type HistoryInputFailureV3,
} from './backtest-history-input-v3.js';
import { isBacktestEvidenceAfterDataAsOfV3 } from './backtest-v3-evidence-clock.js';

export type BacktestReconstructionPreflightPortV3 = Pick<
  MarketPitReconstructionRepository,
  'bindSourceTimes'
>;

export class BacktestHistoricalInputErrorV3 extends Error {
  readonly code: HistoryInputFailureV3['code'];
  readonly missingFields: string[];
  constructor(failure: HistoryInputFailureV3) {
    super(failure.message);
    this.code = failure.code;
    this.missingFields = [...failure.missingFields];
  }
}

/** 固定研究沿用冻结时钟；严格模式须读取实际证据，必要条件不能升级为最终资格。 */
export const backtestHistoricalExecutionPreflightFailureV3 = async (
  input: MarketPitReconstructionInputV3 & { fetchedAt: Date },
  runConfig: RunConfigV3,
  reconstruction?: BacktestReconstructionPreflightPortV3,
): Promise<HistoryInputFailureV3 | null> => {
  const fetchedAt = input.fetchedAt;
  if (
    !(fetchedAt instanceof Date) ||
    !Number.isFinite(fetchedAt.getTime()) ||
    isBacktestEvidenceAfterDataAsOfV3(fetchedAt.toISOString(), runConfig.dataAsOf)
  ) {
    return {
      code: 'FUTURE_DATA',
      missingFields: ['evidence.fetchedAt'],
      message: '执行行情实际抓取时间晚于 dataAsOf 或无效。',
    };
  }
  const failure = backtestHistoryInputFailureV3(input.response, input.seriesVersion, runConfig);
  if (failure || runConfig.executionPriceProtocol.history.basis !== 'point-in-time') return failure;
  try {
    const bound = await reconstruction?.bindSourceTimes(
      input,
      runConfig.executionPriceProtocol.history.reconstructionEvidenceRef,
    );
    if (!bound || bound.status !== 'source-times-bound') {
      return {
        code: 'DATA_UNAVAILABLE',
        missingFields: ['verifiedReconstructionEvidence'],
        message: '严格 PIT 重建清单、原归档或来源观察时钟没有通过实际核验。',
      };
    }
    return {
      code: 'DATA_UNAVAILABLE',
      missingFields: ['historicalDecisionWindow'],
      message: '重建原文和来源时钟已绑定，但尚缺原始历史决策窗口核验，不能作为严格 PIT 输入。',
    };
  } catch {
    return {
      code: 'DATA_UNAVAILABLE',
      missingFields: ['verifiedReconstructionEvidence'],
      message: '严格 PIT 重建证据读取失败，请恢复实际来源证据后重新预检。',
    };
  }
};
