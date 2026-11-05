import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseLiveExperimentArgs } from './research-live-experiment-args.mjs';
import { readRateLimitContinuation } from './research-live-experiment-continuation.mjs';
import { verifyFirstRateLimitContinuation } from '../apps/server/dist/src/ai/research-live-experiment-continuation.js';
import { verifyTerminalContinuation } from '../apps/server/dist/src/ai/research-live-experiment-terminal.js';
import { readTerminalExperiment } from './research-live-experiment-terminal.mjs';
import { readCrossProtocolHistory } from './research-live-experiment-history-input.mjs';
import { assertCurrentExperimentBudget } from './research-live-experiment-supplemental.mjs';
import { assertExperimentAuthorization } from './research-live-experiment-authorization.mjs';
import { createLiveExperimentTransport } from './research-live-experiment-transport.mjs';
import { createLiveFailureConfirmer } from './research-live-experiment-failure-confirmation.mjs';
import { liveExperimentImplementationHashes } from './research-live-experiment-seal.mjs';
import {
  saveExperimentCheckpoint,
  detachExperimentWorker,
  readInterruptedExperiment,
} from './research-live-experiment-checkpoint.mjs';
import {
  verifyLiveExperimentResume,
  verifyFreshLiveExperimentBudget,
} from '../apps/server/dist/src/ai/research-live-experiment-resume.js';
import { AiSdkGenerationAdapter } from '../apps/server/dist/src/ai/ai-sdk-generation.adapter.js';
import { experimentFingerprint } from '../apps/server/dist/src/ai/research-experiment-protocol.js';
import {
  qualifyLiveExperiment,
  matchesLiveExperimentModel,
  FIVE_CASE_SCREENING_CASE_IDS,
  CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS,
} from '../apps/server/dist/src/ai/research-live-experiment-protocol.js';
import { runLiveResearchExperiment } from '../apps/server/dist/src/ai/research-live-experiment-driver.js';
import {
  readLiveExperimentTarget,
  publicLiveExperimentTarget,
} from './research-live-experiment-target.mjs';
import {
  freezeOpenRouterExperimentModel,
  openRouterFreeModel,
} from './research-live-experiment-openrouter.mjs';

const args = process.argv.slice(2);
const {
  output,
  providerId,
  selectedModel,
  resumeArgument,
  historyArgument,
  continuationArgument,
  terminalArgument,
  continueConfirmedSchemaFailures,
  iterate,
} = parseLiveExperimentArgs(args);
let failurePolicy = 'stop_all_new_failures';
if (iterate) failurePolicy = 'record_and_continue';
else if (continueConfirmedSchemaFailures) failurePolicy = 'continue_confirmed_schema_failures_v1';
const checkpointPath = resolve('.recovery-artifacts/research-live-experiment-current.json');
const checkpoint = existsSync(checkpointPath)
  ? JSON.parse(readFileSync(checkpointPath, 'utf8'))
  : null;
if (!output.startsWith(resolve('.recovery-artifacts') + '/'))
  throw new Error('实验产物必须保存于本项目忽略目录');
mkdirSync(output, { recursive: true, mode: 0o700 });
if (
  existsSync(join(output, 'progress.json')) ||
  existsSync(join(output, 'result.json')) ||
  existsSync(join(output, 'run-lock.json'))
)
  throw new Error('该实验目录已有派发记录，保留原审计并先核对剩余预算');
const save = (name, value) => saveExperimentCheckpoint(output, name, value);
if (args.includes('--background')) {
  const worker = detachExperimentWorker(
    fileURLToPath(import.meta.url),
    args.filter((value) => value !== '--background'),
    output,
  );
  process.stdout.write(JSON.stringify({ started: true, pid: worker.pid, output }) + '\n');
  process.exit(0);
}
if (args.includes('--execute')) {
  const fd = openSync(join(output, 'run-lock.json'), 'wx', 0o600);
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  closeSync(fd);
}
const casesFile = 'apps/server/test/fixtures/research-stage-benchmark-v1.json';
const evaluationFile = 'apps/server/test/fixtures/research-stage-evaluation-v1.json';
const benchmark = JSON.parse(readFileSync(casesFile, 'utf8'));
const evaluation = JSON.parse(readFileSync(evaluationFile, 'utf8'));
const requestOptionsModel =
  selectedModel ?? (providerId === 'openrouter' ? openRouterFreeModel : undefined);
const source = readLiveExperimentTarget(
  args.includes('--execute') || providerId === 'openrouter',
  providerId,
  requestOptionsModel,
);
const before = publicLiveExperimentTarget(source);
const openRouter =
  providerId === 'openrouter' ? await freezeOpenRouterExperimentModel(source, selectedModel) : null;
if (openRouter) save('openrouter-model.json', openRouter);
let version = 'research-live-experiment-v2';
let authorizedCalls = null;
let caseIds = null;
if (openRouter) {
  version = 'research-live-experiment-v3';
  authorizedCalls = 50;
  caseIds = openRouter.caseIds;
} else if (selectedModel) {
  if (selectedModel !== source.model) throw new Error('Cloudflare实际配置型号不符');
  version = iterate ? 'research-live-experiment-v5' : 'research-live-experiment-v4';
  authorizedCalls = 68;
  caseIds = FIVE_CASE_SCREENING_CASE_IDS;
}
const protocol = {
  version,
  transport: 'stream',
  model: openRouter?.model ?? {
    providerId: 'cloudflare',
    id: source.model,
    revision: source.revision,
  },
  pricing: openRouter?.pricing ?? source.pricing,
  requestOptions: source.requestOptions,
  budget: {
    maxCost: '5',
    currency: 'USD',
    authorizedCalls,
    maxInputTokensPerArm: iterate ? 3 * CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS : 100000,
    maxOutputTokensPerArm: iterate ? 3 * CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS : 6000,
    maxDurationMsPerArm: 600000,
    ...(iterate
      ? { outputTokenLimit: 'upstream', modelContextTokens: CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS }
      : {}),
  },
  benchmarkFingerprint: experimentFingerprint(benchmark),
  evaluationFingerprint: experimentFingerprint(evaluation),
  ...(caseIds ? { caseIds } : {}),
  ...(iterate ? { failurePolicy, reasoningEffort: 'low' } : {}),
};
qualifyLiveExperiment(protocol, benchmark, evaluation);
if (continueConfirmedSchemaFailures && !protocol.model.id.endsWith(':free'))
  throw new Error('已确认Schema失败策略仅允许固定免费型号');
let recovered = null;
if (terminalArgument)
  recovered = readTerminalExperiment(terminalArgument.slice(20), protocol, experimentFingerprint, {
    benchmarkSha256: createHash('sha256').update(readFileSync(casesFile)).digest('hex'),
    evaluationSha256: createHash('sha256').update(readFileSync(evaluationFile)).digest('hex'),
    target: before,
    supplementalReferences: checkpoint?.supplementalRequestLedger ?? [],
  });
else if (continuationArgument)
  recovered = readRateLimitContinuation(
    continuationArgument.slice(11),
    protocol,
    experimentFingerprint,
    {
      benchmarkSha256: createHash('sha256').update(readFileSync(casesFile)).digest('hex'),
      evaluationSha256: createHash('sha256').update(readFileSync(evaluationFile)).digest('hex'),
      target: before,
    },
  );
else if (resumeArgument)
  recovered = readInterruptedExperiment(resumeArgument.slice(9), benchmark, experimentFingerprint);
if (recovered)
  assert.deepEqual(
    recovered.sealedProtocol,
    protocol,
    '模型/费率/固定集/评价/预算必须与原实验一致',
  );
let resumeProof;
if (recovered?.continuation?.kind)
  resumeProof = verifyTerminalContinuation(protocol, benchmark, evaluation, recovered.continuation);
else if (recovered?.continuation)
  resumeProof = verifyFirstRateLimitContinuation(protocol, recovered.continuation);
else resumeProof = verifyLiveExperimentResume(protocol, benchmark, evaluation, recovered?.resume);
const billingHistory = historyArgument
  ? readCrossProtocolHistory(
      historyArgument.slice(10),
      protocol,
      experimentFingerprint,
      checkpoint?.supplementalRequestLedger ?? [],
    )
  : null;
const historySource = recovered?.historicalBudgetFrom ?? billingHistory?.sourceProof ?? null;
const initialBudget = billingHistory
  ? verifyFreshLiveExperimentBudget(
      protocol,
      billingHistory.history,
      billingHistory.supplementalBudget,
    ).initial
  : resumeProof.initial;
const supplementalBudgetFrom =
  recovered?.supplementalBudgetFrom ?? billingHistory?.supplementalBudgetFrom ?? [];
const priorRequests = recovered?.priorRequests ?? initialBudget.requests;
if (checkpoint) assertCurrentExperimentBudget(initialBudget, checkpoint);
else if (initialBudget.requests !== 0) throw new Error('接续缺少当前累计账本');
assertExperimentAuthorization(
  protocol,
  initialBudget,
  checkpoint,
  recovered?.sourceProof ?? null,
  historySource,
);
const implementation = liveExperimentImplementationHashes();
save('sealed-inputs.json', {
  protocol,
  benchmarkSha256: createHash('sha256').update(readFileSync(casesFile)).digest('hex'),
  evaluationSha256: createHash('sha256').update(readFileSync(evaluationFile)).digest('hex'),
  implementation,
  target: before,
  resumedFrom: recovered?.sourceProof ?? null,
  initialBudget,
  historicalBudgetFrom: historySource,
  supplementalBudgetFrom,
  failurePolicy,
});
if (!args.includes('--execute')) {
  source.apiKey = '';
  process.stdout.write(
    JSON.stringify({
      preflight: true,
      cases: caseIds?.length ?? 20,
      reusedArms: resumeProof.completed.size,
      initialBudget,
      modelRequests: 0,
    }) + '\n',
  );
} else {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let wireRequests = 0;
  const arms = recovered?.retainedArms?.slice() ?? recovered?.resume?.completedArms.slice() ?? [];
  const requests = new Map();
  const adapter = new AiSdkGenerationAdapter();
  const transport = createLiveExperimentTransport({
    providerId,
    baseURL: source.baseURL,
    isFree: Boolean(openRouter?.model.id.endsWith(':free')),
    save,
    onDispatch: () => {
      wireRequests++;
      save('progress.json', {
        completedArms: arms.length,
        wireRequests,
        priorRequests,
        at: new Date().toISOString(),
      });
    },
  });
  const confirmSchemaFailure = continueConfirmedSchemaFailures
    ? createLiveFailureConfirmer({
        getCredential: () => source.apiKey,
        identityForRequest: transport.identityForRequest,
        isModelQualified: (model) => matchesLiveExperimentModel(protocol, model),
        save,
        signal: controller.signal,
      })
    : undefined;
  const proof = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    protocol,
    implementation,
    before,
    wireRequests: 0,
    failurePolicy,
  };
  try {
    save('started.json', { ...proof, resumedFrom: recovered?.sourceProof ?? null });
    save('arms.json', arms);
    const report = await runLiveResearchExperiment(
      protocol,
      benchmark,
      evaluation,
      {
        baseURL: source.baseURL,
        apiKey: source.apiKey,
        signal: controller.signal,
        history: billingHistory?.history,
        supplementalBudget: billingHistory?.supplementalBudget,
        confirmSchemaFailure,
        generate: (request) =>
          adapter.generate({
            ...request,
            httpClient: transport.forRequest(request.requestId),
          }),
        onRequest: (entry) => {
          requests.set(entry.request.requestId, entry);
          save('request-journal.json', [...requests.values()]);
        },
        onArm: (entry) => {
          arms.push(entry);
          save('arms.json', arms);
          process.stdout.write(
            JSON.stringify({
              caseId: entry.caseId,
              arm: entry.arm,
              status: entry.result.status,
              reason: entry.result.reason,
              durationMs: entry.result.durationMs,
              grade: entry.result.grade,
              wireRequests,
            }) + '\n',
          );
        },
      },
      recovered?.resume,
      recovered?.continuation,
    );
    proof.report = report;
    assert.equal(
      report.actualModelRequests - report.reusedRequests,
      wireRequests,
      '传输与审计请求数不一致',
    );
  } catch (error) {
    proof.error = { name: error?.name ?? 'Error', code: 'experiment_incomplete' };
    process.stderr.write('实验未完整结束；仅保存已发生的脱敏审计，不自动重试。\n');
    process.exitCode = 1;
  } finally {
    source.apiKey = '';
    proof.wireRequests = wireRequests;
    proof.realRequestsTotal = wireRequests + priorRequests;
    proof.historicalBudgetFrom = historySource;
    proof.resumedFrom = recovered?.sourceProof ?? null;
    proof.supplementalBudgetFrom = supplementalBudgetFrom;
    proof.providerGenerations = transport.providerGenerations();
    proof.requestCountMeaning = 'local_post_attempts';
    try {
      proof.after = publicLiveExperimentTarget(
        readLiveExperimentTarget(false, providerId, requestOptionsModel),
      );
      proof.protectedUnchanged = JSON.stringify(before) === JSON.stringify(proof.after);
    } catch {
      proof.protectionCheckError = 'target_read_unavailable';
      proof.protectedUnchanged = false;
    }
    proof.completedAt = new Date().toISOString();
    proof.allCasesAttempted = proof.report?.allCasesAttempted === true;
    save('result.json', proof);
    if (!proof.protectedUnchanged || !proof.allCasesAttempted) process.exitCode = 1;
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    process.stdout.write(
      JSON.stringify({
        allCasesAttempted: proof.allCasesAttempted,
        protectedUnchanged: proof.protectedUnchanged,
        wireRequests,
        realRequestsTotal: proof.realRequestsTotal,
        evaluation: proof.report?.evaluation,
        budget: proof.report?.budget,
      }) + '\n',
    );
  }
}
