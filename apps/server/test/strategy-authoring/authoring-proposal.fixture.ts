import { omit } from 'es-toolkit';
import type { BacktestStrategy } from '@thesis-ledger/schemas';

export function authoringProposal(
  strategy: BacktestStrategy,
  coverage: Array<{ requirementId: string; definitionPaths: string[] }>,
) {
  return {
    proposal: {
      definition: {
        ...strategy,
        signalSources: strategy.signalSources.map(source => omit(source, ['series'])),
      },
      coverage,
    },
    intentCheck: '核对本次规则的触发条件和执行时点',
  };
}
