import { marketRouteAdmissionV3Schema } from './market-route-admission-v3.js';
import { marketRouteKeyV3Schema } from './market-route-v3.js';

/** 事件准入复用路由准入身份，仅收窄允许的事件能力。 */
export const marketEventAdmissionV3Schema = marketRouteAdmissionV3Schema.safeExtend({
  routeKey: marketRouteKeyV3Schema.refine(
    (key) =>
      key.kind === 'data' &&
      (key.capability === 'CASH_DISTRIBUTION' || key.capability === 'SPLIT_EVENT'),
  ),
});
