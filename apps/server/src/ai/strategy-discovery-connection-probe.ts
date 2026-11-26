import { aiGenerationContracts, type AiGenerationContractRef } from '@thesis-ledger/schemas';

/** 格式资格仅复制有效实例；自然语言理解由独立业务验收验证。 */
export function strategyDiscoveryConnectionProbe(purpose: AiGenerationContractRef['id']) {
  if (purpose !== 'strategy_discovery') return null;
  return aiGenerationContracts.strategyDiscovery.schema.parse({
    reason: '空仓投入权益20%，持仓后普通退出；另设立即启用的5%初始保护，无其他计划控制。',
    strategy: {
      name: '策略探索格式验证',
      signalSources: [],
      entryTrigger: 'rising-edge',
      entry: { type: 'not', expression: { type: 'positionState', field: 'isOpen' } },
      exit: { type: 'positionState', field: 'isOpen' },
      sizing: { type: 'percentOfEquity', percent: '0.2' },
      risk: [],
      tradePlan: {
        version: 1,
        evaluation: 'barClose',
        initialStop: { kind: 'percent', percent: '0.05', activation: { kind: 'immediate' } },
        stages: [],
      },
    },
    evidenceRefs: [],
  });
}
