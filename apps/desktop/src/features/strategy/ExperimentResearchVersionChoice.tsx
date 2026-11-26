import { isPriceResearchStrategyDefinition } from '@thesis-ledger/domain';
import { PriceResearchVersionPreview } from './PriceResearchVersionPreview.js';
import type { ExperimentStrategyVersion } from './use-experiment-research-versions.js';
import type { StrategyVersion } from './strategy.types.js';

export function ExperimentResearchVersionChoice({
  entry,
  disabled,
  onAdopt,
  onBusyChange,
}: {
  entry: ExperimentStrategyVersion | null;
  disabled: boolean;
  onAdopt: (version: StrategyVersion) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  if (!entry || isPriceResearchStrategyDefinition(entry.version.schema)) return null;
  return (
    <PriceResearchVersionPreview
      key={entry.version.id}
      strategyId={entry.strategy.id}
      version={entry.version}
      disabled={disabled}
      onAdopt={onAdopt}
      onBusyChange={onBusyChange}
    />
  );
}
