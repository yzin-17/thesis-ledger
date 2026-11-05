import { z } from 'zod';
import { researchResultSchema } from './research.js';
import { researchResultV2Schema } from './research-result-v2.js';

/** 供双读消费者显式选择；原 researchResultSchema 继续只接受 V1。 */
export const versionedResearchResultSchema = z.discriminatedUnion('version', [
  researchResultSchema,
  researchResultV2Schema,
]);
export type VersionedResearchResult = z.infer<typeof versionedResearchResultSchema>;
