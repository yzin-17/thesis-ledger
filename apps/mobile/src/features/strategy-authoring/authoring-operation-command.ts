import {
  authoringSubmitIntentSchema,
  type AuthoringModificationTarget,
  type AuthoringSubmitIntent,
} from '@thesis-ledger/schemas';
import { ThesisLedgerApiError, type ThesisLedgerApiClient } from '@thesis-ledger/api-client';
type Authoring = ThesisLedgerApiClient['strategy']['authoring'];
export type AuthoringModel = Awaited<ReturnType<Authoring['models']>>[number];
type Operation = Awaited<ReturnType<Authoring['operation']>>;
type Proposal = Awaited<ReturnType<Authoring['proposal']>>;
type Confirm = (title: string, message: string) => Promise<boolean>;
export function requireAuthoringModel(input: {
  disabled: boolean;
  conditionsReady: boolean;
  modelsReady: boolean;
  selected: AuthoringModel | undefined;
  kind: AuthoringSubmitIntent['kind'];
  acknowledged: boolean;
}) {
  if (
    input.disabled ||
    !input.conditionsReady ||
    !input.modelsReady ||
    !input.selected?.available[input.kind]
  )
    throw Error('请保存草稿并选择通过当前用途验证的模型。');
  if (input.selected.costUnknown && !input.acknowledged)
    throw Error('请明确确认所选模型的未知费用。');
  return input.selected;
}
export async function prepareAuthoringOperation(
  authoring: Authoring,
  input: {
    id: string;
    revision: number;
    kind: AuthoringSubmitIntent['kind'];
    model: AuthoringModel;
    intent: string;
    target: AuthoringModificationTarget;
    key: string;
  },
) {
  const current = await authoring.read(input.id);
  if (current.revision !== input.revision || current.state !== 'editing')
    throw Error('草稿已变化，请重新读取。');
  return authoringSubmitIntentSchema.parse({
    kind: input.kind,
    expectedRevision: input.revision,
    idempotencyKey: input.key,
    providerId: input.model.providerId,
    model: input.model.model,
    intent: input.intent,
    unknownCostAcknowledgedAt: input.model.costUnknown ? new Date().toISOString() : null,
    ...(input.kind === 'modify' ? { modificationTarget: input.target } : {}),
  });
}
export async function findOrSubmitAuthoringOperation(
  authoring: Authoring,
  id: string,
  body: AuthoringSubmitIntent,
  recover: boolean,
) {
  if (!recover) return (await authoring.submit(id, body)).id;
  const rows = await authoring.history(id);
  const found = rows.find((v) => v.selection.idempotencyKey === body.idempotencyKey);
  if (!found) throw Error('历史尚未确认原操作；可显式原样重试，保留同一标识。');
  return found.id;
}
export function authoringOperationRejected(error: unknown) {
  if (!(error instanceof ThesisLedgerApiError) || error.status !== 400) return false;
  const code = error.payload?.errorCode ?? error.payload?.code ?? error.payload?.error;
  return (
    typeof code === 'string' &&
    [
      'AUTHORING_CONDITIONS_INCOMPLETE',
      'AUTHORING_INSTRUMENT_MISMATCH',
      'AUTHORING_MODEL_UNAVAILABLE',
      'AUTHORING_MODEL_UNVERIFIED',
      'AUTHORING_COST_ACK_REQUIRED',
    ].includes(code)
  );
}
export async function applyAuthoringOperation(
  authoring: Authoring,
  input: {
    operation: Operation | undefined;
    readFailed: boolean;
    disabled: boolean;
    revision: number;
    action: string;
  },
  confirm: Confirm,
) {
  const { operation, action, revision } = input;
  if (!operation || input.readFailed || input.disabled) throw Error('请先读取当前操作并保存输入。');
  if (action !== 'cancel' && operation.revision !== revision)
    throw Error('操作修订已过期，请重新生成或读取。');
  if (
    action.startsWith('apply') &&
    !(await confirm('采用操作结果？', '请核对输出，采用后会更新当前草稿。'))
  )
    return null;
  return authoring.action(operation.id, action, revision);
}
export async function applyAuthoringProposal(
  authoring: Authoring,
  input: {
    proposal: Proposal | undefined;
    readFailed: boolean;
    disabled: boolean;
    revision: number;
    action: 'apply' | 'discard';
  },
  confirm: Confirm,
) {
  const { proposal, action, revision } = input;
  if (
    !proposal ||
    input.disabled ||
    input.readFailed ||
    proposal.revision !== revision ||
    proposal.status !== 'pending'
  )
    throw Error('建议修订已过期，请重新读取。');
  if (
    !(await confirm(
      action === 'apply' ? '采用修改建议？' : '丢弃修改建议？',
      '请核对上方差异，当前草稿将按服务端修订处理。',
    ))
  )
    return false;
  await authoring.proposalAction(proposal.id, action, revision);
  return true;
}
export function authoringSubmissionEnabled(input: {
  busy: boolean;
  pendingKnown: boolean;
  pending: boolean;
  conditionsReady: boolean;
  modelsReady: boolean;
  selected: AuthoringModel | undefined;
  kind: AuthoringSubmitIntent['kind'];
  acknowledged: boolean;
}) {
  if (input.busy || !input.pendingKnown) return false;
  if (input.pending) return true;
  if (!input.conditionsReady || !input.modelsReady || !input.selected?.available[input.kind])
    return false;
  return !input.selected.costUnknown || input.acknowledged;
}
function proposalEnabled(
  proposal: Proposal | undefined,
  busy: boolean,
  readFailed: boolean,
  revision: number,
) {
  return (
    !busy &&
    !readFailed &&
    !!proposal &&
    proposal.status === 'pending' &&
    proposal.revision === revision
  );
}
export function authoringResultControls(input: {
  operation: Operation | undefined;
  proposal: Proposal | undefined;
  busy: boolean;
  operationError: boolean;
  proposalError: boolean;
  revision: number;
}) {
  const op = input.operation;
  const ready =
    !input.busy &&
    !input.operationError &&
    !!op &&
    op.revision === input.revision &&
    op.status === 'succeeded' &&
    op.disposition === 'unapplied';
  return {
    cancel: !input.busy && !!op && ['queued', 'running'].includes(op.status),
    analysis: ready && op?.input.selection.kind === 'analyze',
    generation: ready && op?.input.selection.kind === 'generate',
    proposal: ready && op?.input.selection.kind === 'modify',
    discard: ready,
    proposalApply: proposalEnabled(input.proposal, input.busy, input.proposalError, input.revision),
    proposalDiscard: proposalEnabled(
      input.proposal,
      input.busy,
      input.proposalError,
      input.revision,
    ),
  };
}
