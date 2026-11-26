import type { BacktestStrategy } from './backtest-strategy.js';
import { researchStrategyInputNeeds } from './backtest-research-inputs.js';

export const STRATEGY_AST_COMPILER_VERSION = 'strategy-ast-compiler-v1' as const;
export type StrategyOutline = Omit<BacktestStrategy, 'signalSources'> & {
  signalSources: Omit<BacktestStrategy['signalSources'][number], 'series'>[];
};

/** 只编译重复字段与机械依赖；来源声明及交易AST逐值保留，语义校验由调用方执行。 */
export function compileStrategyOutline(outline: StrategyOutline) {
  const input: BacktestStrategy = { ...structuredClone(outline),
    signalSources: outline.signalSources.map((source) => ({ ...structuredClone(source), series: [] })),
  };
  const dependencies = researchStrategyInputNeeds(input, { executionCoordinate: 'research' });
  const fields = new Map(dependencies.needs.filter((need) => need.sourceKind === 'signal')
    .map((need) => [need.sourceId, need.fields]));
  return { compilerVersion: STRATEGY_AST_COMPILER_VERSION,
    definition: { ...input, signalSources: input.signalSources.map((source) => ({ ...source,
      series: [...(fields.get(source.id) ?? [])].sort(),
    })) },
    dependencies: dependencies.needs,
    diagnostics: dependencies.issues.map((issue) => ({ stage: 'compile' as const,
      code: issue.code, path: issue.path, message: issue.message })),
  };
}
