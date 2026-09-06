import { requestDesktopJson, type DesktopRequestClient } from '../shared/request.js';
import type {
  CreateRiskRuleInput,
  NotificationRecord,
  NotificationRoutingStatus,
  PortfolioMode,
  RiskAuditRecord,
  RiskContext,
  RiskEventRecord,
  RiskRuleRecord,
  RiskScanResult,
  RiskTestResult,
} from './risk.types.js';

const noStore = { cache: 'no-store' as const };

export const fetchRiskRules = (
  options: { includeArchived?: boolean } = {},
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<RiskRuleRecord[]>(
    `/risk/rules${options.includeArchived ? '?includeArchived=true' : ''}`,
    noStore,
    client,
  );

export const fetchRiskEvents = (mode: PortfolioMode, client?: DesktopRequestClient) =>
  requestDesktopJson<RiskEventRecord[]>(
    `/risk/events?mode=${encodeURIComponent(mode)}`,
    noStore,
    client,
  );

export const fetchRiskNotifications = (client?: DesktopRequestClient) =>
  requestDesktopJson<NotificationRecord[]>('/notifications', noStore, client);

export const fetchNotificationRouting = (client?: DesktopRequestClient) =>
  requestDesktopJson<NotificationRoutingStatus>('/notifications/routing', noStore, client);

export const createRiskRule = (input: CreateRiskRuleInput, client?: DesktopRequestClient) =>
  requestDesktopJson<RiskRuleRecord>(
    '/risk/rules',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    client,
  );

export const patchRiskRule = (ruleId: string, patch: object, client?: DesktopRequestClient) =>
  requestDesktopJson<RiskRuleRecord>(
    `/risk/rules/${encodeURIComponent(ruleId)}`,
    {
      ...noStore,
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    },
    client,
  );

export const deleteRiskRule = (ruleId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<RiskRuleRecord>(
    `/risk/rules/${encodeURIComponent(ruleId)}`,
    {
      ...noStore,
      method: 'DELETE',
    },
    client,
  );

export const restoreRiskRule = (ruleId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<RiskRuleRecord>(
    `/risk/rules/${encodeURIComponent(ruleId)}/restore`,
    {
      ...noStore,
      method: 'POST',
    },
    client,
  );

export const testRiskRule = (
  ruleId: string,
  contexts: RiskContext[],
  client?: DesktopRequestClient,
) =>
  requestDesktopJson<RiskTestResult[]>(
    `/risk/rules/${encodeURIComponent(ruleId)}/test`,
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(contexts),
    },
    client,
  );

export const scanRisk = (contexts: RiskContext[], scanId?: string, client?: DesktopRequestClient) =>
  requestDesktopJson<RiskScanResult>(
    '/risk/scan',
    {
      ...noStore,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ security: contexts, ...(scanId ? { scanId } : {}) }),
    },
    client,
  );

export const fetchRiskAudit = (ruleId: string, client?: DesktopRequestClient) =>
  requestDesktopJson<RiskAuditRecord[]>(
    `/risk/rules/${encodeURIComponent(ruleId)}/audit`,
    noStore,
    client,
  );
