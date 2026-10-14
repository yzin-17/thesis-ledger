import { z } from 'zod';
import { aiRunStatusSchema } from './ai.js';

export const journalAiSnapshotMetadataSchema = z
  .object({
    id: z.uuid(),
    provider: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    status: aiRunStatusSchema,
  })
  .strict();
