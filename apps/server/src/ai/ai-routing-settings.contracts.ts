import { z } from 'zod';
import { aiResearchDefaultSchema } from '@thesis-ledger/schemas';

export const aiRoutingSettingsUpdateSchema = z
  .object({
    researchDefault: aiResearchDefaultSchema.nullable(),
    expectedRevision: z.string().trim().min(1).max(120),
  })
  .strict();

export type AiRoutingSettingsUpdate = z.infer<typeof aiRoutingSettingsUpdateSchema>;

export type AiResearchDefaultCandidate = {
  providerId: string;
  providerName: string;
  model: string;
  enabled: boolean;
  health: string;
  authMode: 'api_key' | 'none';
  priceConfigured: boolean;
};

export type AiRoutingSettingsResponse = {
  researchDefault: { providerId: string; model: string } | null;
  revision: string;
  candidates: AiResearchDefaultCandidate[];
};
