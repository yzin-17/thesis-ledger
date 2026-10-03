import { z } from 'zod';
import {
  desiredProviderPolicyV3Schema,
  effectiveProviderPolicyV3Schema,
  type DesiredProviderPolicyV3,
  type EffectiveProviderPolicyV3,
} from './market-route-v3.js';

const text = z.string().trim().min(1);

const versionList = z.array(z.number().int().positive()).superRefine((versions, context) => {
  const seen = new Set<number>();
  versions.forEach((version, index) => {
    if (seen.has(version)) {
      context.addIssue({
        code: 'custom',
        path: [index],
        message: 'Control Contract 版本不得重复',
      });
    }
    seen.add(version);
  });
});

/** V3 is an explicit Control negotiation; Data versions have their own capability wire. */
export const marketControlHandshakeRequestV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  consumer: z.literal('thesis-ledger'),
  requestId: text,
  supportedVersions: z.tuple([z.literal(3)]),
});
export type MarketControlHandshakeRequestV3 = z.infer<typeof marketControlHandshakeRequestV3Schema>;

/** The flags describe Provider Control only and deliberately contain no Data versions. */
export const marketControlHandshakeResponseV3Schema = z.strictObject({
  contractVersion: z.literal(3),
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

const unsupportedVersionMessages = z.enum([
  'Control Contract 版本不兼容',
  'Control Contract V2 版本不兼容',
  '没有共同的 Control Contract 版本',
]);

/** A rejecting peer may identify its error with the Control version it still speaks. */
export const marketControlUnsupportedVersionErrorV3Schema = z.strictObject({
  contractVersion: z.number().int().positive(),
  code: z.literal(marketControlErrorCodeV3.unsupportedControlContractVersion),
  message: unsupportedVersionMessages,
  requestId: text,
  diagnosticId: text.optional(),
  supportedVersions: versionList.optional(),
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
