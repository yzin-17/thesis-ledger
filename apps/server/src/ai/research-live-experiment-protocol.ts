import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  aiFrozenResearchV2Schema,
  aiModelRequestOptionsSchema,
  researchEvidenceBindingV2Schema,
} from '@thesis-ledger/schemas';
import { verifyAiFrozenResearchV2 } from './ai-research-frozen-integrity-v2.js';
import { experimentFingerprint } from './research-experiment-protocol.js';

export const LIVE_EXPERIMENT_MODEL = '@cf/qwen/qwen3.8-27b';
export const CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS = 262144;
export const LMSTUDIO_EXPERIMENT_BASE_URL = 'http://192.168.5.20:6789/v1';
export const LMSTUDIO_EXPERIMENT_MODEL = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m';
export const LMSTUDIO_EXPERIMENT_CANONICAL_MODEL = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive';
export const OPENROUTER_EXPERIMENT_FREE_MODEL = 'google/gemma-4-26b-a4b-it:free';
export const OPENROUTER_EXPERIMENT_ALTERNATE_FREE_MODEL = 'xingchen-agi/xing4.0-29b-a4b:free';
export const OPENROUTER_EXPERIMENT_PAID_MODEL = 'qwen/qwen3.8-27b';
export const OPENROUTER_EXPERIMENT_NEMOTRON_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
export const FIVE_CASE_SCREENING_CASE_IDS = [
  'single-price',
  'currencies',
  'future-publication',
  'dividend-proposal',
  'prompt-injection',
];
export const NEMOTRON_SCREENING_CASE_IDS = FIVE_CASE_SCREENING_CASE_IDS;
const decimal = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(80);
const benchmarkCase = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  topic: z.string().min(1).max(160),
  frozen: aiFrozenResearchV2Schema,
  bindings: z.array(researchEvidenceBindingV2Schema).min(1).max(20),
  ownedToolCallIds: z.array(z.uuid()).min(1).max(20),
  assumptions: z.strictObject({
    initialCapital: z.literal('10000'),
    currency: z.literal('CNY'),
    start: z.iso.date(),
    end: z.iso.date(),
    frequency: z.literal('daily'),
    priceBasis: z.literal('economic-close'),
    feeBasis: z.literal('same-frozen-net-return-assumptions'),
    economicReturnsAvailable: z.literal(false),
  }),
});
export const liveBenchmarkSchema = z.strictObject({
  version: z.literal('research-stage-benchmark-v1'),
  datasetKind: z.literal('authored-domain-benchmark'),
  provenance: z.literal('人工构造的领域基准，不代表真实行情、账户或收益'),
  cases: z.array(benchmarkCase).length(20),
});
export const liveEvaluationSchema = z.strictObject({
  version: z.literal('research-stage-evaluation-v1'),
  metric: z.literal('fact-and-boundary-coverage-v1'),
  cases: z
    .array(
      z.strictObject({
        caseId: z.string(),
        criteria: z
          .array(
            z.strictObject({
              description: z.string().min(1).max(300),
              concepts: z
                .array(z.array(z.string().min(1).max(100)).min(1).max(15))
                .min(1)
                .max(8),
            }),
          )
          .length(4),
      }),
    )
    .length(20),
});
const protocolFields = {
  transport: z.literal('stream'),
  requestOptions: aiModelRequestOptionsSchema.optional(),
  pricing: z.strictObject({
    costPer1kInput: z.number().finite().nonnegative(),
    costPer1kOutput: z.number().finite().nonnegative(),
    costCurrency: z.literal('USD'),
    pricingVersion: z.string().min(1),
  }),
  budget: z.strictObject({
    maxCost: decimal.refine((value) => new Prisma.Decimal(value).lte('5'), '本次费用不能超过5 USD'),
    currency: z.literal('USD'),
    authorizedCalls: z.null(),
    maxInputTokensPerArm: z.number().int().min(1).max(100000),
    maxOutputTokensPerArm: z.number().int().min(30).max(6000),
    maxDurationMsPerArm: z.number().int().min(6000).max(600000),
  }),
  benchmarkFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  evaluationFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
};
export const liveExperimentSchema = z.discriminatedUnion('version', [
  z.strictObject({
    ...protocolFields,
    version: z.literal('research-live-experiment-v6'),
    executionId: z.uuid(),
    caseIds: z.array(z.string()).length(5),
    failurePolicy: z.literal('record_and_continue'),
    requestOptions: aiModelRequestOptionsSchema,
    outputContractHints: z.literal('zh-numeric-copy-v1').optional(),
    generation: z
      .strictObject({
        adapter: z.literal('openai-compatible-chat'),
        mode: z.enum(['native_schema', 'json_mode', 'json_validated']),
      })
      .optional(),
    pricing: protocolFields.pricing.extend({
      costPer1kInput: z.literal(0),
      costPer1kOutput: z.literal(0),
    }),
    localTarget: z.strictObject({
      baseURL: z.literal(LMSTUDIO_EXPERIMENT_BASE_URL),
      authMode: z.literal('none'),
      quantization: z.literal('Q4_K_M'),
    }),
    budget: protocolFields.budget.extend({
      authorizedCalls: z.null(),
      modelContextTokens: z.number().int().min(1).max(CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS),
      maxInputTokensPerArm: z
        .number()
        .int()
        .min(1)
        .max(3 * CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS),
      maxOutputTokensPerArm: z
        .number()
        .int()
        .min(1)
        .max(3 * CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS),
    }),
    model: z.strictObject({
      providerId: z.literal('lmstudio'),
      id: z.literal(LMSTUDIO_EXPERIMENT_MODEL),
      canonicalId: z.literal(LMSTUDIO_EXPERIMENT_CANONICAL_MODEL),
      revision: z.string().min(1).max(120),
    }),
  }),
  z.strictObject({
    ...protocolFields,
    version: z.literal('research-live-experiment-v5'),
    caseIds: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).length(5),
    failurePolicy: z.literal('record_and_continue'),
    reasoningEffort: z.literal('low'),
    budget: protocolFields.budget.extend({
      authorizedCalls: z.literal(68),
      outputTokenLimit: z.literal('upstream'),
      modelContextTokens: z.literal(CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS),
      maxInputTokensPerArm: z.literal(3 * CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS),
      maxOutputTokensPerArm: z.literal(3 * CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS),
    }),
    model: z.strictObject({
      providerId: z.literal('cloudflare'),
      id: z.literal(LIVE_EXPERIMENT_MODEL),
      revision: z.string().min(1).max(120),
    }),
  }),
  z.strictObject({
    ...protocolFields,
    version: z.literal('research-live-experiment-v4'),
    caseIds: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).length(5),
    budget: protocolFields.budget.extend({ authorizedCalls: z.literal(68) }),
    model: z.strictObject({
      providerId: z.literal('cloudflare'),
      id: z.literal(LIVE_EXPERIMENT_MODEL),
      revision: z.string().min(1).max(120),
    }),
  }),
  z.strictObject({
    ...protocolFields,
    version: z.literal('research-live-experiment-v2'),
    model: z.strictObject({
      providerId: z.literal('cloudflare'),
      id: z.literal(LIVE_EXPERIMENT_MODEL),
      revision: z.string().min(1).max(120),
    }),
  }),
  z.strictObject({
    ...protocolFields,
    version: z.literal('research-live-experiment-v3'),
    caseIds: z
      .array(z.string().regex(/^[a-z0-9-]{1,80}$/))
      .min(5)
      .max(7),
    budget: protocolFields.budget.extend({ authorizedCalls: z.literal(50) }),
    model: z.discriminatedUnion('id', [
      z.strictObject({
        providerId: z.literal('openrouter'),
        id: z.literal(OPENROUTER_EXPERIMENT_FREE_MODEL),
        canonicalId: z.literal('google/gemma-4-26b-a4b-it-20260403'),
        revision: z.string().min(1).max(120),
      }),
      z.strictObject({
        providerId: z.literal('openrouter'),
        id: z.literal(OPENROUTER_EXPERIMENT_PAID_MODEL),
        canonicalId: z.literal('qwen/qwen3.8-27b-20260814'),
        revision: z.string().min(1).max(120),
      }),
      z.strictObject({
        providerId: z.literal('openrouter'),
        id: z.literal(OPENROUTER_EXPERIMENT_ALTERNATE_FREE_MODEL),
        canonicalId: z.literal('xingchen-agi/xing4.0-29b-a4b-20261015'),
        revision: z.string().min(1).max(120),
      }),
      z.strictObject({
        providerId: z.literal('openrouter'),
        id: z.literal(OPENROUTER_EXPERIMENT_NEMOTRON_MODEL),
        canonicalId: z.literal('nvidia/nemotron-3.5-super-vl-20261015'),
        revision: z.string().min(1).max(120),
      }),
    ]),
  }),
]);
export const historyReservationLotSchema = z.strictObject({
  protocolFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  currency: z.literal('USD'),
  maxInputTokens: z.number().int().min(1).max(CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS),
  maxOutputTokens: z.number().int().min(1).max(CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS),
  costPer1kInput: z.number().finite().nonnegative(),
  costPer1kOutput: z.number().finite().nonnegative(),
  unknownRequests: z.number().int().min(1),
});
export type LiveBenchmark = z.infer<typeof liveBenchmarkSchema>;
export type LiveBenchmarkCase = LiveBenchmark['cases'][number];
export type LiveEvaluation = z.infer<typeof liveEvaluationSchema>;
export type LiveExperimentProtocol = z.infer<typeof liveExperimentSchema>;
export interface LiveExperimentHistory {
  sourceProtocolFingerprint: string;
  sourceReportSha256: string;
  model: LiveExperimentProtocol['model'];
  pricingFingerprint: string;
  benchmarkFingerprint: string;
  evaluationFingerprint: string;
  amount: string;
  reservedUnknown: string;
  requests: number;
  unknownRequests: number;
  unknownReservations?: Array<z.infer<typeof historyReservationLotSchema>>;
}

export function matchesLiveExperimentModel(
  protocol: LiveExperimentProtocol,
  actual: string | null,
) {
  if (actual === protocol.model.id) return true;
  if (protocol.version === 'research-live-experiment-v6')
    return actual === protocol.model.canonicalId;
  if (protocol.version !== 'research-live-experiment-v3') return false;
  return (
    actual === protocol.model.canonicalId ||
    actual === protocol.model.canonicalId + ':free' ||
    actual === protocol.model.id.replace(/:free$/, '')
  );
}

export function qualifyLiveExperiment(raw: unknown, rawCases: unknown, rawEvaluation: unknown) {
  const protocol = liveExperimentSchema.parse(raw);
  if (
    protocol.version === 'research-live-experiment-v6' &&
    (protocol.budget.maxInputTokensPerArm !== 3 * protocol.budget.modelContextTokens ||
      protocol.budget.maxOutputTokensPerArm !== 3 * protocol.budget.modelContextTokens)
  )
    throw new Error('本地实验Token核对范围必须来自实际模型上下文');
  if (
    protocol.version === 'research-live-experiment-v3' &&
    protocol.model.id.endsWith(':free') &&
    (protocol.pricing.costPer1kInput !== 0 || protocol.pricing.costPer1kOutput !== 0)
  )
    throw new Error('固定免费型号的目录费率必须为零');
  const benchmark = liveBenchmarkSchema.parse(rawCases);
  const evaluation = liveEvaluationSchema.parse(rawEvaluation);
  verifyLiveScreeningCases(protocol, benchmark);
  if (
    experimentFingerprint(benchmark) !== protocol.benchmarkFingerprint ||
    experimentFingerprint(evaluation) !== protocol.evaluationFingerprint
  )
    throw new Error('固定集或封存评价摘要不一致');
  verifyLiveExperimentDataset(benchmark, evaluation);
  return { protocol, benchmark, evaluation };
}

export function verifyLiveExperimentDataset(benchmark: LiveBenchmark, evaluation: LiveEvaluation) {
  const ids = new Set(benchmark.cases.map((entry) => entry.id));
  if (
    ids.size !== 20 ||
    new Set(benchmark.cases.map((entry) => entry.topic)).size !== 20 ||
    new Set(benchmark.cases.map((entry) => entry.frozen.inputFingerprint)).size !== 20
  )
    throw new Error('案例身份、主题或冻结输入重复');
  if (
    new Set(evaluation.cases.map((entry) => entry.caseId)).size !== 20 ||
    evaluation.cases.some((entry) => !ids.has(entry.caseId))
  )
    throw new Error('封存评价必须精确覆盖固定集');
  verifyLiveBenchmarkBindings(benchmark);
}

function verifyLiveScreeningCases(protocol: LiveExperimentProtocol, benchmark: LiveBenchmark) {
  if (protocol.version === 'research-live-experiment-v2') return;
  if (
    protocol.version === 'research-live-experiment-v4' ||
    protocol.version === 'research-live-experiment-v5' ||
    protocol.version === 'research-live-experiment-v6' ||
    protocol.model.id === OPENROUTER_EXPERIMENT_NEMOTRON_MODEL
  ) {
    if (JSON.stringify(protocol.caseIds) !== JSON.stringify(FIVE_CASE_SCREENING_CASE_IDS))
      throw new Error('五例筛查必须固定获准案例及顺序');
  } else if (new Set(protocol.caseIds).size !== 7) {
    throw new Error('原型号筛查必须固定7个不同案例');
  }
  if (protocol.caseIds.some((id) => !benchmark.cases.some((entry) => entry.id === id)))
    throw new Error('筛查案例不属于封存原基准');
}

function verifyLiveBenchmarkBindings(benchmark: LiveBenchmark) {
  for (const entry of benchmark.cases) {
    verifyAiFrozenResearchV2(entry.frozen);
    if (entry.assumptions.start >= entry.assumptions.end) throw new Error('实验窗口无效');
    const usable = entry.frozen.evidence.filter((item) => item.usable);
    if (
      entry.bindings.length !== usable.length ||
      new Set(entry.ownedToolCallIds).size !== entry.ownedToolCallIds.length ||
      new Set(entry.bindings.map((binding) => binding.audit.evidenceId)).size !== usable.length ||
      entry.bindings.some(
        (binding) =>
          !entry.ownedToolCallIds.includes(binding.toolCallId) ||
          !usable.some(
            (item) => experimentFingerprint(item.audit) === experimentFingerprint(binding.audit),
          ),
      )
    )
      throw new Error('案例引用与成功工具绑定不一致');
  }
}
