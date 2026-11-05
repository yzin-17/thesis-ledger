import { z } from 'zod';
const date = z.iso.datetime({ offset: true });
export const marketCatalogJobSchema = z
  .strictObject({
    contractVersion: z.literal(3),
    consumer: z.literal('thesis-ledger'),
    requestId: z.string().min(1).optional(),
    id: z.string().min(1),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'timeout']),
    generation: z.number().int().nonnegative(),
    checksum: z.string(),
    acknowledged: z.boolean(),
    owner: z.string().min(1).nullable(),
    leaseExpiresAt: date.nullable(),
    leaseValid: z.boolean(),
    retryable: z.boolean(),
    createdAt: date,
    updatedAt: date,
    error: z.unknown().optional(),
    count: z.number().int().nonnegative().optional(),
    cursor: z.string().optional(),
    idempotent: z.boolean().optional(),
    incremental: z.boolean().optional(),
    deletedCount: z.number().int().nonnegative().optional(),
  })
  .superRefine((job, context) => {
    if (job.status === 'succeeded') {
      if (
        !job.acknowledged ||
        job.generation === 0 ||
        !/^[a-f0-9]{64}$/u.test(job.checksum) ||
        job.cursor !== `generation:${job.generation}` ||
        job.count === undefined
      )
        context.addIssue({ code: 'custom', message: '目录成功必须包含已确认的完整同步身份' });
    } else if (job.acknowledged || job.cursor !== undefined || job.count !== undefined)
      context.addIssue({ code: 'custom', message: '非成功任务不能冒充目录已更新' });
  });
export type MarketCatalogJob = z.infer<typeof marketCatalogJobSchema>;
