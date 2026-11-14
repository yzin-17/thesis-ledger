import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Page, Action, Feedback } from '../src/components/MobilePrimitives';
import { RiskRuleForm } from '../src/features/risk-rules/RiskRuleForm';
import { RiskMonitoringSchedule } from '../src/features/risk-rules/RiskMonitoringSchedule';
import { RiskNotificationFields } from '../src/features/strategy-risk/RiskNotificationFields';
import {
  emptyRiskNotification,
  riskNotificationBody,
} from '../src/features/strategy-risk/risk-notification-model';
const mode = new URLSearchParams(location.search).get('mode');
const sample = {
  id: '22222222-2222-4222-8222-222222222222',
  version: 1,
  kind: 'price-below',
  scope: 'security',
  severity: 'warning',
  threshold: 3,
  enabled: false,
  archivedAt: null,
  needsRepair: false,
  repairReason: null,
  symbol: '600519.SH',
  accountId: null,
  effectiveAt: '2026-11-12T00:00:00Z',
  notification: { enabled: true, cooldownMinutes: 90, providers: ['备用通知'] },
};
function StrategyFields() {
  const [value, setValue] = useState(() => ({ ...emptyRiskNotification(), enabled: true }));
  const [message, setMessage] = useState<string | null>(null);
  return (
    <Page title="策略通知设置">
      <RiskNotificationFields value={value} onChange={setValue} disabled={false} />
      <Action
        label="保存通知设置"
        onPress={() =>
          void fetch('/api/qa/mobile-notification', {
            method: 'POST',
            body: JSON.stringify(riskNotificationBody(value)),
          }).then((response) => setMessage(response.ok ? '通知设置已保存' : '保存失败，输入保留'))
        }
      />
      <Feedback message={message} />
    </Page>
  );
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function Scenario() {
  if (mode === 'monitoring')
    return (
      <Page title="风险中心">
        <RiskMonitoringSchedule enabledRules={2} />
      </Page>
    );
  if (mode === 'strategy') return <StrategyFields />;
  return (
    <Page title="风险规则">
      <RiskRuleForm
        {...(mode === 'edit' ? { rule: sample as never } : {})}
        accounts={[]}
        portfolio={
          {
            positions: [
              {
                symbol: '600519.SH',
                accountId: '11111111-1111-4111-8111-111111111111',
                asset: { name: '样本标的' },
              },
            ],
          } as never
        }
        readable
        reload={async () => (mode === 'edit' ? [sample as never] : [])}
      />
    </Page>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <Scenario />
  </QueryClientProvider>,
);
