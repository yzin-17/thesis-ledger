import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { createHash, randomUUID } from 'node:crypto';
import { access, owner, schemas, sealAiFrozenResearchV2, verifyAiFrozenResearchV2 } from './research-recovery-runtime.mjs';

export async function recoveryCases(runtime, model, workers, sample) {
  const rows = [], outcomes = [], fingerprints = new Map();
  const settings = await runtime.routing.read();
  await runtime.routing.update({ researchDefault: { providerId: 'controlled-provider', model: 'controlled-model' }, expectedRevision: settings.revision });
  async function seed(name) {
    const revision = (await runtime.routing.read()).revision;
    const frozen = structuredClone(sample.frozen);
    frozen.request.submissionId = randomUUID();
    frozen.request.question = `受控恢复验收：${name}`;
    frozen.request.researchSettingsRevision = revision; frozen.researchSettingsRevision = revision;
    frozen.evidence[0].numericFields = [{ fieldPath: '/price', unit: 'price', currency: 'CNY' }];
    const source = sealAiFrozenResearchV2(frozen);
    const saved = await runtime.runs.startResearchV2(owner, source, access);
    fingerprints.set(saved.run.id, source.inputFingerprint); rows.push({ name, id: saved.run.id });
    return saved.run.id;
  }
  const stored = async id => {
    const run = await runtime.prisma.aiRun.findUniqueOrThrow({ where: { id } });
    const execution = schemas.aiExecutionSummarySchema.parse(run.modelMetadata.sdkExecution);
    assert.equal(verifyAiFrozenResearchV2(run.modelMetadata.frozenResearch).inputFingerprint, fingerprints.get(id));
    return { run, execution };
  };
  const expire = id => runtime.prisma.aiRun.update({ where: { id }, data: { leaseUntil: new Date(Date.now() - 1000) } });
  const completed = async (name, id, status, requestCount, beforeCount) => {
    const { run, execution } = await stored(id);
    assert.equal(run.status, status); assert.equal(model.requests.length - beforeCount, requestCount);
    if (status === 'succeeded') {
      schemas.researchResultV2Schema.parse(run.result);
      assert.equal(run.inputTokens, 8); assert.equal(run.outputTokens, 5); assert.equal(run.cost.toString(), '0.07');
      assert.equal(execution.requests.length, 1); assert.equal(execution.requests[0].settledRevision, 1);
      assert.equal(execution.requests[0].usageRevisions.length, 1);
    } else {
      assert.equal(run.result, null); assert.equal(run.cost.toString(), '0');
      assert.equal(run.inputTokens, 0); assert.equal(run.outputTokens, 0);
      assert(execution.requests.every(request => request.settledRevision === 0 && request.usageRevisions.length === 0));
    }
    outcomes.push({ name, id, status, requests: requestCount, executionAttempt: run.executionAttempt,
      errorCode: run.errorCode, usageCompleteness: execution.usageCompleteness,
      requestStates: execution.requests.map(value => value.state),
      settledRevisions: execution.requests.map(value => value.settledRevision) });
    console.log(JSON.stringify({ event: 'case-passed', name, status, requests: requestCount }));
    return { run, execution };
  };

  for (const stage of ['queued', 'prepared']) {
    const name = `${stage}-restart`, id = await seed(name), before = model.requests.length;
    const first = workers.launch(`park-${stage}`, id), prepared = await first.ready();
    await first.kill(); await setTimeout(400);
    await workers.run('recover', id); await workers.run('execute', id);
    const value = await completed(name, id, 'succeeded', 1, before);
    assert.equal(value.run.executionAttempt, stage === 'prepared' ? 2 : 1);
    if (stage === 'prepared') {
      const request = value.execution.requests[0]; assert.equal(request.requestId, prepared.requestId);
      const late = await runtime.state.completeAndSettle({ runId: id, executionAttempt: 1, requestId: request.requestId,
        revision: request.usageRevisions[0], outcome: request.outcome, result: value.run.result });
      assert.equal(late, null, '旧领取代次提交未被拒绝');
    }
  }

  {
    const name = 'dispatched-restart', id = await seed(name), before = model.requests.length;
    model.hold(); const first = workers.launch('execute-crash', id); await model.received(before + 1);
    await first.kill(); await setTimeout(1100); await workers.run('recover', id);
    await workers.run('execute', id); model.release(); model.valid();
    const value = await completed(name, id, 'failed', 1, before);
    assert.equal(value.run.errorCode, 'research_unknown_outcome');
    // 崩溃后保存的是最后已知发送状态；Run 的终态与未知费用阻止重放，不改造不可见的外部结果。
    assert.equal(value.execution.requests[0].state, 'dispatching');
    assert.equal(value.execution.usageCompleteness, 'unknown');
  }
  {
    const name = 'lease-lost-late-result', id = await seed(name), before = model.requests.length;
    model.hold(); const first = workers.launch('execute', id); await model.received(before + 1);
    await expire(id); await workers.run('recover', id);
    const terminal = await stored(id); model.release(); await first.done(); model.valid();
    const value = await completed(name, id, 'failed', 1, before);
    assert.equal(value.run.errorCode, 'research_unknown_outcome');
    assert.deepEqual(value.execution, terminal.execution);
    await workers.run('execute', id); assert.equal(model.requests.length - before, 1);
  }
  for (const stage of ['queued', 'prepared']) {
    const name = `${stage}-cancel`, id = await seed(name), before = model.requests.length;
    let first;
    if (stage === 'prepared') { first = workers.launch('park-prepared', id); await first.ready(); }
    await workers.run('cancel', id);
    if (first) await first.kill();
    await workers.run('execute', id);
    const value = await completed(name, id, 'cancelled', 0, before);
    assert.equal(value.execution.requests.length, stage === 'prepared' ? 1 : 0);
    if (stage === 'prepared') assert.equal(value.execution.requests[0].error.externalResult, 'not_sent');
  }
  for (const active of [false, true]) {
    const name = active ? 'active-transport-cancel' : 'dispatched-cancel-late', id = await seed(name), before = model.requests.length;
    model.hold(); const first = workers.launch('execute', id); await model.received(before + 1);
    await workers.run('cancel', id); const terminal = await stored(id);
    if (active) first.child.send('abort'); else model.release();
    await first.done(); model.release(); model.valid();
    const value = await completed(name, id, 'cancelled', 1, before);
    assert.deepEqual(value.execution, terminal.execution);
    assert.equal(value.execution.continuationBlockedReason, 'cancelled');
  }
  {
    const name = 'duplicate-settlement', id = await seed(name), before = model.requests.length;
    await workers.run('execute', id); const value = await completed(name, id, 'succeeded', 1, before);
    const request = value.execution.requests[0], previous = JSON.stringify(value.execution);
    for (let index = 0; index < 2; index += 1) {
      const repeated = await runtime.state.completeAndSettle({ runId: id,
        executionAttempt: value.run.executionAttempt, requestId: request.requestId,
        revision: request.usageRevisions[0], outcome: request.outcome, result: value.run.result });
      assert.equal(repeated.applied, false); assert.equal(repeated.idempotent, true);
    }
    assert.equal(JSON.stringify((await stored(id)).execution), previous);
  }
  return { outcomes, rows, controlledRequests: model.requests.length,
    frozenInputSha256: createHash('sha256').update(JSON.stringify([...fingerprints])).digest('hex') };
}
