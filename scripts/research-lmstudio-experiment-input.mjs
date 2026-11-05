import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';

const load = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { aiModelRequestOptionsSchema } = load('@thesis-ledger/schemas');
export const localBaseURL = 'http://192.168.5.20:6789/v1';
export const localCanonicalModel = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive';
export const localModel = localCanonicalModel + '@q4_k_m';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const readJSON = (file) => JSON.parse(readFileSync(file));
const artifactPath = (path) => {
  const absolute = resolve(path);
  assert(absolute.startsWith(resolve('.recovery-artifacts') + '/'), '只读取本项目实验产物');
  return absolute;
};

export async function readLMStudioExperimentInput(file, httpClient = fetch) {
  const absolute = artifactPath(file);
  const bytes = readFileSync(absolute);
  const saved = JSON.parse(bytes);
  assert.equal(
    sha256(readFileSync(artifactPath(saved.source))),
    saved.sourceSha256,
    '保存回执来源变化',
  );
  const provider = saved.provider;
  assert.equal(provider.name, 'lmstudio');
  assert.equal(provider.baseUrl, localBaseURL);
  assert.equal(provider.authMode, 'none');
  assert.equal(provider.upstreamFormat, 'chat-completions');
  assert.equal(provider.chatImplementation, 'compatible');
  assert.deepEqual(provider.models, [localModel]);
  const original = readJSON(artifactPath(saved.source));
  const sourceProviders =
    original.providers?.response ?? (Array.isArray(original) ? original : [original]);
  const savedProvider = sourceProviders.find((row) => row.name === 'lmstudio');
  assert(savedProvider, '保存来源缺少本地Provider');
  const route = savedProvider.executionRoutes?.find(
    (entry) => entry.model === localModel && entry.contract?.id === 'research',
  );
  assert.equal(route?.adapter, 'openai-compatible-chat', '保存来源缺少研究执行适配器');
  assert(
    ['native_schema', 'json_mode', 'json_validated'].includes(route.mode),
    '保存的研究格式无效',
  );
  const generation = { adapter: route.adapter, mode: route.mode };
  const pricing = provider.modelPricing?.[localModel];
  assert.equal(pricing?.costPer1kInput, 0);
  assert.equal(pricing?.costPer1kOutput, 0);
  assert.equal(pricing?.costCurrency, 'USD');
  const requestOptions = aiModelRequestOptionsSchema.parse(
    provider.modelDefaults?.[localModel]?.requestOptions ?? {},
  );
  const response = await httpClient(new URL('/api/v1/models', localBaseURL), {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(provider.timeoutMs),
  });
  assert.equal(response.status, 200, '本地模型目录不可读取');
  const catalog = await response.json();
  const actual = catalog.models?.find((entry) => entry.key === localCanonicalModel);
  assert.equal(actual?.quantization?.name, 'Q4_K_M', '量化或型号已变化');
  const contextTokens =
    actual.loaded_instances?.[0]?.config?.context_length ?? actual.max_context_length;
  assert(Number.isInteger(contextTokens) && contextTokens > 0 && contextTokens <= 262144);
  return {
    provider,
    generation,
    firstOutputTimeoutMs:
      route.firstOutputTimeoutSource === 'system'
        ? (provider.firstOutputTimeoutMs ?? undefined)
        : (route.firstOutputTimeoutMs ?? provider.firstOutputTimeoutMs ?? undefined),
    outputIdleTimeoutMs:
      route.outputIdleTimeoutSource === 'system'
        ? (provider.outputIdleTimeoutMs ?? undefined)
        : (route.outputIdleTimeoutMs ?? provider.outputIdleTimeoutMs ?? undefined),
    requestOptions,
    pricing,
    actualModel: actual,
    modelContextTokens: contextTokens,
    configurationSource: {
      file: absolute,
      sha256: sha256(bytes),
      providerSource: saved.source,
      providerSourceSha256: saved.sourceSha256,
      currentDatabaseRead: false,
    },
  };
}

/** 两次连接尝试进入总计量；未知用量仍未知，本地零费率不释放历史预留。 */
export function mergeLMStudioProbeHistory(base, probeDirectory, fingerprint) {
  const directory = artifactPath(probeDirectory);
  const summary = readJSON(join(directory, 'summary.json'));
  const ids = new Set(base.requestIds);
  const history = structuredClone(base.history);
  const proofs = [];
  let unknown = 0;
  assert.equal(summary.priorOriginalExperimentPostAttempts, history.requests);
  assert.equal(summary.modelPostAttemptsAdded, 2);
  for (const attempt of ['attempt-1', 'attempt-2']) {
    const file = join(directory, attempt, 'probe-result.json');
    const bytes = readFileSync(file);
    const result = JSON.parse(bytes);
    const journal = readJSON(join(directory, attempt, 'request-journal.json'));
    const wire = readJSON(join(directory, attempt, 'wire-request-settings.json'));
    assert.equal(result.providerId, 'lmstudio');
    assert.equal(result.baseURL, localBaseURL);
    assert.equal(result.requestedModel, localModel);
    assert.equal(result.pricing.costPer1kInput, 0);
    assert.equal(result.pricing.costPer1kOutput, 0);
    assert.equal(result.pricing.costCurrency, 'USD');
    assert.equal(result.previousExperimentAttempts, base.history.requests);
    assert.equal(result.originalExperimentPointerUnchanged, true);
    assert.equal(result.modelRequestsAdded, 1);
    assert.equal(journal.length, 1);
    assert.equal(journal[0].method, 'POST');
    assert.equal(journal[0].url, localBaseURL + '/chat/completions');
    assert.equal(wire.sentAuthorization, false);
    assert.equal(ids.has(journal[0].requestId), false, '连接请求重复');
    ids.add(journal[0].requestId);
    if (result.status === 'passed') {
      assert.equal(result.result.usage.status, 'reported');
      assert.equal(result.estimatedCostUSD, 0);
      assert.equal(result.result.finishReason, 'stop');
    } else {
      assert.equal(result.error.fact.externalResult, 'unknown');
      unknown++;
    }
    proofs.push({ file, sha256: sha256(bytes), requestId: journal[0].requestId });
  }
  history.requests += proofs.length;
  history.unknownRequests += unknown;
  if (unknown)
    history.unknownReservations.push({
      protocolFingerprint: fingerprint({ version: 'lmstudio-probe-history-v1', proofs }),
      currency: 'USD',
      maxInputTokens: 262144,
      maxOutputTokens: 262144,
      costPer1kInput: 0,
      costPer1kOutput: 0,
      unknownRequests: unknown,
    });
  assert.equal(summary.allLocalModelPostAttemptsIncludingNewProbe, history.requests);
  return {
    history,
    requestIds: [...ids],
    sourceProof: { kind: 'lmstudio-probe-history-v1', legacy: base.sourceProof, probes: proofs },
  };
}

export function mergePriorLocalRuns(base, directories, fingerprint) {
  const history = structuredClone(base.history);
  const ids = new Set(base.requestIds);
  const priorRuns = [];
  for (const path of directories) {
    const directory = artifactPath(path);
    const file = join(directory, 'result.json');
    const bytes = readFileSync(file);
    const result = JSON.parse(bytes);
    assert.equal(result.protocol.version, 'research-live-experiment-v6');
    assert.equal(result.protocol.model.id, localModel);
    assert.equal(result.protocol.pricing.costPer1kInput, 0);
    assert.equal(result.protocol.pricing.costPer1kOutput, 0);
    assert.deepEqual(result.report.historicalBudget, history);
    let count = 0,
      unknown = 0;
    for (const entry of result.report.cases)
      for (const arm of [entry.single, entry.staged])
        for (const request of arm.requests) {
          assert.equal(ids.has(request.requestId), false, '本地历史请求重复');
          ids.add(request.requestId);
          count++;
          const cost = request.facts.at(-1).cost;
          if (cost.status === 'unknown') unknown++;
          else assert.equal(Number(cost.amount), 0);
        }
    assert.equal(count, result.wireRequests);
    assert.equal(result.realRequestsTotal, history.requests + count);
    assert.equal(result.report.budget.committed, history.amount);
    assert.equal(result.report.budget.reservedUnknown, history.reservedUnknown);
    history.requests += count;
    history.unknownRequests += unknown;
    if (unknown)
      history.unknownReservations.push({
        protocolFingerprint: fingerprint(result.protocol),
        currency: 'USD',
        maxInputTokens: result.protocol.budget.modelContextTokens,
        maxOutputTokens: result.protocol.budget.modelContextTokens,
        costPer1kInput: 0,
        costPer1kOutput: 0,
        unknownRequests: unknown,
      });
    history.sourceProtocolFingerprint = fingerprint(result.protocol);
    history.sourceReportSha256 = sha256(bytes);
    history.model = result.protocol.model;
    history.pricingFingerprint = fingerprint(result.protocol.pricing);
    priorRuns.push({ directory, sha256: sha256(bytes) });
  }
  return { history, requestIds: [...ids], sourceProof: { ...base.sourceProof, priorRuns } };
}
