import { useCallback, useMemo, useState } from 'react';
import type { StrategyRecord, StrategyVersion } from './strategy.types.js';

export type ExperimentStrategyVersion = { strategy: StrategyRecord; version: StrategyVersion };
export function useExperimentResearchVersions(strategies: StrategyRecord[]) {
  const [adopted, setAdopted] = useState<ExperimentStrategyVersion[]>([]);
  const versions = useMemo(() => {
    const entries = strategies.flatMap((strategy) =>
      strategy.versions
        .filter(
          (version) =>
            version.version > 0 &&
            (version.schemaVersion === 2 || version.schemaVersion === 3) &&
            version.schema,
        )
        .map((version) => ({ strategy, version })),
    );
    return [
      ...new Map([...entries, ...adopted].map((entry) => [entry.version.id, entry])).values(),
    ];
  }, [strategies, adopted]);
  const adoptVersion = useCallback((strategy: StrategyRecord, version: StrategyVersion) => {
    setAdopted((current) => [
      ...current.filter((entry) => entry.version.id !== version.id),
      { strategy, version },
    ]);
  }, []);
  return { versions, adoptVersion };
}
