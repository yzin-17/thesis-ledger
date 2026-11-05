import { useState } from 'react';
import type { ResearchReportComparison, ResearchReportSummary } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { formatFullDateTime } from './ai.display.js';
import { reportEvidenceLocator } from './research-report-display.js';
import { formatResearchComparisonValue } from './research-comparison-display.js';
import { ResearchEvidenceRead } from './ResearchEvidenceRead.js';
import { researchComparisonState, researchStateMeta } from './research-state-display.js';

type Evidence = ResearchReportComparison['evidence'][number];
const fieldStatuses = {
  unchanged: '未变',
  text_changed: '文字变化',
  value_changed: '字段变化',
} as const;
const descriptions = {
  opinion: '文字按原文逐字展示；字段改动不自动代表结论反转。',
  evidence: '按保存的资料指纹区分引用，分别核对前后报告的证据。',
  conditions: '保留各自的失效条件和交易日期限。',
  inputs: '比较保存的数据资料、质量与来源修订。',
  model: '模型与 Prompt 的版本变化单独列出。',
} as const;
function EvidenceSide({
  report,
  references,
  label,
}: {
  report: ResearchReportSummary;
  references: Evidence['before'];
  label: string;
}) {
  if (!references.length)
    return <p className="text-sm text-muted-foreground">此报告未引用该指纹。</p>;
  if (report.historicalScope.status !== 'known') return <p>报告范围未记录，无法核对引用。</p>;
  const locator = reportEvidenceLocator(report.historicalScope.snapshot);
  return (
    <div className="flex flex-col gap-2">
      {references.map((reference, index) => (
        <ResearchEvidenceRead
          key={reference.evidenceId}
          runId={report.id}
          referenceId={reference.evidenceId}
          locator={locator}
          label={`${label}证据 ${index + 1}`}
        />
      ))}
    </div>
  );
}
function EvidenceChanges({
  value,
  showAll,
}: {
  value: ResearchReportComparison;
  showAll: boolean;
}) {
  const [limit, setLimit] = useState(10);
  const items = value.evidence.filter((entry) => showAll || entry.status !== 'unchanged');
  const labels = { added: '新增引用', removed: '不再引用', unchanged: '指纹一致' } as const;
  return (
    <div className="flex flex-col gap-3">
      {!items.length && <p className="text-sm text-muted-foreground">引用证据的指纹保持一致。</p>}
      {items.slice(0, limit).map((entry) => (
        <section key={entry.fingerprint} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{labels[entry.status]}</Badge>
            <code className="break-all text-xs text-muted-foreground">{entry.fingerprint}</code>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">前一份报告</p>
              {value.previous && (
                <EvidenceSide
                  report={value.previous}
                  references={entry.before}
                  label="前一份报告"
                />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">当前报告</p>
              <EvidenceSide report={value.current} references={entry.after} label="当前报告" />
            </div>
          </div>
        </section>
      ))}
      {items.length > limit && (
        <Button type="button" variant="outline" onClick={() => setLimit((value) => value + 20)}>
          继续显示证据（已显示 {Math.min(limit, items.length)}/{items.length}）
        </Button>
      )}
    </div>
  );
}
function ReportPair({ value }: { value: ResearchReportComparison }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        { report: value.previous, label: '前一份报告' },
        { report: value.current, label: '当前报告' },
      ].map(
        ({ report, label }) =>
          report && (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium">{label}</p>
              <p className="break-words text-sm">{report.question || '问题未记录'}</p>
              <p className="text-xs text-muted-foreground">
                创建于 {formatFullDateTime(report.createdAt)}
              </p>
            </div>
          ),
      )}
    </div>
  );
}
export function ResearchComparisonResult({ value }: { value: ResearchReportComparison }) {
  const [showAll, setShowAll] = useState(false);
  const [audit, setAudit] = useState(false);
  if (value.status !== 'compared') {
    if (value.status === 'incompatible' || value.status === 'unavailable')
      return (
        <Alert>
          <AlertTitle>
            {value.status === 'incompatible' ? '报告范围不具备可比性' : '暂不具备比较资料'}
          </AlertTitle>
          <AlertDescription>
            <ul className="flex list-inside list-disc flex-col gap-1">
              {value.issues.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      );
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>
            {value.status === 'no_previous' ? '没有可比前序' : '前序查找尚未完成'}
          </EmptyTitle>
          <EmptyDescription>
            {value.issues.map((issue) => issue.message).join('；')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const changeState = researchComparisonState(value);
  return (
    <div className="flex flex-col gap-4" aria-label="报告比较结果">
      <ReportPair value={value} />
      {changeState && <Badge variant="secondary">{researchStateMeta[changeState].label}</Badge>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={showAll}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? '收起未变字段' : '显示未变字段'}
        </Button>
      </div>
      {value.groups.map((group) => (
        <Card key={group.key} role="region" aria-label={group.label}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {group.label}
              <Badge variant={group.status === 'changed' ? 'secondary' : 'outline'}>
                {group.status === 'changed' ? '存在变化' : '未变'}
              </Badge>
            </CardTitle>
            <CardDescription>{descriptions[group.key]}</CardDescription>
          </CardHeader>
          <CardContent>
            {group.key === 'evidence' ? (
              <EvidenceChanges value={value} showAll={showAll} />
            ) : (
              <div className="flex flex-col gap-4">
                {group.status === 'unchanged' && !showAll && (
                  <p className="text-sm text-muted-foreground">此维度的可比字段保持一致。</p>
                )}
                {group.fields
                  .filter((field) => showAll || field.status !== 'unchanged')
                  .map((field) => (
                    <section key={field.key} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-medium">{field.label}</h4>
                        <Badge variant="outline">{fieldStatuses[field.status]}</Badge>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {[
                          { label: '前一份报告', content: field.before },
                          { label: '当前报告', content: field.after },
                        ].map(({ label, content }) => (
                          <div key={label} className="flex min-w-0 flex-col gap-1">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="break-words whitespace-pre-wrap text-sm">
                              {formatResearchComparisonValue(field.key, content)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      <Button
        type="button"
        variant="link"
        className="justify-start"
        onClick={() => setAudit((value) => !value)}
        aria-expanded={audit}
      >
        {audit ? '收起冻结包摘要' : '查看冻结包摘要'}
      </Button>
      {audit && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            完整冻结包包含提交身份与执行设置，摘要不同不自动表示资料变化。
          </p>
          <p className="break-all font-mono text-xs">
            前一份：{value.frozenFingerprints.before ?? '未记录'}
          </p>
          <p className="break-all font-mono text-xs">
            当前：{value.frozenFingerprints.after ?? '未记录'}
          </p>
        </div>
      )}
    </div>
  );
}
