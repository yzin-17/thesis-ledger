import { z } from 'zod';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  type DesiredProviderPolicyV3,
  type EffectiveProviderPolicyV3,
} from './market-route-v3.js';

const text = z.string().trim().min(1);

export const DSA_CONTROL_CONTRACT = 'dsa-control-v1' as const;

export const marketControlHandshakeRequestV3Schema = z.strictObject({
  contractVersion: z.literal(1),
  contract: z.literal(DSA_CONTROL_CONTRACT),
  consumer: z.literal('thesis-ledger'),
  requestId: text,
});
export type MarketControlHandshakeRequestV3 = z.infer<typeof marketControlHandshakeRequestV3Schema>;

export const marketControlHandshakeResponseV3Schema = z.strictObject({
  contractVersion: z.literal(1),
  contract: z.literal(DSA_CONTROL_CONTRACT),
  consumer: z.literal('thesis-ledger'),
  accepted: z.literal(true),
  providerRegistry: z.boolean(),
  policyApply: z.boolean(),
  catalogSync: z.boolean(),
  requestId: text,
});
export type MarketControlHandshakeResponseV3 = z.infer<
  typeof marketControlHandshakeResponseV3Schema
>;

export const marketControlErrorCodeV3 = {
  unsupportedControlContractVersion: 'CONTROL_CONTRACT_UNSUPPORTED',
} as const;

export const marketControlUnsupportedVersionErrorV3Schema = z.strictObject({
  contractVersion: z.literal(1),
  code: z.literal(marketControlErrorCodeV3.unsupportedControlContractVersion),
  message: text,
  requestId: text,
  diagnosticId: text.optional(),
  expectedContract: z.literal(DSA_CONTROL_CONTRACT).optional(),
});
export type MarketControlUnsupportedVersionErrorV3 = z.infer<
  typeof marketControlUnsupportedVersionErrorV3Schema
>;

/** The application body is the exact Desired RoutePolicy V3 serialization. */
export const marketControlPolicyApplyRequestV3Schema = desiredProviderPolicyV3Schema;
export type MarketControlPolicyApplyRequestV3 = DesiredProviderPolicyV3;

export const marketControlPolicyApplyResponseV3Schema = z
  .strictObject({
    status: z.literal('applied'),
    idempotent: z.boolean(),
    desired: desiredProviderPolicyV3Schema,
    effective: effectiveProviderPolicyV3Schema,
    requestId: text,
  })
  .superRefine((response, context) => {
    if (response.requestId !== response.desired.requestId) {
      context.addIssue({
        code: 'custom',
        path: ['requestId'],
        message: 'Apply 响应 requestId 必须与 Desired Policy 一致',
      });
    }
    if (response.requestId !== response.effective.requestId) {
      context.addIssue({
        code: 'custom',
        path: ['effective', 'requestId'],
        message: 'Effective Policy requestId 必须与 Apply 请求一致',
      });
    }
    if (response.effective.sourceDesiredRevision !== response.desired.revision) {
      context.addIssue({
        code: 'custom',
        path: ['effective', 'sourceDesiredRevision'],
        message: 'Effective Policy 必须记录对应的 Desired revision',
      });
    }
  });
export type MarketControlPolicyApplyResponseV3 = z.infer<
  typeof marketControlPolicyApplyResponseV3Schema
>;

export type MarketControlEffectivePolicyV3 = EffectiveProviderPolicyV3;
