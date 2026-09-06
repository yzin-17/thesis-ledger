import { useQuery } from '@tanstack/react-query';
import {
  fetchRiskAudit,
  fetchRiskEvents,
  fetchNotificationRouting,
  fetchRiskNotifications,
  fetchRiskRules,
} from './risk.api.js';
import type { DesktopRequestClient } from '../shared/request.js';
import type { PortfolioMode } from './risk.types.js';

export const riskKeys = {
  root: ['desktop', 'risk'] as const,
  rules: () => [...riskKeys.root, 'rules'] as const,
  events: (mode: PortfolioMode) => [...riskKeys.root, 'events', mode] as const,
  notifications: () => [...riskKeys.root, 'notifications'] as const,
  notificationRouting: () => [...riskKeys.root, 'notification-routing'] as const,
  audit: (ruleId: string) => [...riskKeys.root, 'audit', ruleId] as const,
};

export const riskAuditQueryOptions = (ruleId: string | null, client?: DesktopRequestClient) => ({
  queryKey: riskKeys.audit(ruleId ?? 'idle'),
  queryFn: () => {
    if (!ruleId) throw new Error('risk audit rule id is required');
    return fetchRiskAudit(ruleId, client);
  },
  enabled: Boolean(ruleId),
});

export const useRiskQueries = (mode: PortfolioMode) => {
  // 一次拉取含归档的全量规则，工作台在本地按 archivedAt 分组展示，
  // 避免切换“显示已归档”时反复请求。
  const rules = useQuery({
    queryKey: riskKeys.rules(),
    queryFn: () => fetchRiskRules({ includeArchived: true }),
  });
  const events = useQuery({
    queryKey: riskKeys.events(mode),
    queryFn: () => fetchRiskEvents(mode),
  });
  const notifications = useQuery({
    queryKey: riskKeys.notifications(),
    queryFn: () => fetchRiskNotifications(),
  });
  return { rules, events, notifications };
};

export const useNotificationRoutingQuery = () =>
  useQuery({
    queryKey: riskKeys.notificationRouting(),
    queryFn: () => fetchNotificationRouting(),
  });

export const useRiskAuditQuery = (ruleId: string | null) => useQuery(riskAuditQueryOptions(ruleId));
