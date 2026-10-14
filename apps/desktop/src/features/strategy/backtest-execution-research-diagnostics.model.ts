import { brokerCommissionDiagnostic } from './backtest-broker-commission-diagnostic.js';
import { researchLotSizeDiagnostic } from './backtest-research-lot-size-diagnostic.js';

/** 执行模型的研究参数按各自白名单导出；旧模型保留原导出形状。 */
export function executionResearchDiagnostics(model: unknown, sanitize: (value: string) => string | null) {
  const brokerCosts = brokerCommissionDiagnostic(model);
  const researchLotSize = researchLotSizeDiagnostic(model, sanitize);
  return { ...(brokerCosts.length ? { brokerCosts } : {}), ...(researchLotSize ? { researchLotSize } : {}) };
}
