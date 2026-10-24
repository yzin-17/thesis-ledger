import {
  riskApplicationUpdateSchema,
  riskApplicationUpgradeSchema,
  riskApplicationArchiveSchema,
  type StrategyRiskApplicationRead,
  type StrategyRiskNotificationInput,
} from '@thesis-ledger/schemas';
import { isEqual } from 'es-toolkit';
export function riskCapabilityAvailable(query:{isSuccess:boolean;isError:boolean;data?:{riskApplicationsEnabled:boolean}|undefined}) {
  return query.isSuccess&&!query.isError&&query.data?.riskApplicationsEnabled===true;
}
export function strategyRiskStatusLabel(
  input: Pick<StrategyRiskApplicationRead, 'enabled' | 'archivedAt'>,
) {
  if (input.archivedAt) return '已归档';
  if (input.enabled) return '启用';
  return '停用';
}
export function riskUpgradeControls(input:{locked:boolean;dirty:boolean;target:string;currentVersion:string;reading:boolean;previewAvailable:boolean;previewError:boolean;pendingKnown:boolean}) {
  const mutable=!input.locked&&!input.dirty;
  return {preview:mutable&&!!input.target&&input.target!==input.currentVersion&&!input.reading,
    confirm:mutable&&input.previewAvailable&&!input.previewError&&input.pendingKnown};
}
export function riskCreateControls(input:{writing:boolean;pending:boolean;receipt:boolean;pendingKnown:boolean;capabilityReady:boolean;previewCurrent:boolean;previewFailed:boolean;ready:boolean}) {
  return {
    locked:input.writing||input.pending||input.receipt,
    submitDisabled:input.writing||input.receipt||!input.pendingKnown||!input.capabilityReady||
      (!input.pending&&(!input.previewCurrent||input.previewFailed||!input.ready)),
  };
}
export type StrategyRiskAction =
  | {
      id: string;
      action: 'update';
      body: {
        expectedRevision: number;
        enabled?: boolean | undefined;
        notification?: StrategyRiskNotificationInput | undefined;
      };
    }
  | { id: string; action: 'archive'; body: { expectedRevision: number } }
  | {
      id: string;
      action: 'upgrade';
      body: {
        expectedRevision: number;
        targetStrategyVersionId: string;
        previewHash: string;
        idempotencyKey: string;
      };
    };
export function parseStrategyRiskAction(value: unknown): StrategyRiskAction {
  if (!value || typeof value !== 'object') throw Error('风险应用操作凭据无效。');
  const row = value as StrategyRiskAction;
  if (typeof row.id !== 'string' || !row.id) throw Error('风险应用操作缺少身份。');
  if (row.action === 'update') return { ...row, body: riskApplicationUpdateSchema.parse(row.body) };
  if (row.action === 'archive')
    return { ...row, body: riskApplicationArchiveSchema.parse(row.body) };
  if (row.action === 'upgrade')
    return { ...row, body: riskApplicationUpgradeSchema.parse(row.body) };
  throw Error('未知风险应用操作。');
}
export function riskUpdateSatisfied(
  row: StrategyRiskApplicationRead,
  body: Extract<StrategyRiskAction, { action: 'update' }>['body'],
) {
  return (
    row.revision >= body.expectedRevision &&
    (body.enabled === undefined || row.enabled === body.enabled) &&
    (body.notification === undefined || isEqual(row.notification, body.notification))
  );
}
