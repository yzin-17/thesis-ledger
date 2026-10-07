import { z } from 'zod';
import { marketRouteKeyV3Schema } from './market-route-v3.js';
import { marketRouteTargetSchema } from './market-route-target.js';

const text = z.string().trim().min(1);
/** DSA 已核验的只读准入投影；不包含凭据内容或审核人身份。 */
export const marketRouteAdmissionV3Schema = z
  .strictObject({
    consumer: z.literal('thesis-ledger'),
    routeKey: marketRouteKeyV3Schema,
    target: marketRouteTargetSchema.strict(),
    status: z.literal('admitted'),
    admissionState: z.literal('admitted'),
    evidenceRef: text,
    evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    scopeSymbols: z.array(text).min(1),
    scopeDateFrom: z.iso.date(),
    scopeDateTo: z.iso.date(),
    adapterRevision: text,
    sourceRevision: text,
    credentialRevision: text,
    validFrom: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }),
    recordVersion: z.number().int().positive(),
    recordedAt: z.iso.datetime({ offset: true }),
    invalidatedAt: z.null(),
    invalidationReason: z.null(),
  })
  .superRefine((value, ctx) => {
    if (value.scopeDateFrom > value.scopeDateTo) {
      ctx.addIssue({ code: 'custom', path: ['scopeDateTo'], message: '准入日期范围无效' });
    }
    if (Date.parse(value.validFrom) >= Date.parse(value.validUntil)) {
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: '准入有效期无效' });
    }
    if (new Set(value.scopeSymbols).size !== value.scopeSymbols.length) {
      ctx.addIssue({ code: 'custom', path: ['scopeSymbols'], message: '准入标的重复' });
    }
  });
