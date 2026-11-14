import type { JournalAiExplanation } from '@thesis-ledger/schemas';

type Result = NonNullable<JournalAiExplanation['result']>;

/** V1 历史引用与 V2 冻结证据使用各自的输出契约，不能互相伪造引用。 */
export function JournalAiResult({ result }: { result: Result }) {
  if (result.version === 1)
    return (
      <div className="flex min-w-0 flex-col gap-3 break-words">
        <p className="whitespace-pre-wrap text-sm leading-7">{result.conclusion}</p>
        {result.risks.length > 0 && (
          <p className="text-sm leading-6">风险：{result.risks.join('；')}</p>
        )}
        {result.unknowns.length > 0 && (
          <p className="text-sm leading-6">证据缺口与限制：{result.unknowns.join('；')}</p>
        )}
        {result.evidence.length > 0 && (
          <details>
            <summary className="cursor-pointer py-2 text-sm font-medium">
              核对历史论点与来源
            </summary>
            <div className="flex flex-col gap-3 py-3">
              {result.evidence.map((item, index) => (
                <div key={index}>
                  <p>{item.claim}</p>
                  <p className="break-all text-xs text-muted-foreground">
                    {item.citations
                      .map(
                        (citation) => `${citation.sourceId} · ${citation.toolCallId ?? '来源记录'}`,
                      )
                      .join('；')}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
        <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
      </div>
    );

  const inference = result.inference;
  const sourceByEvidenceId = new Map(
    result.evidenceBindings.map((binding) => [
      binding.audit.evidenceId,
      binding.audit.sourceIds.join('、'),
    ]),
  );
  return (
    <div className="flex min-w-0 flex-col gap-3 break-words">
      <p className="whitespace-pre-wrap text-sm leading-7">{inference.conclusion}</p>
      {inference.risks.length > 0 && (
        <p className="text-sm leading-6">风险：{inference.risks.join('；')}</p>
      )}
      {inference.unknowns.length > 0 && (
        <p className="text-sm leading-6">证据缺口与限制：{inference.unknowns.join('；')}</p>
      )}
      {[...new Set(inference.rationale)]
        .filter((reason) => reason !== inference.conclusion)
        .map((reason, index) => (
          <p key={'rationale-' + index} className="text-sm whitespace-pre-wrap leading-6">
            {reason}
          </p>
        ))}
      {inference.claims.length > 0 && (
        <details>
          <summary className="cursor-pointer py-2 text-sm font-medium">核对论点与证据</summary>
          <div className="flex flex-col gap-3 py-3">
            {inference.claims.map((claim) => (
              <div key={claim.id} className="grid gap-1">
                <p className="text-sm">{claim.description}</p>
                <p className="break-all text-xs text-muted-foreground">
                  依据：
                  {claim.evidenceIds.map((id) => sourceByEvidenceId.get(id) ?? id).join('；') ||
                    '未列出来源'}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
      {inference.invalidationConditions.length > 0 && (
        <p className="text-sm">
          失效条件：{inference.invalidationConditions.map((item) => item.description).join('；')}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{inference.disclaimer}</p>
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">完整解读与冻结字段</summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}
