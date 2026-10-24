import { ThesisLedgerApiError, type ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import {
  omitUndefinedDeep,
  type StrategyRiskApplicationRead,
  type StrategyRiskUpgradePreviewRead,
} from '@thesis-ledger/schemas';
import {
  parseStrategyRiskAction,
  riskUpdateSatisfied,
  type StrategyRiskAction,
} from './risk-application-actions';
import { riskNotificationBody, type RiskNotificationForm } from './risk-notification-model';
type Risk = ThesisLedgerApiClient['strategy']['risk'];
function requireRiskWriteCapability(enabled:boolean) {
  if(!enabled)throw Error('策略风险应用能力未就绪，仅可读取原状态；原提交凭据仍保留。');
}
export function prepareRiskApplicationCommand(input: {
  action: 'update' | 'archive' | 'upgrade';
  current: StrategyRiskApplicationRead;
  latest: StrategyRiskApplicationRead;
  readable: boolean;
  dirty: boolean;
  preview: StrategyRiskUpgradePreviewRead | undefined;
  previewError: boolean;
  target: string;
  enabled: boolean;
  notification: RiskNotificationForm;
  idempotencyKey: string;
}) {
  const { action, current, latest } = input;
  if (!input.readable || latest.revision !== current.revision || latest.archivedAt)
    throw Error('应用修订或归档状态已变化，输入仍保留。');
  if (action === 'update')
    return parseStrategyRiskAction({
      id: current.id,
      action,
      body: {
        expectedRevision: current.revision,
        enabled: input.enabled,
        notification: riskNotificationBody(input.notification),
      },
    });
  if (action === 'archive')
    return parseStrategyRiskAction({
      id: current.id,
      action,
      body: { expectedRevision: current.revision },
    });
  if (
    input.dirty ||
    !input.preview ||
    input.previewError ||
    input.preview.currentRevision !== current.revision
  )
    throw Error('请先保存输入并重新预览当前修订的升级。');
  return parseStrategyRiskAction({
    id: current.id,
    action,
    body: {
      expectedRevision: input.preview.currentRevision,
      targetStrategyVersionId: input.target,
      previewHash: input.preview.previewHash,
      idempotencyKey: input.idempotencyKey,
    },
  });
}
export async function executeRiskApplicationCommand(
  risk: Risk,
  entry: StrategyRiskAction,
  latest: StrategyRiskApplicationRead,
  enabled: boolean,
) {
  if (entry.id !== latest.id) throw Error('风险应用命令身份不一致。');
  let result: StrategyRiskApplicationRead;
  if (entry.action === 'update') {
    if (riskUpdateSatisfied(latest, entry.body)) return latest;
    if (latest.revision !== entry.body.expectedRevision)
      throw Error('服务端修订已改变且配置不同，保留输入，请重新核对。');
    requireRiskWriteCapability(enabled);
    result = await risk.update(entry.id, omitUndefinedDeep(entry.body));
  } else if (entry.action === 'archive') {
    if (latest.archivedAt) return latest;
    if (latest.revision !== entry.body.expectedRevision) throw Error('归档修订冲突，未再次提交。');
    requireRiskWriteCapability(enabled);
    result = await risk.archive(entry.id, entry.body.expectedRevision);
  } else {
    requireRiskWriteCapability(enabled);
    result = await risk.upgrade(entry.id, entry.body);
  }
  if (result.accountId !== latest.accountId || result.symbol !== latest.symbol)
    throw Error('更改回执的账户或标的不匹配，保留原凭据。');
  return result;
}
export function riskApplicationCommandRejected(error: unknown) {
  if (error instanceof ThesisLedgerApiError) return [400, 409].includes(error.status);
  return error instanceof Error && /修订.*(改变|冲突)/.test(error.message);
}
