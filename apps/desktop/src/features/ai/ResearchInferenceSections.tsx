import type { ResearchResultV2, ResearchReportLocatorInput } from '@thesis-ledger/schemas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ResearchEvidenceRead } from './ResearchEvidenceRead.js';
import { formatFullDateTime } from './ai.display.js';
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
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      {items.length ? (
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">本报告未列出此项。</p>
      )}
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
        <h3 className="font-semibold">结论</h3>
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
      <ResearchTextSection title="推理依据" items={result.inference.rationale} />
      <ResearchTextSection title="置信依据" items={result.inference.confidence.basis} />
      <ResearchTextSection
        title="研究断言"
        items={result.inference.claims.map((claim) => claim.description)}
      />
      <ResearchTextSection
        title="数值与假设"
        items={result.inference.numericClaims.map((claim) => {
          if (claim.kind === 'field')
            return `${claim.description}：${claim.source.value} ${numericUnit(claim.source.unit, claim.source.currency)}`;
          return `${claim.description}：${claim.value} ${numericUnit(claim.unit, claim.currency)}；${claim.assumptions.join('；')}`;
        })}
      />
      <ResearchTextSection
        title="失效条件"
        items={result.inference.invalidationConditions.map((condition) => {
          if (condition.kind === 'unknown') return `${condition.description}：${condition.reason}`;
          if (condition.kind === 'qualitative') return `${condition.description}（人工复核）`;
          return `${condition.description}：${{ gt: '高于', gte: '不低于', lt: '低于', lte: '不高于' }[condition.operator]} ${condition.value} ${condition.currency}，观察 ${condition.tradingDays} 个交易日`;
        })}
      />
      <ResearchTextSection title="主要风险" items={result.inference.risks} />
      <ResearchTextSection title="未知项" items={result.inference.unknowns} />
      <ResearchTextSection
        title="后续研究"
        items={result.inference.nextSteps.map((step) => step.description)}
      />
      <Separator />
      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">证据与来源</h3>
        {result.evidenceBindings.map((binding, index) => (
          <ResearchEvidenceRead
            key={binding.audit.evidenceId}
            runId={runId}
            referenceId={binding.audit.evidenceId}
            locator={locator}
            label={`材料 ${index + 1} · ${binding.audit.providerId ?? '来源未记录'}`}
          />
        ))}
      </section>
      <Alert>
        <AlertDescription>{result.inference.disclaimer}</AlertDescription>
      </Alert>
      <dl className="grid gap-2 text-xs text-muted-foreground">
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
    </>
  );
}
