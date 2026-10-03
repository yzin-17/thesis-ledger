import { backtestNavPreparationRequestV3Schema } from '@thesis-ledger/schemas';
import { ZodError } from 'zod';
import type { NavRunPreparationV3 } from './backtest-nav-preparation.js';
import { prepareNavRunConfigV3 } from './backtest-nav-preparation.js';
import { NavInputPlanError } from './backtest-nav-planning-calendar.js';
import { SnapshotIntegrityError } from './backtest-snapshot.js';
import { canonicalizeManifest, hashCanonicalManifest } from './backtest-snapshot.js';

const MAX_RECEIPT_LIFETIME_MS = 15 * 60 * 1000;

export interface NavPreparationReceiptRow {
  strategyVersionId: string;
  preparationHash: string;
  contentChecksum: string;
  request: unknown;
  evidence: unknown;
  expiresAt: Date | string;
}

export class NavPreparationReceiptError extends Error {
  constructor(
    readonly statusCode: 409 | 422,
    readonly code: 'NAV_PREPARATION_RECEIPT_CONFLICT' | 'NAV_PREPARATION_RECEIPT_INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'NavPreparationReceiptError';
  }
}

const invalidReceipt = (): never => {
  throw new NavPreparationReceiptError(
    422,
    'NAV_PREPARATION_RECEIPT_INVALID',
    'NAV 准备证据校验失败，请重新准备',
  );
};

const expiredReceipt = (): never => {
  throw new NavPreparationReceiptError(
    409,
    'NAV_PREPARATION_RECEIPT_CONFLICT',
    'NAV 准备收据已过期，请重新准备',
  );
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isReceiptValidationError(error: unknown): boolean {
  return (
    error instanceof ZodError ||
    error instanceof NavInputPlanError ||
    error instanceof SnapshotIntegrityError ||
    error instanceof SyntaxError
  );
}

type NavPreparationRequest = ReturnType<typeof backtestNavPreparationRequestV3Schema.parse>;

interface ReplayEvidenceInput {
  startedAt: string;
  checkedAt: string;
  timeoutMs: number;
  strategy: unknown;
  selected: Record<string, unknown>;
}

function parseReplayRequest(requestInput: unknown): NavPreparationRequest {
  try {
    return backtestNavPreparationRequestV3Schema.parse(requestInput);
  } catch (error) {
    if (isReceiptValidationError(error)) return invalidReceipt();
    throw error;
  }
}

function readReplayEvidence(evidenceInput: unknown): ReplayEvidenceInput {
  const evidence = asRecord(evidenceInput);
  const binding = asRecord(evidence?.binding);
  const context = asRecord(evidence?.context);
  const selection = asRecord(evidence?.selection);
  const sourceRequest = asRecord(selection?.request);
  if (
    !binding ||
    !context ||
    !selection ||
    !sourceRequest ||
    !asRecord(selection.response) ||
    !asRecord(selection.routeState) ||
    typeof binding.startedAt !== 'string' ||
    typeof binding.checkedAt !== 'string' ||
    typeof sourceRequest.dataAsOf !== 'string'
  ) {
    return invalidReceipt();
  }
  const startedAt = binding.startedAt;
  const checkedAt = binding.checkedAt;
  const timeoutMs = Date.parse(sourceRequest.dataAsOf) - Date.parse(startedAt);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
    return invalidReceipt();
  }

  let selected: Record<string, unknown>;
  try {
    selected = structuredClone(selection);
  } catch {
    return invalidReceipt();
  }
  return { startedAt, checkedAt, timeoutMs, strategy: context.strategy, selected };
}

async function prepareFromReceipt(
  request: NavPreparationRequest,
  input: ReplayEvidenceInput,
): Promise<NavRunPreparationV3> {
  try {
    return await prepareNavRunConfigV3({
      request,
      strategy: input.strategy,
      reader: {
        read: () => Promise.resolve(input.selected),
      } as never,
      acquisitionTimeoutMs: input.timeoutMs,
      now: (() => {
        const times = [input.startedAt, input.checkedAt];
        return () => {
          const time = times.shift();
          if (!time) return invalidReceipt();
          return time;
        };
      })(),
    });
  } catch (error) {
    if (error instanceof NavPreparationReceiptError) throw error;
    if (isReceiptValidationError(error)) return invalidReceipt();
    throw error;
  }
}

function assertReceiptReplayMatches(replayed: NavRunPreparationV3, evidence: unknown): void {
  let replayedCanonical: string;
  let evidenceCanonical: string;
  try {
    replayedCanonical = canonicalizeManifest(replayed);
    evidenceCanonical = canonicalizeManifest(evidence);
  } catch {
    return invalidReceipt();
  }
  if (replayedCanonical !== evidenceCanonical) invalidReceipt();
}

export async function replayNavPreparationEvidence(
  requestInput: unknown,
  evidenceInput: unknown,
): Promise<NavRunPreparationV3> {
  const request = parseReplayRequest(requestInput);
  const replayInput = readReplayEvidence(evidenceInput);
  const replayed = await prepareFromReceipt(request, replayInput);
  assertReceiptReplayMatches(replayed, evidenceInput);
  return replayed;
}

function validatedExpiry(row: NavPreparationReceiptRow, evidence: NavRunPreparationV3) {
  const expiresAt = row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt);
  const expiresAtMs = expiresAt.getTime();
  const checkedAtMs = Date.parse(evidence.binding.checkedAt);
  const admissionExpiryMs = Date.parse(evidence.selection.response.admission.validUntil);
  const maximumExpiryMs = checkedAtMs + MAX_RECEIPT_LIFETIME_MS;
  if (
    !Number.isFinite(expiresAtMs) ||
    !Number.isFinite(checkedAtMs) ||
    !Number.isFinite(admissionExpiryMs) ||
    expiresAtMs <= checkedAtMs ||
    expiresAtMs > maximumExpiryMs ||
    expiresAtMs > admissionExpiryMs
  ) {
    return invalidReceipt();
  }
  return expiresAt;
}

/** 校验数据库收据的完整绑定，并从原始选择重放 N1 准备合同。 */
export async function validateNavPreparationReceipt(
  row: NavPreparationReceiptRow,
  now: () => number = Date.now,
): Promise<NavRunPreparationV3> {
  if (
    !row ||
    typeof row.strategyVersionId !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row.preparationHash) ||
    !/^[a-f0-9]{64}$/u.test(row.contentChecksum)
  ) {
    return invalidReceipt();
  }
  let checksum: string;
  try {
    checksum = hashCanonicalManifest({ request: row.request, evidence: row.evidence });
  } catch {
    return invalidReceipt();
  }
  if (checksum !== row.contentChecksum) return invalidReceipt();
  const evidence = await replayNavPreparationEvidence(row.request, row.evidence);
  if (
    row.strategyVersionId !== evidence.binding.strategyVersionId ||
    row.preparationHash !== evidence.binding.preparationHash
  ) {
    return invalidReceipt();
  }
  const expiresAt = validatedExpiry(row, evidence);
  if (expiresAt.getTime() <= now()) return expiredReceipt();
  return evidence;
}

export const navPreparationReceiptContentChecksum = (request: unknown, evidence: unknown) =>
  hashCanonicalManifest({ request, evidence });

export const navPreparationReceiptMaximumLifetimeMs = MAX_RECEIPT_LIFETIME_MS;
