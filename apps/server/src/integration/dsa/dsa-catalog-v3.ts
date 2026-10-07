import { z } from 'zod';
import { catalogSnapshotSchema, catalogDeltaSchema } from '@thesis-ledger/schemas';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';

const envelope = { contractVersion: z.literal(3), consumer: z.literal('thesis-ledger') };
const jobSchema = z
  .strictObject({
    ...envelope,
    requestId: z.string().min(1).optional(),
    id: z.string().min(1),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'timeout']),
    generation: z.number().int().nonnegative(),
    checksum: z.string(),
    error: z.unknown().optional(),
    owner: z.string().min(1).nullable(),
    leaseExpiresAt: z.iso.datetime({ offset: true }).nullable(),
    leaseValid: z.boolean(),
    retryable: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (job) =>
      job.status !== 'succeeded' || (job.generation > 0 && /^[a-f0-9]{64}$/.test(job.checksum)),
    '成功目录任务缺少目录身份',
  );
export type CatalogJob = z.infer<typeof jobSchema>;
const ackSchema = z.strictObject({
  ...envelope,
  requestId: z.string().min(1),
  acknowledged: z.literal(true),
  generation: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  cursor: z.string().regex(/^generation:[1-9]\d*$/),
});

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new DsaV3ProtocolError('DSA Catalog 响应不符合当前合同', 'invalid-response');
  return result.data;
}

export function parseCatalogJob(raw: unknown, expected: { id?: string; requestId?: string }) {
  const job = parse(jobSchema, raw);
  if (
    (expected.id !== undefined && job.id !== expected.id) ||
    (expected.requestId !== undefined && job.requestId !== expected.requestId)
  )
    throw new DsaV3ProtocolError('DSA Catalog Job 身份不匹配', 'invalid-response');
  return job;
}

export function parseCatalogAck(
  raw: unknown,
  generation: number,
  checksum: string,
  requestId: string,
) {
  const ack = parse(ackSchema, raw);
  if (
    ack.generation !== generation ||
    ack.checksum !== checksum ||
    ack.requestId !== requestId ||
    ack.cursor !== `generation:${generation}`
  )
    throw new DsaV3ProtocolError('DSA Catalog ACK 身份不匹配', 'invalid-response');
  return ack;
}

export const parseCatalogSnapshot = (raw: unknown) => parse(catalogSnapshotSchema, raw);
export function parseCatalogDelta(raw: unknown, cursor: string) {
  const delta = parse(catalogDeltaSchema, raw);
  if (delta.fromCursor !== cursor)
    throw new DsaV3ProtocolError('DSA Catalog Delta 来源游标不匹配', 'invalid-response');
  return delta;
}
