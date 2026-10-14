import type { SimulationReject } from '@thesis-ledger/domain';
import type { RunConfigV3 } from '@thesis-ledger/schemas';

/** 新模型明确区分已知状态约束与数据缺失；旧冻结配置维持原结果身份。 */
export function expectedStatusRejectionV3(config: RunConfigV3, reject: SimulationReject): boolean {
  return config.executionPriceProtocol.accountingBasis === 'normalized-series' &&
    config.executionPriceProtocol.history.basis === 'fixed-provider-snapshot' &&
    reject.code === 'RULE_REJECTED' && reject.inputFacts.includes('bar.suspended=true') &&
    !!config.executionModel?.segments.length && config.executionModel.segments.every((segment) => segment.execution.mode === 'exchange' &&
      segment.execution.statusPolicy?.resultAvailability === 'valid-metrics-with-status-rejections-v1');
}
