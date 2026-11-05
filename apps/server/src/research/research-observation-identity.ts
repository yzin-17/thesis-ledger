import { createHash } from 'node:crypto';
import { z } from 'zod';
import { RESEARCH_OBSERVATION_METHOD, researchFingerprintV2Schema } from '@thesis-ledger/schemas';

/** 观察身份与输入编码；摘要提供版本去重，不提供资料资格或读取授权。 */
function encode(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  const data = value as Record<string, unknown>;
  return `{${Object.keys(data)
    .sort()
    .filter((key) => data[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${encode(data[key])}`)
    .join(',')}}`;
}
export const researchObservationDigest = (value: unknown) =>
  createHash('sha256').update(encode(value)).digest('hex');
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const uuid = z.uuid().transform((value) => value.toLowerCase());
export const observationStartSchema = z.strictObject({
  ownerId: uuid,
  submissionId: uuid,
  runId: uuid,
  lineageId: uuid,
  artifactFingerprint: researchFingerprintV2Schema,
  claimId: z.string().min(1).max(80),
  windowTradingDays: z.union([z.literal(5), z.literal(20)]).nullable(),
  methodVersion: z.literal(RESEARCH_OBSERVATION_METHOD),
  visibleAt: instant,
});
export function observationIdentity(raw: unknown) {
  const { submissionId, visibleAt, ...logical } = observationStartSchema.parse(raw);
  const logicalKey = researchObservationDigest({ version: 'research-observation-v1', ...logical });
  const requestDigest = researchObservationDigest({ logicalKey, visibleAt });
  return { logical, submissionId, visibleAt, logicalKey, requestDigest };
}
