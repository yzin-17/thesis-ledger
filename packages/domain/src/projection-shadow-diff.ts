export const projectionDiffCategories = [
  'EXPECTED_GRAIN_CHANGE',
  'EVIDENCE_GAP',
  'FX_GAP',
  'MIGRATION_DEFECT',
  'ALGORITHM_DEFECT',
  'UNCLASSIFIED',
] as const;

export type ProjectionDiffCategory = (typeof projectionDiffCategories)[number];

export type ProjectionSnapshotSource = 'legacy' | 'unified';

export interface ProjectionPositionSnapshot {
  symbol: string;
  quantity: string | number | null;
  averageCost: string | number | null;
  realizedPnl?: string | number | null;
  evidenceComplete?: boolean;
}

export interface ProjectionTradeSnapshot {
  id: string;
  symbol: string;
  lifecycle?: string;
  closedQuantity?: string | number | null;
  remainingQuantity?: string | number | null;
  netRealizedPnl?: string | number | null;
  costEstimated?: boolean;
  evidenceComplete?: boolean;
}

export interface ProjectionCashSnapshot {
  currency: string;
  settledAmount: string | number | null;
  pendingReceivable?: string | number | null;
  pendingPayable?: string | number | null;
  convertedAmount?: string | number | null;
  fxComplete?: boolean;
}

export interface ProjectionJournalSnapshot {
  tradeCycleCount: number;
  closeSliceCount: number;
  statisticsEligibleCount: number;
  legacyCandidateCount?: number;
}

export interface ProjectionSnapshot {
  accountId: string;
  mode: 'actual' | 'shadow';
  ledgerRevision?: string;
  projectionGeneration?: string;
  positions: ProjectionPositionSnapshot[];
  trades: ProjectionTradeSnapshot[];
  cash: ProjectionCashSnapshot[];
  journal?: ProjectionJournalSnapshot;
}

export interface ProjectionDifference {
  category: ProjectionDiffCategory;
  path: string;
  message: string;
  legacyValue: unknown;
  unifiedValue: unknown;
}

export interface ProjectionShadowDiffReport {
  schemaVersion: 1;
  generatedAt: string;
  scope: { accountId: string; mode: 'actual' | 'shadow' };
  sources: { legacy: ProjectionSnapshotSource; unified: ProjectionSnapshotSource };
  differences: ProjectionDifference[];
  counts: Record<ProjectionDiffCategory, number>;
  gate: {
    status: 'PASS' | 'BLOCKED';
    blockingCategories: ProjectionDiffCategory[];
    migrationAndAlgorithmClean: boolean;
  };
}

type NumericValue = string | number | null | undefined;

const numeric = (value: NumericValue) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sameNumber = (left: NumericValue, right: NumericValue, tolerance: number) => {
  const leftNumber = numeric(left);
  const rightNumber = numeric(right);
  if (leftNumber === null || rightNumber === null) return leftNumber === rightNumber;
  return Math.abs(leftNumber - rightNumber) <= tolerance;
};

const valueMissing = (value: NumericValue) => value === null || value === undefined;

const emptyCounts = (): Record<ProjectionDiffCategory, number> => ({
  EXPECTED_GRAIN_CHANGE: 0,
  EVIDENCE_GAP: 0,
  FX_GAP: 0,
  MIGRATION_DEFECT: 0,
  ALGORITHM_DEFECT: 0,
  UNCLASSIFIED: 0,
});

const byKey = <T>(values: readonly T[], key: (value: T) => string) =>
  new Map(values.map((value) => [key(value), value]));

const addDifference = (
  differences: ProjectionDifference[],
  category: ProjectionDiffCategory,
  path: string,
  message: string,
  legacyValue: unknown,
  unifiedValue: unknown,
) => {
  differences.push({ category, path, message, legacyValue, unifiedValue });
};

const compareNumericField = (input: {
  differences: ProjectionDifference[];
  path: string;
  label: string;
  legacyValue: NumericValue;
  unifiedValue: NumericValue;
  tolerance: number;
  evidenceGap: boolean;
  fxGap: boolean;
}) => {
  if (sameNumber(input.legacyValue, input.unifiedValue, input.tolerance)) return;
  if (input.fxGap) {
    addDifference(
      input.differences,
      'FX_GAP',
      input.path,
      `${input.label} 的本位币折算证据不完整`,
      input.legacyValue,
      input.unifiedValue,
    );
    return;
  }
  if (input.evidenceGap || valueMissing(input.unifiedValue)) {
    addDifference(
      input.differences,
      'EVIDENCE_GAP',
      input.path,
      `${input.label} 缺少可直接比较的完整证据`,
      input.legacyValue,
      input.unifiedValue,
    );
    return;
  }
  addDifference(
    input.differences,
    'ALGORITHM_DEFECT',
    input.path,
    `${input.label} 在可比输入下产生不同结果`,
    input.legacyValue,
    input.unifiedValue,
  );
};

const comparePositions = (
  legacy: ProjectionSnapshot,
  unified: ProjectionSnapshot,
  differences: ProjectionDifference[],
  tolerance: number,
) => {
  const legacyBySymbol = byKey(legacy.positions, (position) => position.symbol);
  const unifiedBySymbol = byKey(unified.positions, (position) => position.symbol);
  const symbols = new Set([...legacyBySymbol.keys(), ...unifiedBySymbol.keys()]);
  for (const symbol of symbols) {
    const oldPosition = legacyBySymbol.get(symbol);
    const newPosition = unifiedBySymbol.get(symbol);
    if (!oldPosition || !newPosition) {
      addDifference(
        differences,
        'MIGRATION_DEFECT',
        `positions.${symbol}`,
        '同一账户标的只在一侧投影中存在',
        oldPosition ?? null,
        newPosition ?? null,
      );
      continue;
    }
    const evidenceGap = newPosition.evidenceComplete === false;
    compareNumericField({
      differences,
      path: `positions.${symbol}.quantity`,
      label: `${symbol} 持仓数量`,
      legacyValue: oldPosition.quantity,
      unifiedValue: newPosition.quantity,
      tolerance,
      evidenceGap,
      fxGap: false,
    });
    compareNumericField({
      differences,
      path: `positions.${symbol}.averageCost`,
      label: `${symbol} 持仓成本`,
      legacyValue: oldPosition.averageCost,
      unifiedValue: newPosition.averageCost,
      tolerance,
      evidenceGap,
      fxGap: false,
    });
    compareNumericField({
      differences,
      path: `positions.${symbol}.realizedPnl`,
      label: `${symbol} 已实现收益`,
      legacyValue: oldPosition.realizedPnl,
      unifiedValue: newPosition.realizedPnl,
      tolerance,
      evidenceGap,
      fxGap: false,
    });
  }
};

const aggregateTrades = (trades: readonly ProjectionTradeSnapshot[]) => {
  const result = new Map<string, { count: number; pnl: number | null; evidenceGap: boolean }>();
  for (const trade of trades) {
    const current = result.get(trade.symbol) ?? { count: 0, pnl: 0, evidenceGap: false };
    current.count += 1;
    current.evidenceGap =
      current.evidenceGap || trade.evidenceComplete === false || trade.costEstimated === true;
    const pnl = numeric(trade.netRealizedPnl);
    if (pnl === null) current.pnl = null;
    else if (current.pnl !== null) current.pnl += pnl;
    result.set(trade.symbol, current);
  }
  return result;
};

const compareTrades = (
  legacy: ProjectionSnapshot,
  unified: ProjectionSnapshot,
  differences: ProjectionDifference[],
  tolerance: number,
) => {
  const legacyBySymbol = aggregateTrades(legacy.trades);
  const unifiedBySymbol = aggregateTrades(unified.trades);
  const symbols = new Set([...legacyBySymbol.keys(), ...unifiedBySymbol.keys()]);
  for (const symbol of symbols) {
    const oldTrades = legacyBySymbol.get(symbol);
    const newTrades = unifiedBySymbol.get(symbol);
    if (!oldTrades || !newTrades) {
      addDifference(
        differences,
        'MIGRATION_DEFECT',
        `trades.${symbol}`,
        '同一账户标的只在一侧交易投影中存在',
        oldTrades ?? null,
        newTrades ?? null,
      );
      continue;
    }
    if (oldTrades.count !== newTrades.count) {
      const category = newTrades.evidenceGap ? 'EVIDENCE_GAP' : 'ALGORITHM_DEFECT';
      addDifference(
        differences,
        category,
        `trades.${symbol}.count`,
        '同一标的的完整 Trade 数量不同',
        oldTrades.count,
        newTrades.count,
      );
    }
    compareNumericField({
      differences,
      path: `trades.${symbol}.netRealizedPnl`,
      label: `${symbol} 交易净收益`,
      legacyValue: oldTrades.pnl,
      unifiedValue: newTrades.pnl,
      tolerance,
      evidenceGap: oldTrades.evidenceGap || newTrades.evidenceGap,
      fxGap: false,
    });
  }
};

const compareCash = (
  legacy: ProjectionSnapshot,
  unified: ProjectionSnapshot,
  differences: ProjectionDifference[],
  tolerance: number,
) => {
  const legacyByCurrency = byKey(legacy.cash, (cash) => cash.currency);
  const unifiedByCurrency = byKey(unified.cash, (cash) => cash.currency);
  const currencies = new Set([...legacyByCurrency.keys(), ...unifiedByCurrency.keys()]);
  for (const currency of currencies) {
    const oldCash = legacyByCurrency.get(currency);
    const newCash = unifiedByCurrency.get(currency);
    if (!oldCash || !newCash) {
      addDifference(
        differences,
        'MIGRATION_DEFECT',
        `cash.${currency}`,
        '同一币种现金只在一侧投影中存在',
        oldCash ?? null,
        newCash ?? null,
      );
      continue;
    }
    const fxGap =
      oldCash.convertedAmount !== undefined &&
      newCash.convertedAmount !== undefined &&
      newCash.fxComplete === false;
    compareNumericField({
      differences,
      path: `cash.${currency}.settledAmount`,
      label: `${currency} 已结算现金`,
      legacyValue: oldCash.settledAmount,
      unifiedValue: newCash.settledAmount,
      tolerance,
      evidenceGap: false,
      fxGap: false,
    });
    compareNumericField({
      differences,
      path: `cash.${currency}.pendingReceivable`,
      label: `${currency} 待结算应收`,
      legacyValue: oldCash.pendingReceivable,
      unifiedValue: newCash.pendingReceivable,
      tolerance,
      evidenceGap: false,
      fxGap: false,
    });
    compareNumericField({
      differences,
      path: `cash.${currency}.pendingPayable`,
      label: `${currency} 待结算应付`,
      legacyValue: oldCash.pendingPayable,
      unifiedValue: newCash.pendingPayable,
      tolerance,
      evidenceGap: false,
      fxGap: false,
    });
    compareNumericField({
      differences,
      path: `cash.${currency}.convertedAmount`,
      label: `${currency} 本位币现金`,
      legacyValue: oldCash.convertedAmount,
      unifiedValue: newCash.convertedAmount,
      tolerance,
      evidenceGap: false,
      fxGap,
    });
  }
};

const compareJournal = (
  legacy: ProjectionSnapshot,
  unified: ProjectionSnapshot,
  differences: ProjectionDifference[],
) => {
  if (!legacy.journal || !unified.journal) {
    addDifference(
      differences,
      'UNCLASSIFIED',
      'journal',
      '缺少一侧 Journal 统计快照，无法验证迁移口径',
      legacy.journal ?? null,
      unified.journal ?? null,
    );
    return;
  }
  if (legacy.journal.tradeCycleCount !== unified.journal.tradeCycleCount) {
    addDifference(
      differences,
      'EXPECTED_GRAIN_CHANGE',
      'journal.tradeCycleCount',
      '完整 Trade 周期数量与旧按 SELL 候选数量不属于同一统计粒度',
      legacy.journal.tradeCycleCount,
      unified.journal.tradeCycleCount,
    );
  }
  if (legacy.journal.closeSliceCount !== unified.journal.closeSliceCount) {
    addDifference(
      differences,
      'EXPECTED_GRAIN_CHANGE',
      'journal.closeSliceCount',
      'Close Slice 减仓对象与旧 Journal 候选需要单独核对',
      legacy.journal.closeSliceCount,
      unified.journal.closeSliceCount,
    );
  }
  if (legacy.journal.statisticsEligibleCount !== unified.journal.statisticsEligibleCount) {
    addDifference(
      differences,
      'EVIDENCE_GAP',
      'journal.statisticsEligibleCount',
      '统计资格受完整成本、真实退出或证据状态影响',
      legacy.journal.statisticsEligibleCount,
      unified.journal.statisticsEligibleCount,
    );
  }
  if (
    legacy.journal.legacyCandidateCount !== undefined &&
    legacy.journal.legacyCandidateCount !== unified.journal.closeSliceCount
  ) {
    addDifference(
      differences,
      'MIGRATION_DEFECT',
      'journal.legacyCandidateCount',
      '旧候选未能与当前 Close Slice 数量一一对应',
      legacy.journal.legacyCandidateCount,
      unified.journal.closeSliceCount,
    );
  }
};

export const compareProjectionSnapshots = (
  legacy: ProjectionSnapshot,
  unified: ProjectionSnapshot,
  options: { generatedAt?: string; tolerance?: number } = {},
): ProjectionShadowDiffReport => {
  if (legacy.accountId !== unified.accountId || legacy.mode !== unified.mode)
    throw new Error('影子差异比较必须使用相同账户和模式');
  const differences: ProjectionDifference[] = [];
  const tolerance = options.tolerance ?? 1e-12;
  comparePositions(legacy, unified, differences, tolerance);
  compareTrades(legacy, unified, differences, tolerance);
  compareCash(legacy, unified, differences, tolerance);
  compareJournal(legacy, unified, differences);
  const counts = emptyCounts();
  for (const difference of differences) counts[difference.category] += 1;
  const blockingCategories = projectionDiffCategories
    .filter(
      (category) =>
        category === 'MIGRATION_DEFECT' ||
        category === 'ALGORITHM_DEFECT' ||
        category === 'UNCLASSIFIED',
    )
    .filter((category) => counts[category] > 0);
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    scope: { accountId: legacy.accountId, mode: legacy.mode },
    sources: { legacy: 'legacy', unified: 'unified' },
    differences,
    counts,
    gate: {
      status: blockingCategories.length === 0 ? 'PASS' : 'BLOCKED',
      blockingCategories,
      migrationAndAlgorithmClean: counts.MIGRATION_DEFECT === 0 && counts.ALGORITHM_DEFECT === 0,
    },
  };
};
