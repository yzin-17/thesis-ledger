import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { validateFreeProbeResponse } from './research-live-experiment-probe-response.mjs';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { Prisma } = require('@prisma/client');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const local = (directory) => {
  const path = resolve(directory);
  if (!path.startsWith(resolve('.recovery-artifacts') + '/')) throw new Error('补充账本来源越界');
  return path;
};

export function readFreeProbeLedger(references = [], seenIds = new Set()) {
  if (!Array.isArray(references) || references.length > 20) throw new Error('补充账本数量无效');
  const entries = [],
    sourceProof = [],
    directories = new Set();
  for (const reference of references) {
    const directory = local(reference.directory);
    if (directories.has(directory)) throw new Error('补充来源重复');
    directories.add(directory);
    const bytes = readFileSync(join(directory, 'result.json'));
    const sealedBytes = readFileSync(join(directory, 'sealed-request.json'));
    if (hash(bytes) !== reference.resultSHA256) throw new Error('补充回执摘要不符');
    const value = JSON.parse(bytes),
      sealed = JSON.parse(sealedBytes);
    const baseDirectory = local(sealed.initialBudget.artifactRoot);
    const baseBytes = readFileSync(join(baseDirectory, 'result.json'));
    const base = JSON.parse(baseBytes);
    if (
      (reference.sealedRequestSHA256 && reference.sealedRequestSHA256 !== hash(sealedBytes)) ||
      (reference.baseResultSHA256 && reference.baseResultSHA256 !== hash(baseBytes))
    )
      throw new Error('补充封存或累计起点摘要不符');
    const responseProof = validateFreeProbeResponse(value, sealed, reference, directory, baseBytes);
    if (
      value.modelRequests !== 1 ||
      value.status !== 'successful_response' ||
      value.http?.status !== 200 ||
      value.finishReason !== 'stop' ||
      value.providerReportedCostUSD !== '0' ||
      value.usageKnown !== true ||
      value.protectedUnchanged !== true ||
      !Number.isFinite(Date.parse(value.completedAt)) ||
      !Number.isSafeInteger(value.usage?.inputTokens) ||
      value.usage.inputTokens < 0 ||
      !Number.isSafeInteger(value.usage?.outputTokens) ||
      value.usage.outputTokens < 0 ||
      hash(JSON.stringify(sealed.body)) !== sealed.bodySHA256 ||
      Number(sealed.catalog?.pricing?.prompt) !== 0 ||
      Number(sealed.catalog?.pricing?.completion) !== 0 ||
      sealed.authorization?.thisProbeMaxRequests !== 1 ||
      sealed.authorization.cumulativeMaxRequests !== 50 ||
      sealed.authorization.cumulativeMaxCostUSD !== '5' ||
      base.protectedUnchanged !== true ||
      base.realRequestsTotal !== value.initialCumulativeRequests ||
      sealed.initialBudget.realRequestsTotal !== value.initialCumulativeRequests ||
      value.realRequestsTotal !== value.initialCumulativeRequests + 1 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId) ||
      seenIds.has(value.requestId) ||
      (reference.requests !== undefined && reference.requests !== 1)
    )
      throw new Error('补充账本只接受已核对的完整免费单次成功回执');
    assert.deepEqual(value.before, value.after, '补充测试目标变化');
    assert.deepEqual(value.before, base.after, '补充测试累计起点目标不符');
    if (
      !new Prisma.Decimal(value.budget.occupiedUSD).eq(
        sealed.initialBudget.conservativeOccupiedUSD,
      ) ||
      !new Prisma.Decimal(value.budget.unknownReservedUSD).eq(
        sealed.initialBudget.conservativeUnknownReservedUSD,
      ) ||
      !new Prisma.Decimal(base.report.budget.committed).eq(
        sealed.initialBudget.conservativeOccupiedUSD,
      ) ||
      !new Prisma.Decimal(base.report.budget.reservedUnknown).eq(
        sealed.initialBudget.conservativeUnknownReservedUSD,
      )
    )
      throw new Error('补充测试费用被修改');
    seenIds.add(value.requestId);
    entries.push({
      requestId: value.requestId,
      resultSHA256: reference.resultSHA256,
      providerReportedCostUSD: '0',
    });
    sourceProof.push({
      directory,
      resultSHA256: reference.resultSHA256,
      sealedRequestSHA256: hash(sealedBytes),
      baseDirectory,
      baseResultSHA256: hash(baseBytes),
      ...responseProof,
    });
  }
  return {
    budget: { version: 'research-free-probe-budget-v1', entries },
    sourceProof,
    requests: entries.length,
  };
}

export function assertCurrentExperimentBudget(initial, checkpoint) {
  const requests = checkpoint.localModelPostAttemptsTotal ?? checkpoint.realRequestsTotal;
  if (
    requests !== initial.requests ||
    checkpoint.realRequestsTotal !== requests ||
    !new Prisma.Decimal(initial.amount).eq(checkpoint.conservativeOccupiedUSD) ||
    new Prisma.Decimal(initial.reservedUnknown).lt(checkpoint.conservativeUnknownReservedUSD)
  )
    throw new Error('累计账本未合并当前全部本地尝试或未知预留');
}
