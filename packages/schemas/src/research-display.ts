import { z } from 'zod';
import { aiResearchContextSchema, aiRunStatusSchema } from './ai.js';
import { researchResultSchema } from './research.js';

export const aiResearchTaskKindSchema = z.enum(['research', 'experiment_internal', 'unknown']);

export const aiResearchSourceTypeSchema = z.enum([
  'portfolio',
  'account',
  'position',
  'strategy',
  'strategy_experiment',
  'unknown',
]);

export const aiResearchResultAvailabilitySchema = z.enum([
  'available',
  'gap',
  'pending_verification',
  'missing',
  'invalid',
  'unsupported',
]);

export const aiResearchPrimaryStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'result_gap',
  'pending_verification',
  'result_unavailable',
  'failed',
  'cancelled',
  'unrecognized',
]);

export const aiResearchListSourceFilterSchema = z.enum([
  'all',
  'portfolio',
  'account',
  'position',
  'strategy',
  'strategy_experiment',
  'unknown',
]);

export const aiResearchListQuerySchema = z
  .object({
    view: z.literal('research'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().trim().min(1).max(512).optional(),
    search: z.string().trim().max(200).optional(),
    status: aiRunStatusSchema.optional(),
    source: aiResearchListSourceFilterSchema.default('all'),
    includeInternal: z.boolean().default(false),
    sort: z.literal('updated_desc').default('updated_desc'),
  })
  .strict();

export const aiResearchPageStateSchema = z
  .object({
    search: z.string().trim().max(200).default(''),
    status: z.union([z.literal('all'), aiRunStatusSchema]).default('all'),
    source: aiResearchListSourceFilterSchema.default('all'),
    includeInternal: z.boolean().default(false),
    sort: z.literal('updated_desc').default('updated_desc'),
    selectedRunId: z.uuid().nullable().default(null),
    mode: z.enum(['list', 'drawer', 'reading']).default('list'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode !== 'list' && value.selectedRunId === null) {
      context.addIssue({
        code: 'custom',
        path: ['selectedRunId'],
        message: '详情或完整阅读模式必须指定研究任务',
      });
    }
  });

export const aiResearchObjectSchema = z.object({
  type: z.enum(['portfolio', 'account', 'position', 'strategy_version', 'unknown']),
  label: z.string().min(1),
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
});

export const aiResearchSourceSchema = z.object({
  type: aiResearchSourceTypeSchema,
  label: z.string().min(1),
  name: z.string().min(1).optional(),
  href: z.string().min(1).optional(),
});

export const aiResearchCapabilitiesSchema = z.object({
  canRead: z.boolean(),
  canReload: z.boolean(),
  canRetry: z.boolean(),
  canCancel: z.boolean(),
  canOpenSource: z.boolean(),
});

export const aiResearchDisplayProjectionSchema = z
  .object({
    id: z.uuid(),
    question: z.string().nullable(),
    taskKind: aiResearchTaskKindSchema,
    object: aiResearchObjectSchema,
    source: aiResearchSourceSchema,
    executionStatus: z.string().min(1),
    primaryStatus: aiResearchPrimaryStatusSchema,
    resultAvailability: aiResearchResultAvailabilitySchema,
    summary: z.string().nullable(),
    verificationReason: z.string().nullable(),
    dataVersion: z.string().min(1),
    updatedAt: z.iso.datetime({ offset: true }),
    capabilities: aiResearchCapabilitiesSchema,
  })
  .strict();

export type AiResearchTaskKind = z.infer<typeof aiResearchTaskKindSchema>;
export type AiResearchSourceType = z.infer<typeof aiResearchSourceTypeSchema>;
export type AiResearchPrimaryStatus = z.infer<typeof aiResearchPrimaryStatusSchema>;
export type AiResearchResultAvailability = z.infer<typeof aiResearchResultAvailabilitySchema>;
export type AiResearchListQuery = z.infer<typeof aiResearchListQuerySchema>;
export type AiResearchPageState = z.infer<typeof aiResearchPageStateSchema>;
export type AiResearchDisplayProjection = z.infer<typeof aiResearchDisplayProjectionSchema>;

export interface AiResearchClassificationInput {
  promptVersion: string;
  context: unknown;
  optimizationExperimentId?: string | null;
  experimentRelation?: 'verified' | 'missing' | 'conflict' | 'unchecked';
}

export interface AiResearchResultStatusInput {
  executionStatus: string;
  taskKind: AiResearchTaskKind;
  result: unknown;
  toolCallOwnership: 'verified' | 'unavailable';
  ownedToolCallIds?: readonly string[];
  dataGaps?: readonly { code: string; summary: string }[];
}

export interface AiResearchResultStatus {
  primaryStatus: AiResearchPrimaryStatus;
  resultAvailability: AiResearchResultAvailability;
  summary: string | null;
  verificationReason: string | null;
}

export const classifyAiResearchTask = (
  input: AiResearchClassificationInput,
): AiResearchTaskKind => {
  if (input.experimentRelation === 'verified' && input.optimizationExperimentId) {
    return 'experiment_internal';
  }
  if (
    input.experimentRelation === 'conflict' ||
    (input.optimizationExperimentId && input.experimentRelation !== 'verified')
  ) {
    return 'unknown';
  }
  if (
    input.promptVersion === 'research-v1' &&
    aiResearchContextSchema.safeParse(input.context).success
  ) {
    return 'research';
  }
  return 'unknown';
};

const safeConclusion = (result: unknown) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const conclusion = (result as { conclusion?: unknown }).conclusion;
  if (typeof conclusion !== 'string') return null;
  const normalized = conclusion.trim().replace(/\s+/gu, ' ');
  if (!normalized) return null;
  return normalized.length > 240 ? `${normalized.slice(0, 239)}…` : normalized;
};

const unavailable = (
  availability: Extract<AiResearchResultAvailability, 'missing' | 'invalid' | 'unsupported'>,
  reason: string,
  summary: string | null = null,
): AiResearchResultStatus => ({
  primaryStatus: 'result_unavailable',
  resultAvailability: availability,
  summary,
  verificationReason: reason,
});

export const resolveAiResearchResultStatus = (
  input: AiResearchResultStatusInput,
): AiResearchResultStatus => {
  if (input.executionStatus === 'queued') {
    return {
      primaryStatus: 'queued',
      resultAvailability: 'pending_verification',
      summary: null,
      verificationReason: null,
    };
  }
  if (input.executionStatus === 'running') {
    return {
      primaryStatus: 'running',
      resultAvailability: 'pending_verification',
      summary: safeConclusion(input.result),
      verificationReason: null,
    };
  }
  if (input.executionStatus === 'failed') {
    return {
      primaryStatus: 'failed',
      resultAvailability: input.result ? 'pending_verification' : 'missing',
      summary: safeConclusion(input.result),
      verificationReason: null,
    };
  }
  if (input.executionStatus === 'cancelled') {
    return {
      primaryStatus: 'cancelled',
      resultAvailability: input.result ? 'pending_verification' : 'missing',
      summary: safeConclusion(input.result),
      verificationReason: null,
    };
  }
  if (input.executionStatus !== 'succeeded') {
    return {
      primaryStatus: 'unrecognized',
      resultAvailability: input.result ? 'pending_verification' : 'missing',
      summary: safeConclusion(input.result),
      verificationReason: `无法识别执行状态：${input.executionStatus}`,
    };
  }
  if (input.taskKind !== 'research') {
    return unavailable(
      'unsupported',
      input.taskKind === 'experiment_internal'
        ? '实验内部结果不适用通用研究结果契约'
        : '任务类型不能确认，无法选择结果解析器',
      safeConclusion(input.result),
    );
  }
  if (input.result === null || input.result === undefined) {
    return unavailable('missing', '未返回可展示结果');
  }

  const parsed = researchResultSchema.safeParse(input.result);
  if (!parsed.success) {
    return unavailable(
      'invalid',
      '结果不符合 ResearchResult V1 契约',
      safeConclusion(input.result),
    );
  }

  const citationIds = parsed.data.evidence.flatMap((item) =>
    item.citations.flatMap((citation) => (citation.toolCallId ? [citation.toolCallId] : [])),
  );
  if (citationIds.length > 0 && input.toolCallOwnership === 'unavailable') {
    return {
      primaryStatus: 'pending_verification',
      resultAvailability: 'pending_verification',
      summary: safeConclusion(parsed.data),
      verificationReason: '引用归属事实尚未完成核验',
    };
  }
  const ownedIds = new Set(input.ownedToolCallIds ?? []);
  const invalidCitation = citationIds.find((id) => !ownedIds.has(id));
  if (invalidCitation) {
    return unavailable(
      'invalid',
      '结果引用了不属于当前研究任务的 Tool 调用',
      safeConclusion(parsed.data),
    );
  }

  const gaps = input.dataGaps ?? [];
  if (gaps.length > 0) {
    return {
      primaryStatus: 'result_gap',
      resultAvailability: 'gap',
      summary: safeConclusion(parsed.data),
      verificationReason: gaps.map((gap) => gap.summary).join('；'),
    };
  }
  return {
    primaryStatus: 'completed',
    resultAvailability: 'available',
    summary: safeConclusion(parsed.data),
    verificationReason: null,
  };
};
