import { z } from 'zod';
import { ruleSourceMonitorVersion } from './rule-source-monitor.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const format = z.enum(['html', 'docx', 'pdf', 'json']);
const instant = z.iso.datetime({ offset: true });
export const ruleMonitorVersionRequestSchema = z
  .strictObject({
    kind: z.enum(['pack', 'document']),
    identity: z.string().min(1).max(2048),
    contentHash: hash,
    baseHash: hash.optional(),
  })
  .refine((value) => value.contentHash !== value.baseHash, '请选择不同的比较版本');

export const ruleMonitorSnapshotSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('available'),
    format,
    text: z.string().min(1).max(250_000),
    capturedAt: instant,
    reason: z.null(),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    format: format.nullable(),
    text: z.null(),
    capturedAt: instant.nullable(),
    reason: z.enum([
      'legacy_missing',
      'text_unavailable',
      'pdf_encrypted',
      'extraction_failed',
      'extraction_timeout',
      'text_too_large',
    ]),
  }),
]);
const line = z.strictObject({
  type: z.enum(['context', 'added', 'removed', 'separator']),
  text: z.string().max(250_000),
});
const comparison = z.discriminatedUnion('status', [
  z
    .strictObject({
      baseHash: hash,
      status: z.literal('available'),
      reason: z.null(),
      added: z.number().int().nonnegative(),
      removed: z.number().int().nonnegative(),
      lines: z.array(line).max(2000),
    })
    .superRefine((value, context) => {
      if (
        value.added !== value.lines.filter((item) => item.type === 'added').length ||
        value.removed !== value.lines.filter((item) => item.type === 'removed').length
      )
        context.addIssue({ code: 'custom', message: '差异统计与明细不一致' });
    }),
  z.strictObject({
    baseHash: hash,
    status: z.literal('unavailable'),
    reason: z.enum(['snapshot_unavailable', 'diff_too_large']),
    added: z.literal(0),
    removed: z.literal(0),
    lines: z.array(line).length(0),
  }),
]);
export const ruleMonitorVersionDetailSchema = z.strictObject({
  version: z.literal(ruleSourceMonitorVersion),
  kind: z.enum(['pack', 'document']),
  identity: z.string().min(1).max(2048),
  contentHash: hash,
  snapshot: ruleMonitorSnapshotSchema,
  comparison: comparison.nullable(),
});
export type RuleMonitorVersionRequest = z.infer<typeof ruleMonitorVersionRequestSchema>;
export type RuleMonitorVersionDetail = z.infer<typeof ruleMonitorVersionDetailSchema>;
