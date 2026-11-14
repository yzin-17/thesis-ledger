import type { ResearchResultV2, ResearchReportLocatorInput } from '@thesis-ledger/schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ResearchEvidenceRead } from './ResearchEvidenceRead.js';
import { formatFullDateTime } from './ai.display.js';
import { researchQualityReason } from './research-report-display.js';
function numericUnit(unit: string, currency: string | null) {
  const labels: Record<string, string> = {
    ratio: '比率',
    'position-unit': '持仓单位',
    version: '版本',
    price: '价格单位',
    'unit-nav': '单位净值',
    money: '金额',
    'cost-price-per-position-unit': '每持仓单位成本',
  };
  return currency ?? labels[unit] ?? `原始单位（${unit}）`;
}
export function ResearchTextSection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xl font-semibold">{title}</h3>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
export function ResearchInferenceSections({
  result,
  runId,
  locator,
}: {
  result: ResearchResultV2;
  runId: string;
  locator: ResearchReportLocatorInput;
}) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-2xl font-semibold tracking-tight">结论</h3>
        <p className="whitespace-pre-wrap text-base leading-7">{result.inference.conclusion}</p>
        <p className="text-xs text-muted-foreground">
          置信度：
          {
            { low: '低', medium: '中', high: '高', unassessed: '未评估' }[
              result.inference.confidence.level
            ]
          }
          。这是模型的自述判断。
        </p>
      </section>
      <ResearchTextSection title="重要风险" items={result.inference.risks} />
      <ResearchTextSection
        title="证据缺口与限制"
        items={[
          ...new Set([
            ...result.inference.unknowns,
            ...result.quality.reasons.map(researchQualityReason),
          ]),
        ]}
      />
      <ResearchTextSection
        title="关键依据"
        items={[...new Set(result.inference.rationale)].filter(
          (text) => text !== result.inference.conclusion,
        )}
      />
      {result.inference.claims.length > 0 && (
        <section className="flex min-w-0 flex-col gap-3" aria-label="论点与证据">
          {result.inference.claims.map((claim) => (
            <details key={claim.id} className="min-w-0">
              <summary className="cursor-pointer py-2 text-sm font-medium leading-6 break-words">
                {claim.description}
              </summary>
              <div className="flex flex-col gap-2 py-2">
                <p className="whitespace-pre-wrap text-sm leading-6">{claim.rationale}</p>
                {claim.evidenceIds.map((id) => (
                  <ResearchEvidenceRead
                    key={id}
                    runId={runId}
                    referenceId={id}
                    locator={locator}
                    label={`核对依据 ${result.evidenceBindings.findIndex((binding) => binding.audit.evidenceId === id) + 1}`}
                  />
                ))}
              </div>
            </details>
          ))}
        </section>
      )}
      <ResearchTextSection
        title="失效条件"
        items={result.inference.invalidationConditions.map((condition) => {
          if (condition.kind === 'unknown') return `${condition.description}：${condition.reason}`;
          if (condition.kind === 'qualitative') return `${condition.description}（人工复核）`;
          return `${condition.description}：${{ gt: '高于', gte: '不低于', lt: '低于', lte: '不高于' }[condition.operator]} ${condition.value} ${condition.currency}，观察 ${condition.tradingDays} 个交易日`;
        })}
      />
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">数值、假设与置信依据</summary>
        <div className="flex flex-col gap-4 py-3">
          <ResearchTextSection title="置信依据" items={result.inference.confidence.basis} />
          <ResearchTextSection
            title="数值与假设"
            items={result.inference.numericClaims.map((claim) => {
              if (claim.kind === 'field')
                return `${claim.description}：${claim.source.value} ${numericUnit(claim.source.unit, claim.source.currency)}`;
              return `${claim.description}：${claim.value} ${numericUnit(claim.unit, claim.currency)}；${claim.assumptions.join('；')}`;
            })}
          />
        </div>
      </details>
      <ResearchTextSection
        title="后续研究"
        items={result.inference.nextSteps.map((step) => step.description)}
      />
      <Separator />
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">
          全部材料与来源（{result.evidenceBindings.length}）
        </summary>
        <div className="flex flex-col gap-3">
          {result.evidenceBindings.map((binding, index) => (
            <ResearchEvidenceRead
              key={binding.audit.evidenceId}
              runId={runId}
              referenceId={binding.audit.evidenceId}
              locator={locator}
              label={`材料 ${index + 1} · ${binding.audit.providerId ?? '来源未记录'}`}
            />
          ))}
        </div>
      </details>
      <Alert>
        <AlertDescription>{result.inference.disclaimer}</AlertDescription>
      </Alert>
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">运行信息</summary>
        <dl className="grid gap-2 py-3 text-xs text-muted-foreground">
          <div>
            <dt>模型</dt>
            <dd>
              {result.model.providerId} / {result.model.modelId}
            </dd>
          </div>
          <div>
            <dt>材料截止时间</dt>
            <dd>{formatFullDateTime(result.dataCutoffAt)}</dd>
          </div>
          <div>
            <dt>报告生成时间</dt>
            <dd>{formatFullDateTime(result.createdAt)}</dd>
          </div>
        </dl>
      </details>
    </>
  );
}
