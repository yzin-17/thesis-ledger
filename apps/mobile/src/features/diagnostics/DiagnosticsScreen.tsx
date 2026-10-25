import { useState } from 'react';
import { Action, Choices, Copy, Field, Page, Section } from '../../components/MobilePrimitives';
import { HealthDiagnostics, QualityDiagnostics, NotificationDiagnostics } from './DiagnosticsViews';
export function DiagnosticsScreen() {
  const [kind, setKind] = useState<'health' | 'quality' | 'notifications'>('health');
  const [provider, setProvider] = useState('');
  const [detail, setDetail] = useState<unknown>(null);
  return (
    <Page title="来源与通知诊断">
      <Copy muted>
        重新读取只刷新诊断记录。通知失败记录和自动化运行历史分别查看，页面不会再次发送通知。
      </Copy>
      <Choices
        label="诊断类型"
        value={kind}
        options={[
          { value: 'health', label: '来源健康' },
          { value: 'quality', label: '数据质量' },
          { value: 'notifications', label: '通知失败' },
        ]}
        onChange={(value) => {
          setKind(value);
          setDetail(null);
        }}
      />
      <Field
        label="筛选来源名称（当前页）"
        value={provider}
        onChange={(value) => {
          setProvider(value);
          setDetail(null);
        }}
      />
      {kind === 'health' ? <HealthDiagnostics provider={provider} select={setDetail} /> : null}
      {kind === 'quality' ? <QualityDiagnostics provider={provider} select={setDetail} /> : null}
      {kind === 'notifications' ? (
        <NotificationDiagnostics provider={provider} select={setDetail} />
      ) : null}
      {detail ? (
        <Section title="诊断详情">
          <Copy>{JSON.stringify(detail, null, 2)}</Copy>
          <Action label="关闭诊断详情" onPress={() => setDetail(null)} />
        </Section>
      ) : null}
    </Page>
  );
}
