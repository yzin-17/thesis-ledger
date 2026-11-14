import { useRiskNotificationRoutingQuery } from './risk.queries.js';
import {
  riskRuleNotificationForm,
  type RuleNotificationForm,
} from './risk-rule-notification-form.js';

export function useRiskRuleNotification(draft?: RuleNotificationForm) {
  const query = useRiskNotificationRoutingQuery();
  let state: 'loading' | 'ready' | 'error' = 'ready';
  if (query.isPending) state = 'loading';
  else if (query.isError) state = 'error';
  const value = draft ?? riskRuleNotificationForm(null);
  return {
    value: { ...value, providers: value.providers ?? query.data?.selectedProviders ?? [] },
    routes: query.data?.availableRoutes ?? [],
    state,
    retry: () => void query.refetch(),
    errors: value.enabled && state !== 'ready' ? { notification: '请先重新读取通知提供方。' } : {},
  };
}
