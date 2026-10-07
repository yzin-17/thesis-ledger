export interface CatalogJobResponse {
  contractVersion: 3;
  consumer: 'thesis-ledger';
  id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'timeout';
  generation: number;
  checksum: string;
  acknowledged: boolean;
}

const jobFields = new Set([
  'contractVersion',
  'consumer',
  'requestId',
  'id',
  'status',
  'generation',
  'checksum',
  'error',
  'owner',
  'leaseExpiresAt',
  'leaseValid',
  'retryable',
  'createdAt',
  'updatedAt',
  'acknowledged',
  'count',
  'cursor',
  'idempotent',
  'incremental',
  'deletedCount',
]);

function assertJobIdentity(value: Record<string, unknown>, expectedId?: string) {
  if (
    Object.keys(value).some((key) => !jobFields.has(key)) ||
    value.contractVersion !== 3 ||
    value.consumer !== 'thesis-ledger' ||
    typeof value.id !== 'string' ||
    !value.id ||
    (expectedId !== undefined && value.id !== expectedId) ||
    typeof value.status !== 'string' ||
    !['pending', 'running', 'succeeded', 'failed', 'timeout'].includes(value.status) ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 0 ||
    typeof value.checksum !== 'string' ||
    typeof value.acknowledged !== 'boolean' ||
    (value.requestId !== undefined && (typeof value.requestId !== 'string' || !value.requestId))
  )
    invalidCatalogJob();
}

function assertJobLease(value: Record<string, unknown>) {
  if (
    !(value.owner === null || (typeof value.owner === 'string' && value.owner.length > 0)) ||
    typeof value.leaseValid !== 'boolean' ||
    typeof value.retryable !== 'boolean'
  )
    invalidCatalogJob();
  for (const key of ['createdAt', 'updatedAt', 'leaseExpiresAt']) {
    const date = value[key];
    if (key === 'leaseExpiresAt' && date === null) continue;
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(date) ||
      !Number.isFinite(Date.parse(date))
    )
      invalidCatalogJob();
  }
}

function assertJobProjection(value: Record<string, unknown>) {
  for (const key of ['idempotent', 'incremental']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') invalidCatalogJob();
  }
  if (
    value.deletedCount !== undefined &&
    (!Number.isSafeInteger(value.deletedCount) || Number(value.deletedCount) < 0)
  )
    invalidCatalogJob();
  if (value.status === 'succeeded') {
    if (
      value.generation === 0 ||
      !/^[a-f0-9]{64}$/.test(String(value.checksum)) ||
      value.acknowledged !== true ||
      value.cursor !== `generation:${Number(value.generation)}` ||
      !Number.isSafeInteger(value.count) ||
      Number(value.count) < 0
    )
      invalidCatalogJob();
  } else if (value.acknowledged || value.cursor !== undefined || value.count !== undefined) {
    invalidCatalogJob();
  }
}

function invalidCatalogJob(): never {
  throw new Error('目录任务响应不符合当前合同，请重新同步。');
}

export function parseCatalogJobResponse(raw: unknown, expectedId?: string): CatalogJobResponse {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return invalidCatalogJob();
  const value = raw as Record<string, unknown>;
  assertJobIdentity(value, expectedId);
  assertJobLease(value);
  assertJobProjection(value);
  return {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    id: value.id as string,
    status: value.status as CatalogJobResponse['status'],
    generation: value.generation as number,
    checksum: value.checksum as string,
    acknowledged: value.acknowledged as boolean,
  };
}

export function catalogJobFeedback(job: CatalogJobResponse | undefined, failed: boolean) {
  if (failed) return { type: 'error', text: '目录任务查询失败，请重新同步。' } as const;
  if (job?.acknowledged) return { type: 'success', text: '标的目录已同步。' } as const;
  if (job?.status === 'failed' || job?.status === 'timeout')
    return { type: 'error', text: '标的目录同步任务失败，请稍后重试。' } as const;
  return null;
}

export const catalogJobPollingInterval = (job: CatalogJobResponse | undefined, failed: boolean) =>
  catalogJobFeedback(job, failed) ? false : 1_500;
