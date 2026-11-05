import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readExperimentHistory } from './research-live-experiment-checkpoint.mjs';

export function readRateLimitContinuation(directory, protocol, fingerprint, inputs) {
  const source = resolve(directory);
  if (!source.startsWith(resolve('.recovery-artifacts') + '/')) throw new Error('终态接续来源越界');
  const hashes = {};
  const read = (name) => {
    const bytes = readFileSync(join(source, name));
    hashes[name] = createHash('sha256').update(bytes).digest('hex');
    return JSON.parse(bytes);
  };
  const sealed = read('sealed-inputs.json');
  const result = read('result.json');
  const arms = read('arms.json');
  const journal = read('request-journal.json');
  const http = read('http-status.json');
  if (
    result.protectedUnchanged !== true ||
    !Number.isFinite(Date.parse(result.completedAt)) ||
    !Number.isInteger(result.pid) ||
    result.pid <= 0 ||
    result.wireRequests !== 1 ||
    result.resumedFrom !== null ||
    result.report?.cases?.length !== 1 ||
    result.report.actualModelRequests !== 1 ||
    result.report.reusedRequests !== 0 ||
    result.report.priorUnknownRequests?.length !== 0 ||
    result.report.budget.stopped !== 'unknown_outcome' ||
    sealed.benchmarkSha256 !== inputs.benchmarkSha256 ||
    sealed.evaluationSha256 !== inputs.evaluationSha256
  )
    throw new Error('只接受已退出且保护核对通过的首请求429完整终态');
  try {
    process.kill(result.pid, 0);
    throw new Error('原实验进程仍存在，不接续');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  assert.deepEqual(sealed.protocol, protocol, '终态封存协议漂移');
  assert.deepEqual(result.protocol, protocol, '终态协议与封存不符');
  assert.equal(result.report.protocolFingerprint, fingerprint(protocol));
  assert.equal(result.report.benchmarkFingerprint, protocol.benchmarkFingerprint);
  assert.equal(result.report.evaluationFingerprint, protocol.evaluationFingerprint);
  assert.deepEqual(result.before, result.after, '原正常目标发生变化');
  assert.deepEqual(sealed.target, result.before, '原目标与封存不符');
  assert.deepEqual(inputs.target, result.after, '当前目标与原终态不符');
  const entry = result.report.cases[0];
  assert.equal(entry.caseId, protocol.caseIds?.[0]);
  assert.deepEqual(arms, [
    { caseId: entry.caseId, arm: 'single', result: entry.single },
    { caseId: entry.caseId, arm: 'staged', result: entry.staged },
  ]);
  const request = entry.single.requests[0];
  assert.deepEqual(journal, [
    {
      caseId: entry.caseId,
      arm: 'single',
      phase: 'settled',
      request,
      output: null,
    },
  ]);
  if (http.length !== 1 || http[0].requestId !== request?.requestId || http[0].status !== 429)
    throw new Error('缺少对应单链HTTP429事实');
  const cloudflare = protocol.version === 'research-live-experiment-v4';
  if (cloudflare && (result.realRequestsTotal !== 49 || http[0].errorCodes?.join() !== '4006'))
    throw new Error('Cloudflare只接纳获准49次起点的首请求429/4006终态');
  const parent = readExperimentHistory(
    result.historicalBudgetFrom.directory,
    protocol,
    fingerprint,
  );
  assert.deepEqual(parent.sourceProof, result.historicalBudgetFrom, '预算来源引用被修改');
  assert.deepEqual(parent.history, result.report.historicalBudget, '预算历史被修改');
  const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
  const { Prisma } = require('@prisma/client');
  const amount = new Prisma.Decimal(parent.history.amount);
  const reserved = new Prisma.Decimal(parent.history.reservedUnknown);
  const unknown = cloudflare
    ? new Prisma.Decimal(protocol.budget.maxInputTokensPerArm)
        .mul(protocol.pricing.costPer1kInput)
        .plus(
          new Prisma.Decimal(protocol.budget.maxOutputTokensPerArm).mul(
            protocol.pricing.costPer1kOutput,
          ),
        )
        .div(1000)
    : new Prisma.Decimal(0);
  if (
    parent.history.requests + 1 !== result.realRequestsTotal ||
    result.report.budget.requests !== result.realRequestsTotal ||
    sealed.initialBudget.requests !== parent.history.requests ||
    !amount.eq(sealed.initialBudget.amount) ||
    !reserved.eq(sealed.initialBudget.reservedUnknown) ||
    !amount.plus(unknown).eq(result.report.budget.committed) ||
    !reserved.plus(unknown).eq(result.report.budget.reservedUnknown) ||
    !amount.minus(reserved).eq(result.report.budget.spent)
  )
    throw new Error('首请求终态与累计费用/派发数无法对账');
  return {
    sealedProtocol: sealed.protocol,
    continuation: {
      sourceProtocolFingerprint: fingerprint(protocol),
      ...entry,
      historicalBudget: parent.history,
      realRequestsTotal: result.realRequestsTotal,
    },
    retainedArms: arms.filter((value) => value.result.requests.length > 0),
    priorRequests: result.realRequestsTotal,
    historicalBudgetFrom: parent.sourceProof,
    sourceProof: { directory: source, hashes },
  };
}
