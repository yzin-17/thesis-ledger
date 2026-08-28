export const projectionReadModes = ['legacy', 'shadow', 'unified'] as const;
export type ProjectionReadMode = (typeof projectionReadModes)[number];

export const projectionSwitchStages = [
  'trade-query',
  'account-data',
  'portfolio',
  'journal',
] as const;
export type ProjectionSwitchStage = (typeof projectionSwitchStages)[number];

export type ProjectionSwitchDecision = {
  allowed: boolean;
  reasons: string[];
  nextMode: ProjectionReadMode;
  completedStages: ProjectionSwitchStage[];
};

export type ProjectionGateInput = {
  targetMode: ProjectionReadMode;
  completedStages: readonly ProjectionSwitchStage[];
  report: {
    gate: {
      status: 'PASS' | 'BLOCKED';
      blockingCategories: readonly string[];
    };
  };
  rollbackCheckpointAvailable?: boolean;
  sourceLedgerMutated?: boolean;
};

export const parseProjectionReadMode = (value: string | undefined): ProjectionReadMode => {
  if (value && projectionReadModes.includes(value as ProjectionReadMode))
    return value as ProjectionReadMode;
  throw new Error(`PROJECTION_READ_MODE 无效: ${value ?? '(empty)'}`);
};

const prefixStages = (stages: readonly ProjectionSwitchStage[]) => {
  const unique = [...new Set(stages)];
  return projectionSwitchStages.filter((stage) => unique.includes(stage));
};

export const evaluateProjectionSwitch = (input: ProjectionGateInput): ProjectionSwitchDecision => {
  const completedStages = prefixStages(input.completedStages);
  const reasons: string[] = [];
  if (input.sourceLedgerMutated === true)
    reasons.push('切换门禁不允许通过修改原始 Ledger 事实配平差异');
  if (input.targetMode === 'legacy') {
    if (!input.rollbackCheckpointAvailable)
      reasons.push('回滚到 legacy 前必须存在经过验证的只读回滚检查点');
    return {
      allowed: reasons.length === 0,
      reasons,
      nextMode: input.targetMode,
      completedStages,
    };
  }
  if (input.report.gate.status !== 'PASS')
    reasons.push(`影子差异报告存在阻断类别: ${input.report.gate.blockingCategories.join(', ')}`);
  const missingStages = projectionSwitchStages.filter((stage) => !completedStages.includes(stage));
  if (missingStages.length > 0) reasons.push(`尚未完成分阶段读取切换: ${missingStages.join(', ')}`);
  return {
    allowed: reasons.length === 0,
    reasons,
    nextMode: input.targetMode,
    completedStages,
  };
};
