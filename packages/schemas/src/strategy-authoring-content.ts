import { z } from 'zod';
import { AUTHORING_LIMITS } from './strategy-authoring-definition.js';
import {
  authoringConfirmationSchema,
  authoringConfirmationDraftSchema,
} from './strategy-authoring-confirmation.js';

const shortText = z.string().max(2_000);
const key = z.string().trim().min(1).max(120);
const revision = z.number().int().min(1).max(2_147_483_647);
const limited = <T extends z.ZodType>(schema: T) =>
  z.array(schema).max(AUTHORING_LIMITS.collectionItems);
export const authoringQuestionSchema = z
  .object({
    id: key,
    basedOnRevision: revision,
    quote: shortText,
    reason: shortText,
    options: limited(shortText),
    dependsOn: limited(key),
    answer: shortText.nullable(),
    answerState: z.enum(['unanswered', 'confirmed', 'needs_review']),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.answerState === 'confirmed' && !value.answer?.trim())
      ctx.addIssue({ code: 'custom', message: '确认答案不能为空', path: ['answer'] });
  });
export const authoringRequirementSchema = z
  .object({
    id: key,
    quote: shortText,
    interpretation: shortText,
    state: z.enum(['understood', 'unresolved', 'unsupported', 'removed', 'runtime']),
    definitionPaths: limited(key),
  })
  .strict();
export const authoringContentSchema = z
  .object({
    title: z.string().max(200),
    description: z.string().max(AUTHORING_LIMITS.descriptionCharacters),
    questions: limited(authoringQuestionSchema),
    requirements: limited(authoringRequirementSchema),
    runtimeIntents: limited(shortText),
    removedRequirements: limited(shortText),
    definitionText: z.string().max(AUTHORING_LIMITS.definitionCharacters),
    manualChanges: limited(shortText),
    confirmation: authoringConfirmationSchema.nullable().optional(),
    confirmationDraft: authoringConfirmationDraftSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(value)).length > AUTHORING_LIMITS.snapshotBytes)
      ctx.addIssue({ code: 'custom', message: '草稿内容超过字节上限' });
    for (const collection of [value.questions, value.requirements]) {
      if (new Set(collection.map((item) => item.id)).size !== collection.length)
        ctx.addIssue({ code: 'custom', message: '问题与需求各自的标识不能重复' });
    }
    const questions = new Map(value.questions.map((question) => [question.id, question]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id) || !questions.has(id)) return false;
      if (visited.has(id)) return true;
      visiting.add(id);
      if (!questions.get(id)!.dependsOn.every(visit)) return false;
      visiting.delete(id);
      visited.add(id);
      return true;
    };
    if (![...questions.keys()].every(visit))
      ctx.addIssue({ code: 'custom', message: '问题依赖不得缺失或形成循环', path: ['questions'] });
  });
export type AuthoringContent = z.infer<typeof authoringContentSchema>;
