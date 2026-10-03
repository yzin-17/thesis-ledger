import { z } from 'zod';
import {
  marketProviderRegistrySchema,
  marketProviderConfigResponseSchema,
  marketProviderTestResponseSchema,
  effectiveProviderPolicyV3Schema,
  providerOAuthSessionSchema,
  type ProviderOAuthAction,
} from '@thesis-ledger/schemas';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';

const envelope = { contractVersion: z.literal(3), consumer: z.literal('thesis-ledger') };
const identity = { ...envelope, providerId: z.string().min(1), requestId: z.string().min(1) };
const registry = marketProviderRegistrySchema;
const config = marketProviderConfigResponseSchema;
const probe = marketProviderTestResponseSchema;
const removal = z.strictObject({
  ...identity,
  removed: z.literal(true),
  effective: effectiveProviderPolicyV3Schema.nullable(),
  tombstone: z.strictObject({
    providerId: z.string().min(1),
    displayName: z.string().min(1),
    reason: z.string(),
    removedAt: z.string().datetime({ offset: true }),
  }),
});
const session = providerOAuthSessionSchema.extend(envelope).strict();
const current = z.strictObject({
  ...envelope,
  session: providerOAuthSessionSchema.strict().nullable(),
});

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new DsaV3ProtocolError('DSA Provider 响应不符合当前合同', 'invalid-response');
  return result.data;
}

export function parseProviderRegistry(raw: unknown) {
  const result = parse(registry, raw);
  const ids = result.providers.map((item) => item.providerId);
  if (new Set(ids).size !== ids.length) {
    throw new DsaV3ProtocolError('DSA Provider 身份重复', 'invalid-response');
  }
  return result;
}

export function parseProviderMutation(
  kind: 'config' | 'test' | 'remove',
  raw: unknown,
  providerId: string,
  requestId: string,
) {
  let result: z.infer<typeof config> | z.infer<typeof probe> | z.infer<typeof removal>;
  if (kind === 'config') result = parse(config, raw);
  else if (kind === 'test') result = parse(probe, raw);
  else result = parse(removal, raw);
  if (
    result.providerId !== providerId ||
    result.requestId !== requestId ||
    ('tombstone' in result && result.tombstone.providerId !== providerId)
  ) {
    throw new DsaV3ProtocolError('DSA Provider 响应身份不匹配', 'invalid-response');
  }
  return result;
}

export function parseProviderOAuth(raw: unknown, action: ProviderOAuthAction) {
  if (action.kind === 'current') {
    const result = parse(current, raw);
    return { session: result.session };
  }
  const result = parse(session, raw);
  if (
    (action.kind === 'get' || action.kind === 'cancel') &&
    result.sessionId !== action.sessionId
  ) {
    throw new DsaV3ProtocolError('DSA 授权会话身份不匹配', 'invalid-response');
  }
  return providerOAuthSessionSchema.parse(result);
}
