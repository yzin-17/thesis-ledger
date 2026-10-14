import assert from 'node:assert/strict';
import { createCompositionTargetInput, compositionScope } from './market-composition-target-input.mjs';

async function confirmedInput(record, plan, strategies) {
  assert(record.phase === 'restored' && record.owned === false &&
    record.restoredRevision === plan.baseline.revision && record.plan.caseVersion === 1 &&
    record.plan.baselineFingerprint === plan.baselineFingerprint, '只能使用已确认恢复且选择相同的记录');
  assert.deepEqual(record.plan.configVersions, plan.configVersions, '来源配置代次已变化');
  const strategy = strategies.find((s) => s.id === record.strategyId);
  const version = strategy?.versions?.find((v) => v.id === record.strategyVersionId);
  assert(version, '原验收策略版本不存在');
  assert.deepEqual(version.schema, record.input.strategy, '原验收策略已变化');
  assert.equal(record.input.intent.runConfig.executionModel.scope.symbol, compositionScope.symbol);
  assert.equal(record.input.intent.runConfig.startDate, compositionScope.start);
  assert.equal(record.input.intent.runConfig.endDate, compositionScope.end);
  const expected = await createCompositionTargetInput(record.input.intent.runConfig.dataAsOf);
  assert.deepEqual(record.input.strategy, expected.strategy, '策略超出本验收输入');
  assert.deepEqual({ ...record.input.intent, requestId: expected.intent.requestId }, expected.intent,
    '模型或研究设置超出原输入');
  return { ...record.input, existingStrategy: { id: record.strategyId, versionId: record.strategyVersionId } };
}

export async function resumeCompositionInput(record, plan, strategies) {
  assert(!record.runId && !record.idempotencyKey && record.preparation?.status === 'preparing',
    '已创建或提交不明的Run不能接续创建');
  return confirmedInput(record, plan, strategies);
}

/** 显式的新验收案例；只读确认旧失败，不执行旧Run重试。 */
export async function newCompositionInputAfterFailure(record, plan, strategies, previousRun) {
  assert(typeof record.runId === 'string' && typeof record.idempotencyKey === 'string' &&
    record.runStatus === 'failed' && record.preparation?.status === 'prepared', '只接受已确认失败的原案例');
  assert(previousRun.id === record.runId && previousRun.strategyVersionId === record.strategyVersionId &&
    previousRun.idempotencyKey === record.idempotencyKey && previousRun.status === 'failed' &&
    previousRun.errorCode === 'DATA_UNAVAILABLE' && record.errorCode === previousRun.errorCode,
    '原Run身份/终态不符，禁止创建新案例');
  assert(!previousRun.snapshotManifest && !previousRun.result && !previousRun.resultChecksum,
    '已有最终产物的运行不能用于此错误修复案例');
  assert.deepEqual(previousRun.runConfig, record.preparation.runConfig, '原Run输入与准备记录不符');
  return confirmedInput(record, plan, strategies);
}

/** 后续已确认响应案例仅推进恢复证据代次；原失败记录与Run保持不变。 */
export function advanceCompositionRecordAfterResponse(record, response) {
  assert(record.phase === 'restored' && record.owned === false && record.runStatus === 'failed' &&
    typeof record.runId === 'string' && typeof record.idempotencyKey === 'string', '原失败提交必须已确认');
  assert(response.origin === record.origin && response.phase === 'verified' && response.owned === false &&
    response.plan.caseVersion === 1 && response.plan.baseline.revision === record.restoredRevision &&
    response.restoredRevision === record.restoredRevision + 2 &&
    response.plan.temporary.revision === record.restoredRevision + 1 &&
    response.plan.baselineFingerprint === record.plan.baselineFingerprint, '只能补证紧接的已恢复同路线响应案例');
  assert.deepEqual(response.plan.configVersions, record.plan.configVersions, '来源配置不能改变');
  assert(response.proof?.observations?.length === 5 && response.proof?.results?.length === 5,
    '必须保留完整五响应观察，未知执行不能推进证据');
  return { ...record, originalRestoredRevision: record.restoredRevision,
    restoredRevision: response.restoredRevision, policyConfirmation: {
      kind: 'verified-response-case-chain', caseId: response.plan.caseId,
      fromRevision: record.restoredRevision, toRevision: response.restoredRevision,
    } };
}
