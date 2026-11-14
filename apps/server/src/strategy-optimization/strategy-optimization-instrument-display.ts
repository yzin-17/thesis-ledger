import { optimizationExperimentSymbol } from '@thesis-ledger/schemas';
import type { InstrumentDisplayService } from '../market/instruments/instrument-display.service.js';
import type { ExperimentReadRow, EnrichedExperiment } from './strategy-optimization-common.js';
import { enrichOptimizationExperiment } from './strategy-optimization-read-model.js';

/** 按页解析当前名称，每个实验只附加自己的目录条目，保留冻结字段原样。 */
export async function projectNamedOptimizationExperiments(
  rows: readonly ExperimentReadRow[],
  display: InstrumentDisplayService,
): Promise<EnrichedExperiment[]> {
  const symbols = rows.map(optimizationExperimentSymbol);
  const directory = await display.resolveDirectory([
    ...new Set(symbols.filter((symbol): symbol is string => symbol !== null)),
  ]);
  return rows.map((row, index) => {
    const symbol = symbols[index] ?? null;
    return {
      ...enrichOptimizationExperiment(row),
      executionSymbol: symbol,
      instrumentDirectory: {
        generation: directory.generation,
        items: directory.items.filter((item) => item.symbol === symbol),
        unresolvedSymbols: directory.unresolvedSymbols.filter((item) => item === symbol),
      },
    };
  });
}
