import {
  optimizationExperimentCloneSchema,
  optimizationExperimentRenameSchema,
  optimizationFinalizeSchema,
} from '@thesis-ledger/schemas';
export type ExperimentAction =
  | {
      id: string;
      action: 'clone';
      body: {
        idempotencyKey: string;
        name?: string | undefined;
        acknowledgeUnknownCost?: boolean | undefined;
      };
    }
  | { id: string; action: 'rename'; body: { name: string } }
  | { id: string; action: 'cancel'; body: Record<string, never> }
  | {
      id: string;
      action: 'finalize';
      body: {
        candidateIds: string[];
        selectedCandidateId: string;
        expectedStage: 'awaiting_finalization';
      };
    };
export function cloneExperimentInput(entry: Extract<ExperimentAction, { action: 'clone' }>) {
  return {
    idempotencyKey: entry.body.idempotencyKey,
    ...(entry.body.name === undefined ? {} : { name: entry.body.name }),
    ...(entry.body.acknowledgeUnknownCost === undefined
      ? {}
      : { acknowledgeUnknownCost: entry.body.acknowledgeUnknownCost }),
  };
}
export function parseExperimentAction(value: unknown): ExperimentAction {
  if (!value || typeof value !== 'object') throw Error('实验操作凭据无效。');
  const row = value as ExperimentAction;
  if (typeof row.id !== 'string' || !row.id) throw Error('实验操作缺少对象身份。');
  if (row.action === 'clone')
    return { ...row, body: optimizationExperimentCloneSchema.parse(row.body) };
  if (row.action === 'rename')
    return { ...row, body: optimizationExperimentRenameSchema.parse(row.body) };
  if (row.action === 'finalize')
    return { ...row, body: optimizationFinalizeSchema.parse(row.body) };
  if (row.action === 'cancel' && row.body && Object.keys(row.body).length === 0)
    return { id: row.id, action: row.action, body: {} };
  throw Error('实验操作类别无效。');
}
