import { useRoute, type RouteProp } from '@react-navigation/native';
import type { PortfolioStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Copy, Page, Section } from '../../components/MobilePrimitives';
import { riskSeverities } from '../risk-rules/risk-rule-form';
export function RiskEventDetail() {
  const { params } = useRoute<RouteProp<PortfolioStackParams, 'RiskEventDetail'>>();
  const { mode } = useMobileRuntime();
  const event = params.event;
  if (event.mode !== mode)
    return (
      <Page title="风险事件">
        <Copy>事件不在当前范围，请返回列表。</Copy>
      </Page>
    );
  return (
    <Page title="风险事件详情">
      <Section title={event.message}>
        <Copy>
          {event.triggered ? '已触发' : '未触发'} ·{' '}
          {riskSeverities.find((row) => row.value === event.severity)?.label ?? '其他级别'}
        </Copy>
        <Copy>
          标的 {event.symbol ?? '无'} · 账户 {event.accountId ?? '组合'}
        </Copy>
        <Copy>
          触发值 {event.triggerValue ?? '—'} · 阈值 {event.threshold ?? '—'}
        </Copy>
        <Copy>
          行情时间 {event.marketTime ?? '未知'} · 评估时间 {event.evaluatedAt}
        </Copy>
        <Copy muted>
          事件 {event.id} · 规则 {event.ruleId} · 版本 {event.ruleVersion}
        </Copy>
        <Copy muted>扫描 {event.scanId ?? '未提供'}</Copy>
      </Section>
      <Section title="事件上下文">
        <Copy>{JSON.stringify(event.context, null, 2)}</Copy>
      </Section>
    </Page>
  );
}
