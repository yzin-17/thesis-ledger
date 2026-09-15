import { z } from 'zod';

export const providerOAuthSessionSchema = z.object({
  sessionId: z.string().uuid(),
  providerId: z.literal('longbridge'),
  status: z.enum(['starting', 'authorizing', 'succeeded', 'failed', 'cancelled', 'expired']),
  authorizationUrl: z.string().url().nullable(),
  expiresAt: z.string().datetime({ offset: true }),
  errorCode: z.string().nullable(),
});

export const currentProviderOAuthSessionSchema = z.object({
  session: providerOAuthSessionSchema.nullable(),
});
export type ProviderOAuthSession = z.infer<typeof providerOAuthSessionSchema>;
export type ProviderOAuthAction =
  | { kind: 'create'; clientId: string }
  | { kind: 'current' }
  | { kind: 'get' | 'cancel'; sessionId: string };
