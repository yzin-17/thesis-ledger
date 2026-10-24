import {
  backtestRunCreateSchemaV3,
  backtestNavRunCreateV3Schema,
  type BacktestRunPreparationResultV3,
  type BacktestNavPreparationResultV3,
  type BacktestRunCreateV3,
  type BacktestNavRunCreateV3,
} from '@thesis-ledger/schemas';
export type PendingBacktest =
  { kind: 'ordinary'; body: BacktestRunCreateV3 } | { kind: 'nav'; body: BacktestNavRunCreateV3 };
export function parsePendingBacktest(value: unknown): PendingBacktest {
  if (!value || typeof value !== 'object' || !('kind' in value) || !('body' in value))
    throw Error('回测提交凭据无效。');
  if (value.kind === 'ordinary')
    return { kind: value.kind, body: backtestRunCreateSchemaV3.parse(value.body) };
  if (value.kind === 'nav')
    return { kind: value.kind, body: backtestNavRunCreateV3Schema.parse(value.body) };
  throw Error('回测提交类别无效。');
}
export function freezeOrdinarySubmission(
  versionId: string,
  prepared: BacktestRunPreparationResultV3,
  key: string,
): PendingBacktest {
  if (
    prepared.status !== 'prepared' ||
    prepared.executionPreflight.revisionStamp?.strategyVersionId !== versionId
  )
    throw Error('准备尚未通过或版本不一致。');
  return {
    kind: 'ordinary',
    body: backtestRunCreateSchemaV3.parse({
      contractVersion: 3,
      strategyVersionId: versionId,
      runConfig: prepared.runConfig,
      preparationStamp: prepared.executionPreflight.revisionStamp,
      idempotencyKey: key,
    }),
  };
}
export function freezeNavSubmission(
  versionId: string,
  prepared: BacktestNavPreparationResultV3,
  key: string,
  now = Date.now(),
): PendingBacktest {
  if (
    prepared.status !== 'prepared' ||
    prepared.binding.strategyVersionId !== versionId ||
    !prepared.receipt ||
    Date.parse(prepared.receipt.expiresAt) <= now
  )
    throw Error('净值准备凭证缺失、过期或版本不一致。');
  return {
    kind: 'nav',
    body: backtestNavRunCreateV3Schema.parse({
      contractVersion: 3,
      preparationId: prepared.receipt.preparationId,
      preparationHash: prepared.receipt.preparationHash,
      idempotencyKey: key,
    }),
  };
}
