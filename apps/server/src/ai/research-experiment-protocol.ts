import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  aiFrozenResearchV2Schema,
  researchEvidenceBindingV2Schema,
  researchGenerationV2Schema,
} from '@thesis-ledger/schemas';

export const RESEARCH_EXPERIMENT_STAGES = ['organize', 'challenge', 'synthesize'] as const;
export const RESEARCH_EXPERIMENT_PROMPT_VERSION = 'research-experiment-stage-v1' as const;
export const RESEARCH_EXPERIMENT_INSTRUCTIONS = {
  single: '一次完成证据核对、反证检查与综合结论，明确未知项及失效条件。',
  organize: '整理冻结材料中的事实及证据对应关系，明确缺失和冲突；阶段结论只概括资料状态。',
  challenge: '逐项核对前序整理结果，寻找反证、范围越界及风险，保留无法确认的问题和失效条件。',
  synthesize: '综合已核验材料及前序反证，形成有依据、有期限及明确未知项的结论，不补造缺失事实。',
} as const;
export type ResearchExperimentStage = 'single' | (typeof RESEARCH_EXPERIMENT_STAGES)[number];
const decimal = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(80);
const positive = decimal.refine((value) => new Prisma.Decimal(value).gt(0));
const period = z.strictObject({
  start: z.iso.date(),
  end: z.iso.date(),
  frequency: z.literal('daily'),
});
const series = period.extend({
  currency: z.enum(['CNY', 'HKD', 'USD']),
  initialCapital: positive,
  priceBasis: z.literal('economic-close'),
  feeBasis: z.literal('same-frozen-net-return-assumptions'),
  points: z
    .array(
      z.strictObject({
        date: z.iso.date(),
        value: decimal.refine((value) => new Prisma.Decimal(value).gt(-1)),
      }),
    )
    .min(1)
    .max(1000),
});
const economics = z
  .strictObject({ strategy: series, benchmark: series, riskFree: series })
  .nullable();
const assumptions = period.extend({
  initialCapital: positive,
  currency: z.enum(['CNY', 'HKD', 'USD']),
  priceBasis: z.literal('economic-close'),
  feeBasis: z.literal('same-frozen-net-return-assumptions'),
});
const controlled = z.strictObject({
  single: researchGenerationV2Schema,
  organize: researchGenerationV2Schema,
  challenge: researchGenerationV2Schema,
  synthesize: researchGenerationV2Schema,
});
const testCase = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  frozen: aiFrozenResearchV2Schema,
  bindings: z.array(researchEvidenceBindingV2Schema).min(1).max(1000),
  ownedToolCallIds: z.array(z.uuid()).min(1).max(1000),
  assumptions,
  controlledResponses: controlled,
  sealedEvaluation: z.strictObject({ qualityGrade: z.null(), economics }),
});
export const researchExperimentProtocolSchema = z
  .strictObject({
    version: z.literal('research-experiment-protocol-v1'),
    mode: z.literal('controlled-offline'),
    datasetKind: z.literal('synthetic'),
    model: z.strictObject({
      providerId: z.literal('controlled-research-experiment'),
      id: z.literal('controlled-model-v1'),
      revision: z.literal('controlled-responses-v1'),
    }),
    budget: z.strictObject({
      maxCalls: z.literal(3),
      maxInputTokens: z.number().int().min(1).max(1000000),
      maxOutputTokens: z.number().int().min(3).max(100000),
      maxDurationMs: z.number().int().min(10).max(30000),
      maxCost: positive,
      currency: z.literal('USD'),
    }),
    pricing: z.strictObject({
      costPer1kInput: z.number().finite().nonnegative().max(1000),
      costPer1kOutput: z.number().finite().nonnegative().max(1000),
      costCurrency: z.literal('USD'),
      pricingVersion: z.literal('controlled-pricing-v1'),
    }),
    activationCriteria: z.strictObject({
      minimumCases: z.literal(20),
      minimumQualityDelta: z.literal(0.05),
      maximumFailureRateDelta: z.literal(0),
      maximumCostRatio: z.literal(1.5),
      maximumLatencyRatio: z.literal(1.5),
      zeroCriticalViolations: z.literal(true),
    }),
    cases: z.array(testCase).min(1).max(20),
  })
  .superRefine((value, context) => {
    const reject = (message: string) => context.addIssue({ code: 'custom', message });
    if (new Set(value.cases.map((entry) => entry.id)).size !== value.cases.length)
      reject('固定案例身份不能重复');
    for (const entry of value.cases) {
      if (entry.assumptions.start >= entry.assumptions.end) reject('实验窗口必须正向');
      if (new Set(entry.ownedToolCallIds).size !== entry.ownedToolCallIds.length)
        reject('成功 Tool 身份不能重复');
      const financial = entry.sealedEvaluation.economics;
      if (financial === null) continue;
      const expected = financial.strategy.points.map((point) => point.date).join(',');
      for (const sample of Object.values(financial)) {
        if (
          sample.currency !== entry.assumptions.currency ||
          sample.initialCapital !== entry.assumptions.initialCapital ||
          sample.priceBasis !== entry.assumptions.priceBasis ||
          sample.start !== entry.assumptions.start ||
          sample.end !== entry.assumptions.end ||
          sample.frequency !== entry.assumptions.frequency ||
          sample.points.map((point) => point.date).join(',') !== expected
        )
          reject('收益、基准和无风险序列必须使用相同窗口、日期及频率');
        if (
          sample.points.at(-1)!.date !== sample.end ||
          sample.points.some(
            (point, index) =>
              point.date <= sample.start ||
              point.date > sample.end ||
              (index > 0 && point.date <= sample.points[index - 1]!.date),
          )
        )
          reject('封存收益序列日期无效');
      }
    }
  });
export type ResearchExperimentProtocol = z.infer<typeof researchExperimentProtocolSchema>;
export type ResearchExperimentCase = ResearchExperimentProtocol['cases'][number];
function encode(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(encode).join(',') + ']';
  const record = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => JSON.stringify(key) + ':' + encode(record[key]))
      .join(',') +
    '}'
  );
}
export const experimentFingerprint = (value: unknown) =>
  createHash('sha256').update(encode(value)).digest('hex');
/** 封存参考只在评价端消费，不分配为模型产物的收益成绩。 */
export function experimentFinancialReference(entry: ResearchExperimentCase) {
  const value = entry.sealedEvaluation.economics;
  if (value === null)
    return {
      status: 'unknown' as const,
      periods: null,
      strategyExcessMean: null,
      benchmarkExcessMean: null,
    };
  const excess = (key: 'strategy' | 'benchmark') =>
    value[key].points
      .reduce(
        (total, point, index) =>
          total.plus(new Prisma.Decimal(point.value).minus(value.riskFree.points[index]!.value)),
        new Prisma.Decimal(0),
      )
      .div(value.strategy.points.length)
      .toFixed();
  return {
    status: 'aligned' as const,
    periods: value.strategy.points.length,
    strategyExcessMean: excess('strategy'),
    benchmarkExcessMean: excess('benchmark'),
  };
}
