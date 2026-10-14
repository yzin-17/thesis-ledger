import { z } from 'zod';
import { marketRouteCatalogV3Schema } from './market-route-catalog-v3.js';
import { marketEventAdmissionV3Schema } from './market-event-admission-v3.js';
import { marketRouteKeyIdV3 } from './market-route-v3.js';

/** 原Control读取的显式视图；默认目录形状及固定事件接口保持。 */
export const marketEventAdmissionCatalogV3Schema = z
  .strictObject({
    protocolVersion: z.literal('event-admission-catalog-v1'),
    catalog: marketRouteCatalogV3Schema,
    admissions: z.array(marketEventAdmissionV3Schema).max(140),
  })
  .superRefine(({ catalog, admissions }, ctx) => {
    const seen = new Set<string>();
    admissions.forEach((admission, index) => {
      const key = marketRouteKeyIdV3(admission.routeKey);
      const id = JSON.stringify([key, admission.target.providerId, admission.target.upstreamSource]);
      if (seen.has(id) || !catalog.entries.some((entry) =>
        marketRouteKeyIdV3(entry.key) === key && entry.state === 'ready'
        && entry.target.providerId === admission.target.providerId
        && entry.target.upstreamSource === admission.target.upstreamSource))
        ctx.addIssue({ code: 'custom', path: ['admissions', index], message: '精确准入快照重复或未关联就绪目录' });
      seen.add(id);
    });
  });

export type MarketEventAdmissionCatalogV3 = z.infer<typeof marketEventAdmissionCatalogV3Schema>;
