import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, existsSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AiSdkGenerationAdapter } from '../apps/server/dist/src/ai/ai-sdk-generation.adapter.js';
import { runLiveResearchExperiment } from '../apps/server/dist/src/ai/research-live-experiment-driver.js';
import {
  qualifyLiveExperiment,
  FIVE_CASE_SCREENING_CASE_IDS,
} from '../apps/server/dist/src/ai/research-live-experiment-protocol.js';
import { experimentFingerprint } from '../apps/server/dist/src/ai/research-experiment-protocol.js';
import { createAiTimeoutPolicy } from '../apps/server/dist/src/ai/timeout/ai-timeout-policy.js';
import { verifyFreshLiveExperimentBudget } from '../apps/server/dist/src/ai/research-live-experiment-resume.js';
import { readCrossProtocolHistory } from './research-live-experiment-history-input.mjs';
import {
  saveExperimentCheckpoint,
  detachExperimentWorker,
} from './research-live-experiment-checkpoint.mjs';
import { liveExperimentImplementationHashes } from './research-live-experiment-seal.mjs';
import {
  readLMStudioExperimentInput,
  mergeLMStudioProbeHistory,
  mergePriorLocalRuns,
  sha256,
  readJSON,
} from './research-lmstudio-experiment-input.mjs';

const args = process.argv.slice(2);
const value = (key) => args.find((arg) => arg.startsWith('--' + key + '='))?.slice(key.length + 3);
assert(
  args.every(
    (arg) =>
      ['--execute', '--background', '--contract-hints'].includes(arg) ||
      ['output', 'configuration', 'history', 'probes', 'authorization'].some((key) =>
        arg.startsWith('--' + key + '='),
      ),
  ),
);
const output = resolve(value('output'));
assert(output.startsWith(resolve('.recovery-artifacts') + '/'));
mkdirSync(output, { recursive: true, mode: 0o700 });
const save = (name, data) => saveExperimentCheckpoint(output, name, data);
if (args.includes('--background')) {
  assert(args.includes('--execute'));
  const worker = detachExperimentWorker(
    fileURLToPath(import.meta.url),
    args.filter((arg) => arg !== '--background'),
    output,
  );
  console.log(JSON.stringify({ started: true, pid: worker.pid, output }));
  process.exit(0);
}
if (args.includes('--execute')) {
  const fd = openSync(join(output, 'run-lock.json'), 'wx', 0o600);
  writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  closeSync(fd);
}
const input = await readLMStudioExperimentInput(value('configuration'));
const authorization = readJSON(value('authorization'));
assert.equal(authorization.providerId, 'lmstudio');
assert.equal(authorization.baseURL, input.provider.baseUrl);
assert.equal(authorization.model, input.provider.models[0]);
assert.equal(authorization.authorizedCalls, null);
const benchmark = readJSON('apps/server/test/fixtures/research-stage-benchmark-v1.json');
const evaluation = readJSON('apps/server/test/fixtures/research-stage-evaluation-v1.json');
const protocol = {
  version: 'research-live-experiment-v6',
  executionId: randomUUID(),
  transport: 'stream',
  model: {
    providerId: 'lmstudio',
    id: input.provider.models[0],
    canonicalId: input.actualModel.key,
    revision: input.provider.updatedAt + ':' + input.configurationSource.sha256.slice(0, 32),
  },
  localTarget: {
    baseURL: input.provider.baseUrl,
    authMode: 'none',
    quantization: input.actualModel.quantization.name,
  },
  requestOptions: input.requestOptions,
  ...(args.includes('--contract-hints') ? { outputContractHints: 'zh-numeric-copy-v1' } : {}),
  generation: input.generation,
  pricing: {
    costPer1kInput: 0,
    costPer1kOutput: 0,
    costCurrency: 'USD',
    pricingVersion: input.pricing.pricingVersion,
  },
  caseIds: [...FIVE_CASE_SCREENING_CASE_IDS],
  failurePolicy: 'record_and_continue',
  budget: {
    maxCost: '5',
    currency: 'USD',
    authorizedCalls: null,
    modelContextTokens: input.modelContextTokens,
    maxInputTokensPerArm: 3 * input.modelContextTokens,
    maxOutputTokensPerArm: 3 * input.modelContextTokens,
    maxDurationMsPerArm: createAiTimeoutPolicy('research').taskBudgetMs,
  },
  benchmarkFingerprint: experimentFingerprint(benchmark),
  evaluationFingerprint: experimentFingerprint(evaluation),
};
qualifyLiveExperiment(protocol, benchmark, evaluation);
const pointerFile = resolve('.recovery-artifacts/research-live-experiment-current.json');
const pointer = readJSON(pointerFile);
if (pointer.workerRunning && pointer.workerPid) {
  let alive = false;
  try {
    process.kill(pointer.workerPid, 0);
    alive = true;
  } catch {
    /* 原进程已退出 */
  }
  assert(!alive, '原模型实验仍在执行');
}
const legacy = readCrossProtocolHistory(
  value('history'),
  protocol,
  experimentFingerprint,
  pointer.supplementalRequestLedger ?? [],
);
assert(!legacy.supplementalBudget, '外部补充账本必须已纳入旧实验终态');
const probes = mergeLMStudioProbeHistory(legacy, value('probes'), experimentFingerprint);
const history = mergePriorLocalRuns(probes, pointer.localLMStudioRuns ?? [], experimentFingerprint);
if (pointer.providerScope === 'lmstudio')
  assert.equal(pointer.localModelPostAttemptsTotal, history.history.requests);
else assert.equal(pointer.localModelPostAttemptsTotal + 2, history.history.requests);
const initial = verifyFreshLiveExperimentBudget(protocol, history.history).initial;
const implementation = liveExperimentImplementationHashes();
save('sealed-inputs.json', {
  protocol,
  input,
  authorization,
  implementation,
  initialBudget: initial,
  historicalBudgetFrom: history.sourceProof,
});
if (!args.includes('--execute')) {
  console.log(
    JSON.stringify({
      preflight: true,
      modelRequests: 0,
      cases: 5,
      initialBudget: initial,
      authorizedCalls: null,
    }),
  );
  process.exit(0);
}
const controller = new AbortController();
const cancel = () => controller.abort();
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
const adapter = new AiSdkGenerationAdapter();
const requests = new Map(),
  arms = [],
  http = [],
  wire = [];
const captures = [];
let wireRequests = 0;
const proof = {
  protocol,
  implementation,
  historicalBudgetFrom: history.sourceProof,
  startedAt: new Date().toISOString(),
  configurationSource: input.configurationSource,
};
const setPointer = (running, report) => {
  const total = initial.requests + wireRequests;
  const unknown = [...requests.values()].filter(
    (entry) => entry.request.facts.at(-1)?.cost?.status === 'unknown',
  ).length;
  const next = {
    ...pointer,
    artifactRoot: output,
    providerScope: 'lmstudio',
    workerPid: process.pid,
    workerRunning: running,
    localLMStudioUnlimitedAuthorization: authorization,
    authorizedModelRequestsTotal: null,
    remainingModelRequests: null,
    conservativeRemainingAttemptSlots: null,
    realRequestsTotal: total,
    localModelPostAttemptsTotal: total,
    usageUnknownRequests: history.history.unknownRequests + unknown,
    usageKnownRequests: total - history.history.unknownRequests - unknown,
    localLMStudioPostAttempts: initial.requests - 68 + wireRequests,
    historicalModelRequests: initial.requests,
    plannedNewRequests: 20,
    screeningModelPostAttempts: wireRequests,
    screeningGroupsComplete: arms.filter((entry) => entry.result.status === 'complete').length,
    screeningGroupsFailed: arms.filter((entry) => entry.result.status === 'failed').length,
    screeningGroupsBlocked: arms.filter((entry) => entry.result.status === 'blocked').length,
    screeningQualityPairs: report?.evaluation.pairedQualitySamples ?? 0,
    screeningDecision: report?.evaluation.decision ?? null,
    screeningComplete:
      report?.cases.every(
        (entry) => entry.single.status === 'complete' && entry.staged.status === 'complete',
      ) ?? false,
    allGroupsAttempted: report?.allCasesAttempted ?? false,
    nextAction: running
      ? 'LM Studio同五例对照执行中'
      : '核对本地五例输出与效果，保留失败并按证据选择优化',
    conservativeOccupiedUSD: report?.budget.committed ?? initial.amount,
    conservativeUnknownReservedUSD: report?.budget.reservedUnknown ?? initial.reservedUnknown,
    localLMStudioRuns: running
      ? (pointer.localLMStudioRuns ?? [])
      : [...(pointer.localLMStudioRuns ?? []), output],
    legacyExternalArtifactRoot: pointer.legacyExternalArtifactRoot ?? pointer.artifactRoot,
    originalExternalAuthorizedCalls: 68,
    authorizedCostUSD: '5',
  };
  saveExperimentCheckpoint(
    resolve('.recovery-artifacts'),
    'research-live-experiment-current.json',
    next,
  );
};
setPointer(true);
save('started.json', { ...proof, pid: process.pid });
try {
  proof.report = await runLiveResearchExperiment(protocol, benchmark, evaluation, {
    baseURL: input.provider.baseUrl,
    apiKey: '',
    history: history.history,
    signal: controller.signal,
    firstOutputTimeoutMs: input.firstOutputTimeoutMs,
    outputIdleTimeoutMs: input.outputIdleTimeoutMs,
    generate: (request) =>
      adapter.generate({
        ...request,
        httpClient: async (resource, init) => {
          const url = new URL(
            typeof resource === 'string' || resource instanceof URL ? resource : resource.url,
          );
          assert.equal(url.href, input.provider.baseUrl + '/chat/completions');
          assert.equal(init?.method, 'POST');
          const headers = new Headers(init.headers);
          assert(!headers.has('authorization'));
          const body = JSON.parse(String(init.body));
          wireRequests++;
          wire.push({
            requestId: request.requestId,
            model: body.model,
            responseFormat: body.response_format?.type ?? null,
            localOutputLimits: Object.fromEntries(
              ['max_tokens', 'max_completion_tokens', 'max_output_tokens']
                .filter((key) => key in body)
                .map((key) => [key, body[key]]),
            ),
            sentAuthorization: false,
            at: new Date().toISOString(),
          });
          save('wire-request-settings.json', wire);
          setPointer(true);
          const response = await fetch(resource, { ...init, redirect: 'error' });
          http.push({
            requestId: request.requestId,
            status: response.status,
            at: new Date().toISOString(),
          });
          save('http-status.json', http);
          captures.push(
            response
              .clone()
              .text()
              .then((text) => {
                writeFileSync(join(output, 'response-' + request.requestId + '.txt'), text, {
                  mode: 0o600,
                });
              })
              .catch((error) => {
                save('response-capture-' + request.requestId + '.json', {
                  incomplete: true,
                  errorName: error.name,
                });
              }),
          );
          return response;
        },
      }),
    onRequest: (entry) => {
      requests.set(entry.request.requestId, entry);
      save('request-journal.json', [...requests.values()]);
      setPointer(true);
    },
    onArm: (entry) => {
      arms.push(entry);
      save('arms.json', arms);
      console.log(
        JSON.stringify({
          caseId: entry.caseId,
          arm: entry.arm,
          status: entry.result.status,
          reason: entry.result.reason,
          grade: entry.result.grade,
          durationMs: entry.result.durationMs,
          wireRequests,
        }),
      );
    },
  });
  assert.equal(proof.report.actualModelRequests, wireRequests);
} catch (error) {
  proof.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await Promise.allSettled(captures);
  proof.completedAt = new Date().toISOString();
  proof.wireRequests = wireRequests;
  proof.realRequestsTotal = initial.requests + wireRequests;
  proof.configurationSourceUnchanged =
    sha256(readFileSync(input.configurationSource.file)) === input.configurationSource.sha256;
  proof.currentDatabaseRead = false;
  save('result.json', proof);
  setPointer(false, proof.report);
  process.removeListener('SIGINT', cancel);
  process.removeListener('SIGTERM', cancel);
  console.log(
    JSON.stringify({
      complete: proof.report?.allCasesAttempted ?? false,
      wireRequests,
      realRequestsTotal: proof.realRequestsTotal,
      budget: proof.report?.budget,
      evaluation: proof.report?.evaluation,
    }),
  );
}
