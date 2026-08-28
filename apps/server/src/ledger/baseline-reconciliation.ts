import { Prisma } from '@prisma/client';
import {
  baselineReconciliationRuleVersionV2,
  type BaselineReconciliationCandidateV2,
  type BaselineReconciliationCheckpointV2,
  type BaselineReconciliationConflictReasonV2,
} from '@thesis-ledger/schemas';

Prisma.Decimal.set({ precision: 40 });

export type BaselineReconciliationBaseline = {
  factId: string;
  accountId: string;
  symbol: string;
  occurredAt: string | null;
  timePrecision: 'INSTANT' | 'DATE' | 'UNKNOWN';
  sourceTimezone: string;
  economicOrderKey: string;
  quantity: string;
  averageCost?: string;
  currency: string;
};

export type BaselineReconciliationExecution = {
  factId: string;
  accountId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  occurredAt: string | null;
  economicOrderKey: string;
  quantity: string;
  price: string;
  currency: string;
  charges: readonly { amount: string; currency: string }[];
};

export type ActiveBaselineReconciliation = {
  factId: string;
  baselineFactId: string;
  executionFactIds: readonly string[];
};

export type BaselineReconciliationEngineInput = {
  baselines: readonly BaselineReconciliationBaseline[];
  executions: readonly BaselineReconciliationExecution[];
  reconciliations: readonly ActiveBaselineReconciliation[];
};

type ReplayState = {
  quantity: Prisma.Decimal;
  cost: Prisma.Decimal;
  conflictReasons: Set<BaselineReconciliationConflictReasonV2>;
};

type AssignmentIndex = {
  executionOwners: Map<string, string[]>;
  assignedExecutionFactIds: Set<string>;
  conflictReasonsByBaseline: Map<string, Set<BaselineReconciliationConflictReasonV2>>;
};

const decimal = (value: string) => new Prisma.Decimal(value);
const zero = () => new Prisma.Decimal(0);

const compareOrdered = (
  left: Pick<BaselineReconciliationBaseline, 'occurredAt' | 'economicOrderKey' | 'factId'>,
  right: Pick<BaselineReconciliationBaseline, 'occurredAt' | 'economicOrderKey' | 'factId'>,
) => {
  if (left.occurredAt === null && right.occurredAt !== null) return -1;
  if (left.occurredAt !== null && right.occurredAt === null) return 1;
  if (left.occurredAt !== right.occurredAt)
    return (left.occurredAt ?? '').localeCompare(right.occurredAt ?? '');
  return (
    left.economicOrderKey.localeCompare(right.economicOrderKey) ||
    left.factId.localeCompare(right.factId)
  );
};

const isAtOrBefore = (
  execution: BaselineReconciliationExecution,
  baseline: BaselineReconciliationBaseline,
) =>
  execution.occurredAt !== null &&
  baseline.occurredAt !== null &&
  compareOrdered(execution, baseline) <= 0;

const sortExecutions = (executions: readonly BaselineReconciliationExecution[]) =>
  [...executions].sort(compareOrdered);

const sortBaselines = (baselines: readonly BaselineReconciliationBaseline[]) =>
  [...baselines].sort(
    (left, right) => left.symbol.localeCompare(right.symbol) || compareOrdered(left, right),
  );

const buildAssignmentIndex = (
  input: BaselineReconciliationEngineInput,
  baselineById: Map<string, BaselineReconciliationBaseline>,
  executionById: Map<string, BaselineReconciliationExecution>,
): AssignmentIndex => {
  const executionOwners = new Map<string, string[]>();
  const conflictReasonsByBaseline = new Map<string, Set<BaselineReconciliationConflictReasonV2>>();
  const addConflict = (baselineFactId: string, reason: BaselineReconciliationConflictReasonV2) => {
    const reasons = conflictReasonsByBaseline.get(baselineFactId) ?? new Set();
    reasons.add(reason);
    conflictReasonsByBaseline.set(baselineFactId, reasons);
  };
  for (const reconciliation of input.reconciliations) {
    for (const executionFactId of reconciliation.executionFactIds) {
      const owners = executionOwners.get(executionFactId) ?? [];
      owners.push(reconciliation.baselineFactId);
      executionOwners.set(executionFactId, owners);
      const execution = executionById.get(executionFactId);
      if (!execution) {
        addConflict(reconciliation.baselineFactId, 'EXECUTION_NOT_FOUND');
        continue;
      }
      const baseline = baselineById.get(reconciliation.baselineFactId);
      if (!baseline) continue;
      if (execution.accountId !== baseline.accountId || execution.symbol !== baseline.symbol)
        addConflict(reconciliation.baselineFactId, 'EXECUTION_SCOPE_MISMATCH');
      if (!isAtOrBefore(execution, baseline))
        addConflict(reconciliation.baselineFactId, 'EXECUTION_AFTER_BASELINE');
    }
  }
  for (const owners of executionOwners.values()) {
    if (owners.length > 1) {
      for (const baselineFactId of owners)
        addConflict(baselineFactId, 'DUPLICATE_EXECUTION_COVERAGE');
    }
  }
  return {
    executionOwners,
    assignedExecutionFactIds: new Set(executionOwners.keys()),
    conflictReasonsByBaseline,
  };
};

const replayExecutions = (
  executions: readonly BaselineReconciliationExecution[],
  expectedCurrency: string,
): ReplayState => {
  const state: ReplayState = { quantity: zero(), cost: zero(), conflictReasons: new Set() };
  for (const execution of sortExecutions(executions)) {
    if (execution.occurredAt === null) {
      state.conflictReasons.add('EXECUTION_TIME_UNKNOWN');
      continue;
    }
    if (execution.currency !== expectedCurrency)
      state.conflictReasons.add('EXECUTION_CURRENCY_MISMATCH');
    let sameCurrencyCharges = zero();
    for (const charge of execution.charges) {
      if (charge.currency !== execution.currency) {
        state.conflictReasons.add('CHARGE_CURRENCY_MISMATCH');
        continue;
      }
      sameCurrencyCharges = sameCurrencyCharges.plus(decimal(charge.amount));
    }
    const quantity = decimal(execution.quantity);
    if (execution.side === 'BUY') {
      state.quantity = state.quantity.plus(quantity);
      state.cost = state.cost
        .plus(quantity.mul(decimal(execution.price)))
        .plus(sameCurrencyCharges);
      continue;
    }
    if (quantity.gt(state.quantity)) {
      state.conflictReasons.add('EXECUTION_OVERSELL');
      state.quantity = state.quantity.minus(quantity);
      state.cost = zero();
      continue;
    }
    const averageCost = state.quantity.isZero() ? zero() : state.cost.div(state.quantity);
    state.quantity = state.quantity.minus(quantity);
    state.cost = state.cost.minus(quantity.mul(averageCost));
  }
  return state;
};

const observedCost = (baseline: BaselineReconciliationBaseline) => {
  const quantity = decimal(baseline.quantity);
  if (quantity.isZero()) return zero();
  if (baseline.averageCost === undefined) return undefined;
  return quantity.mul(decimal(baseline.averageCost));
};

const checkpointFor = (
  baseline: BaselineReconciliationBaseline,
  assignedExecutionFactIds: ReadonlySet<string>,
  executions: readonly BaselineReconciliationExecution[],
  baselineConflictReasons: ReadonlySet<BaselineReconciliationConflictReasonV2>,
): BaselineReconciliationCheckpointV2 => {
  const relevantExecutions = sortExecutions(
    executions.filter(
      (execution) =>
        execution.accountId === baseline.accountId &&
        execution.symbol === baseline.symbol &&
        assignedExecutionFactIds.has(execution.factId) &&
        isAtOrBefore(execution, baseline),
    ),
  );
  const replay = replayExecutions(relevantExecutions, baseline.currency);
  const conflictReasons = new Set<BaselineReconciliationConflictReasonV2>();
  for (const reason of baselineConflictReasons) conflictReasons.add(reason);
  for (const reason of replay.conflictReasons) conflictReasons.add(reason);
  if (baseline.occurredAt === null) conflictReasons.add('BASELINE_TIME_UNKNOWN');
  const quantity = decimal(baseline.quantity);
  const cost = observedCost(baseline);
  if (!quantity.isZero() && cost === undefined) conflictReasons.add('MISSING_BASELINE_COST');
  const remainingQuantity = quantity.minus(replay.quantity);
  const remainingCost = cost === undefined ? undefined : cost.minus(replay.cost);
  if (remainingQuantity.isNegative()) conflictReasons.add('NEGATIVE_REMAINING_QUANTITY');
  if (remainingCost?.isNegative()) conflictReasons.add('NEGATIVE_REMAINING_COST');
  let status: BaselineReconciliationCheckpointV2['status'] = 'PARTIAL';
  if (conflictReasons.size > 0) status = 'CONFLICTED';
  else if (remainingQuantity.isZero() && (remainingCost === undefined || remainingCost.isZero()))
    status = 'MATCHED';
  return {
    baselineFactId: baseline.factId,
    symbol: baseline.symbol,
    occurredAt: baseline.occurredAt,
    observedQuantity: quantity.toString(),
    ...(cost === undefined ? {} : { observedCost: cost.toString() }),
    reconciledExecutionFactIds: relevantExecutions.map((execution) => execution.factId),
    reconciledActualQuantity: replay.quantity.toString(),
    reconciledActualCost: replay.cost.toString(),
    remainingQuantity: remainingQuantity.toString(),
    ...(remainingCost === undefined ? {} : { remainingCost: remainingCost.toString() }),
    status,
    conflictReasons: [...conflictReasons],
  };
};

export const replayBaselineCheckpoints = (
  input: BaselineReconciliationEngineInput,
  assignedExecutionFactIds?: ReadonlySet<string>,
) => {
  const baselineById = new Map(input.baselines.map((baseline) => [baseline.factId, baseline]));
  const executionById = new Map(input.executions.map((execution) => [execution.factId, execution]));
  const assignmentIndex = buildAssignmentIndex(input, baselineById, executionById);
  const assigned = assignedExecutionFactIds ?? assignmentIndex.assignedExecutionFactIds;
  return sortBaselines(input.baselines).map((baseline) =>
    checkpointFor(
      baseline,
      assigned,
      input.executions,
      assignmentIndex.conflictReasonsByBaseline.get(baseline.factId) ?? new Set(),
    ),
  );
};

export const generateBaselineReconciliationCandidates = (
  input: BaselineReconciliationEngineInput,
) => {
  const baselines = sortBaselines(input.baselines);
  const baselineById = new Map(baselines.map((baseline) => [baseline.factId, baseline]));
  const executionById = new Map(input.executions.map((execution) => [execution.factId, execution]));
  const assignmentIndex = buildAssignmentIndex(input, baselineById, executionById);
  const checkpoints = replayBaselineCheckpoints(input);
  const candidates: BaselineReconciliationCandidateV2[] = [];

  for (const baseline of baselines) {
    const eligible = sortExecutions(
      input.executions.filter(
        (execution) =>
          execution.accountId === baseline.accountId &&
          execution.symbol === baseline.symbol &&
          isAtOrBefore(execution, baseline) &&
          !assignmentIndex.assignedExecutionFactIds.has(execution.factId),
      ),
    );
    const prefix: string[] = [];
    for (const execution of eligible) {
      prefix.push(execution.factId);
      const assigned = new Set([...assignmentIndex.assignedExecutionFactIds, ...prefix]);
      const hypotheticalCheckpoints = replayBaselineCheckpoints(input, assigned);
      const target = hypotheticalCheckpoints.find(
        (checkpoint) => checkpoint.baselineFactId === baseline.factId,
      );
      if (!target) continue;
      if (decimal(target.reconciledActualQuantity).isZero()) continue;
      const reasons = new Set<BaselineReconciliationConflictReasonV2>();
      for (const checkpoint of hypotheticalCheckpoints) {
        const checkpointBaseline = baselineById.get(checkpoint.baselineFactId);
        if (
          checkpointBaseline &&
          checkpoint.symbol === baseline.symbol &&
          compareOrdered(checkpointBaseline, baseline) <= 0
        ) {
          for (const reason of checkpoint.conflictReasons) reasons.add(reason);
        }
      }
      const status =
        reasons.size === 0 &&
        decimal(target.reconciledActualQuantity).gt(0) &&
        decimal(target.reconciledActualCost).gte(0)
          ? ('AVAILABLE' as const)
          : ('CONFLICTED' as const);
      candidates.push({
        candidateId: `${baseline.factId}:${prefix.join(',')}`,
        baselineFactId: baseline.factId,
        symbol: baseline.symbol,
        executionFactIds: [...prefix],
        observedQuantity: target.observedQuantity,
        ...(target.observedCost === undefined ? {} : { observedCost: target.observedCost }),
        coveredQuantity: target.reconciledActualQuantity,
        coveredCost: target.reconciledActualCost,
        remainingQuantity: target.remainingQuantity,
        ...(target.remainingCost === undefined ? {} : { remainingCost: target.remainingCost }),
        status,
        matchBasis: [
          'ACCOUNT_MATCH',
          'SYMBOL_MATCH',
          'EXECUTION_BEFORE_BASELINE',
          'CHRONOLOGICAL_PREFIX',
          'REPLAYED_CHECKPOINTS',
        ],
        conflictReasons: [...reasons],
      });
    }
  }
  return {
    ruleVersion: baselineReconciliationRuleVersionV2,
    checkpoints,
    candidates,
  };
};
