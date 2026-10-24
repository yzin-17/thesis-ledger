import type { ResearchReportDetail } from '@thesis-ledger/schemas';
import { Action, Copy, Section } from '../../components/MobilePrimitives';
export function ResearchBody({
  report,
  evidence,
}: {
  report: ResearchReportDetail;
  evidence: (id: string) => void;
}) {
  const result = report.result;
  if (!result)
    return (
      <Copy muted>
        当前正文不可用：{report.errorSummary ?? report.errorCode ?? '尚未取得可展示的报告'}。
      </Copy>
    );
  if (result.version === 1)
    return (
      <>
        <Copy>{result.conclusion}</Copy>
        {result.evidence.map((e, i) => (
          <Section key={i} title={e.claim}>
            {e.citations.map((c, j) => (
              <Section key={j}>
                <Copy>
                  来源 {c.provider} · {c.sourceId} · {c.observedAt}
                </Copy>
                {c.toolCallId ? (
                  <Action
                    label={`查看引用 ${c.toolCallId}`}
                    onPress={() => evidence(c.toolCallId!)}
                  />
                ) : null}
              </Section>
            ))}
          </Section>
        ))}
        {result.risks.map((v, i) => (
          <Copy key={i}>风险：{v}</Copy>
        ))}
        {result.unknowns.map((v, i) => (
          <Copy key={i}>未知项：{v}</Copy>
        ))}
        <Copy muted>{result.disclaimer}</Copy>
      </>
    );
  const value = result.inference;
  return (
    <>
      <Copy>{value.conclusion}</Copy>
      <Copy>
        实际模型 {result.model.providerId} / {result.model.modelId}
      </Copy>
      <Copy>
        资料截止 {result.dataCutoffAt} · 生成 {result.createdAt}
      </Copy>
      {value.rationale.map((v, i) => (
        <Copy key={i}>{v}</Copy>
      ))}
      {value.claims.map((c) => (
        <Section key={c.id} title={c.description}>
          <Copy>{c.rationale}</Copy>
          {c.evidenceIds.map((id) => (
            <Action key={id} label={`查看引用 ${id}`} onPress={() => evidence(id)} />
          ))}
        </Section>
      ))}
      <Section title="数值与失效条件">
        {value.numericClaims.map((c, i) => (
          <Copy key={i}>
            {c.description}：{c.kind === 'field' ? c.source.value : c.value}{' '}
            {c.kind === 'field' ? c.source.unit : c.unit}
          </Copy>
        ))}
        {value.invalidationConditions.map((c) => (
          <Copy key={c.id}>{c.description}</Copy>
        ))}
      </Section>
      <Section title="后续步骤">
        {value.nextSteps.map((v, i) => (
          <Copy key={i}>{v.description}</Copy>
        ))}
      </Section>
      {value.risks.map((v, i) => (
        <Copy key={i}>风险：{v}</Copy>
      ))}
      {value.unknowns.map((v, i) => (
        <Copy key={i}>未知项：{v}</Copy>
      ))}
      <Copy muted>{value.disclaimer}</Copy>
    </>
  );
}
