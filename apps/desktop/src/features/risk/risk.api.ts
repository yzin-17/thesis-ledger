import { riskManagementClient } from '@thesis-ledger/api-client';
import { parsedDesktopRequest, type DesktopRequestClient } from '../shared/request.js';
import type { CreateRiskRuleInput, PortfolioMode, RiskContext } from './risk.types.js';
const api = (client?: DesktopRequestClient) => riskManagementClient(parsedDesktopRequest(client));
export const fetchRiskRules = (
  options: { includeArchived?: boolean } = {},
  client?: DesktopRequestClient,
  signal?: AbortSignal,
) => api(client).getRules(options, signal);
export const fetchRiskEvents = (
  mode: PortfolioMode,
  client?: DesktopRequestClient,
  signal?: AbortSignal,
) => api(client).getEvents({ mode }, signal);
export const fetchRiskNotifications = (client?: DesktopRequestClient, signal?: AbortSignal) =>
  api(client).getNotifications(signal);
export const fetchNotificationRouting = (client?: DesktopRequestClient, signal?: AbortSignal) =>
  api(client).getRouting(signal);
export const createRiskRule = (input: CreateRiskRuleInput, client?: DesktopRequestClient) =>
  api(client).createRule(input);
export const patchRiskRule = (ruleId: string, patch: object, client?: DesktopRequestClient) =>
  api(client).patchRule(ruleId, patch);
export const deleteRiskRule = (ruleId: string, client?: DesktopRequestClient) =>
  api(client).archiveRule(ruleId);
export const restoreRiskRule = (ruleId: string, client?: DesktopRequestClient) =>
  api(client).restoreRule(ruleId);
export const testRiskRule = (
  ruleId: string,
  contexts: RiskContext[],
  client?: DesktopRequestClient,
) => api(client).testRule(ruleId, contexts);
export const scanRisk = (contexts: RiskContext[], scanId?: string, client?: DesktopRequestClient) =>
  api(client).scan({ security: contexts, ...(scanId ? { scanId } : {}) });
export const fetchRiskAudit = (
  ruleId: string,
  client?: DesktopRequestClient,
  signal?: AbortSignal,
) => api(client).getAudit(ruleId, signal);
