import type { RiskRuleRecord } from '../src/features/risk/risk.types.js';
export {
  drawerAccount as riskAccount,
  drawerPosition as riskPosition,
} from './browser-drawer-samples.js';

export function precisionRiskRule(threshold = 1 / 3): RiskRuleRecord {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    version: 1,
    kind: 'cost-stop',
    scope: 'security',
    severity: 'warning',
    threshold,
    enabled: false,
    needsRepair: false,
    repairReason: null,
    archivedAt: null,
    symbol: '510300.SH',
    accountId: '11111111-1111-4111-8111-111111111111',
    effectiveAt: '2026-11-06T01:00:00Z',
  };
}
