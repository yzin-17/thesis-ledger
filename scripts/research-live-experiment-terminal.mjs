import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { readExperimentHistory } from './research-live-experiment-checkpoint.mjs';
import { readFreeProbeLedger } from './research-live-experiment-supplemental.mjs';

const require = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { Prisma } = require('@prisma/client');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function readTerminalExperiment(directory, protocol, fingerprint, inputs) {
  const visited = new Set(),
    journals = new Map(),
    statuses = new Map();
  const read = (location) => {
    const source = resolve(location);
    if (
      !source.startsWith(resolve('.recovery-artifacts') + '/') ||
      visited.has(source) ||
      visited.size >= 10
    )
      throw new Error('终态来源越界、循环或过深');
    visited.add(source);
    const hashes = {};
    const load = (name) => {
      const bytes = readFileSync(join(source, name));
      hashes[name] = hash(bytes);
      return JSON.parse(bytes);
    };
    const result = load('result.json'),
      sealed = load('sealed-inputs.json'),
      arms = load('arms.json');
    const journal = load('request-journal.json'),
      http = load('http-status.json');
    if (
      result.protectedUnchanged !== true ||
      !Number.isFinite(Date.parse(result.completedAt)) ||
      !result.report ||
      result.report.priorUnknownRequests?.length !== 0
    )
      throw new Error('多组接续缺少完整保护终态');
    assert.deepEqual(sealed.protocol, protocol);
    assert.deepEqual(result.protocol, protocol);
    assert.equal(result.report.protocolFingerprint, fingerprint(protocol));
    assert.equal(result.report.benchmarkFingerprint, protocol.benchmarkFingerprint);
    assert.equal(result.report.evaluationFingerprint, protocol.evaluationFingerprint);
    assert.equal(sealed.benchmarkSha256, inputs.benchmarkSha256);
    assert.equal(sealed.evaluationSha256, inputs.evaluationSha256);
    assert.deepEqual(result.before, result.after);
    assert.deepEqual(sealed.target, result.before);
    if (
      sealed.initialBudget.requests !== result.realRequestsTotal - result.wireRequests ||
      !new Prisma.Decimal(sealed.initialBudget.amount).eq(result.report.budget.committed) ||
      !new Prisma.Decimal(sealed.initialBudget.reservedUnknown).eq(
        result.report.budget.reservedUnknown,
      )
    )
      throw new Error('免费终态与原累计预算起点不符');
    if (result.resumedFrom) {
      const parent = read(result.resumedFrom.directory);
      assert.deepEqual(parent.sourceProof.hashes, result.resumedFrom.hashes, '接续来源摘要漂移');
    }
    if (journal.length !== result.wireRequests || http.length !== result.wireRequests)
      throw new Error('本轮传输与审计数量不符');
    for (const entry of journal) {
      const id = entry.request.requestId;
      if (
        journals.has(id) ||
        entry.phase !== 'settled' ||
        !['single', 'staged'].includes(entry.arm)
      )
        throw new Error('本轮请求重复或缺少最终审计');
      journals.set(id, entry);
    }
    for (const status of http) {
      if (statuses.has(status.requestId) || !journals.has(status.requestId))
        throw new Error('HTTP回执重复或缺请求');
      statuses.set(status.requestId, status);
    }
    const expected = [];
    let zeroSeen = false;
    for (const [index, entry] of result.report.cases.entries()) {
      assert.equal(entry.caseId, protocol.caseIds[index]);
      for (const arm of index % 2 === 0 ? ['single', 'staged'] : ['staged', 'single']) {
        const value = entry[arm];
        expected.push({ caseId: entry.caseId, arm, result: value });
        if (!value.requests.length) {
          zeroSeen = true;
          continue;
        }
        if (zeroSeen) throw new Error('原执行顺序出现派发空洞');
        for (const request of value.requests) {
          const audited = journals.get(request.requestId);
          assert.equal(audited?.caseId, entry.caseId);
          assert.equal(audited?.arm, arm);
          assert.deepEqual(audited.request, request);
          if (!statuses.has(request.requestId)) throw new Error('缺少对应HTTP回执');
          const expectedStatus = value.reason === 'provider_rejected' ? 429 : 200;
          if (statuses.get(request.requestId).status !== expectedStatus)
            throw new Error('HTTP状态与所保留的组终态不符');
        }
      }
    }
    assert.deepEqual(arms, expected, '保留组与终态报告不符');
    const count = expected.reduce((sum, entry) => sum + entry.result.requests.length, 0);
    if (
      count !== result.report.actualModelRequests ||
      count - result.report.reusedRequests !== result.wireRequests
    )
      throw new Error('复用与新增请求数不符');
    return {
      result,
      retainedArms: expected.filter((entry) => entry.result.requests.length > 0),
      sourceProof: { directory: source, hashes },
    };
  };
  const value = read(directory),
    result = value.result;
  if (!Number.isInteger(result.pid) || result.pid <= 0) throw new Error('原工作进程身份缺失');
  try {
    process.kill(result.pid, 0);
    throw new Error('原实验进程仍存在');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  assert.deepEqual(inputs.target, result.after, '当前正常目标变化');
  const parent = readExperimentHistory(
    result.historicalBudgetFrom.directory,
    protocol,
    fingerprint,
  );
  assert.deepEqual(parent.sourceProof, result.historicalBudgetFrom);
  assert.deepEqual(parent.history, result.report.historicalBudget);
  const own = readFreeProbeLedger(result.supplementalBudgetFrom ?? []);
  if (result.report.supplementalBudget)
    assert.deepEqual(own.budget, result.report.supplementalBudget);
  else if (own.requests) throw new Error('原补充预算未进入报告');
  const references = new Map();
  for (const list of [result.supplementalBudgetFrom ?? [], inputs.supplementalReferences ?? []]) {
    const paths = new Set();
    for (const reference of list) {
      const path = resolve(reference.directory);
      if (paths.has(path)) throw new Error('补充来源重复');
      paths.add(path);
      const prior = references.get(path);
      if (prior && prior.resultSHA256 !== reference.resultSHA256)
        throw new Error('补充来源摘要冲突');
      references.set(path, reference);
    }
  }
  const all = readFreeProbeLedger([...references.values()]);
  const covered = new Set(parent.supplementalRequestIds);
  const pending = all.budget.entries.filter((entry) => !covered.has(entry.requestId));
  const supplementalBudget = { ...all.budget, entries: pending };
  const supplementalBudgetFrom = all.sourceProof.filter((proof) =>
    pending.some((entry) => entry.resultSHA256 === proof.resultSHA256),
  );
  const localIds = new Set();
  let knownCost = new Prisma.Decimal(parent.history.amount).minus(parent.history.reservedUnknown);
  for (const entry of value.retainedArms)
    for (const request of entry.result.requests) {
      if (
        localIds.has(request.requestId) ||
        parent.requestIds.includes(request.requestId) ||
        all.budget.entries.some((item) => item.requestId === request.requestId)
      )
        throw new Error('实验请求与历史/补充请求重复');
      localIds.add(request.requestId);
      const fact = request.facts.at(-1);
      if (fact.cost.status !== 'unknown') {
        if (fact.cost.currency !== 'USD' || fact.cost.amount === null)
          throw new Error('终态费用无效');
        knownCost = knownCost.plus(fact.cost.amount);
      }
    }
  if (
    result.realRequestsTotal !== parent.history.requests + localIds.size + own.requests ||
    result.report.budget.requests !== result.realRequestsTotal ||
    !knownCost.eq(result.report.budget.spent) ||
    !new Prisma.Decimal(parent.history.reservedUnknown).eq(result.report.budget.reservedUnknown)
  )
    throw new Error('终态费用与累计尝试无法对账');
  return {
    sealedProtocol: protocol,
    retainedArms: value.retainedArms,
    continuation: {
      kind: 'terminal-groups-v1',
      sourceProtocolFingerprint: fingerprint(protocol),
      retainedArms: value.retainedArms,
      historicalBudget: parent.history,
      sourceRequests: result.realRequestsTotal,
      sourceSupplementalRequests: own.requests,
      supplementalBudget,
      retainedStageOutputs: collectRetainedStageOutputs(value.retainedArms, journals, fingerprint),
    },
    priorRequests: parent.history.requests + localIds.size + pending.length,
    historicalBudgetFrom: parent.sourceProof,
    supplementalBudgetFrom,
    sourceProof: value.sourceProof,
  };
}

export function collectRetainedStageOutputs(retainedArms, journals, fingerprint) {
  const outputs = [];
  for (const entry of retainedArms) {
    if (entry.result.status !== 'failed') continue;
    for (const request of entry.result.requests.slice(0, -1)) {
      const output = journals.get(request.requestId)?.output;
      if (!output || fingerprint(output) !== request.facts.at(-1)?.outputFingerprint)
        throw new Error('保留组中间输出缺失或指纹不符');
      outputs.push({ requestId: request.requestId, output });
    }
  }
  return outputs;
}
