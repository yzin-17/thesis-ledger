import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { LoaderCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { Account } from '../portfolio/portfolio.types.js';
import { isDataLoaded } from '../shared/display.js';
import type { LoadState } from '../shared/types.js';
import type {
  CreateRiskRuleInput,
  RiskRuleRecord,
  RiskTestRecord,
  RiskTestResult,
} from './risk.types.js';
import {
  formatDateTime,
  formatThreshold,
  riskRuleKindLabel,
  riskScopeLabel,
  riskSeverityLabel,
  riskSeverityTone,
  riskTestRecordForRule,
  ruleTargetLabel,
} from './risk.format.js';
import { RiskRuleEditorSheet } from './RiskRuleEditorSheet.js';

const toggleRuleLabel = (toggling: boolean, enabled: boolean) => {
  if (toggling) return '更新中…';
  return enabled ? '停用规则' : '启用规则';
};

const testResultMessage = (result: RiskTestResult) => {
  if (result.message) return result.message;
  return result.triggered ? '已触发' : '未触发';
};

export function RiskRuleWorkbench({
  rules,
  accounts,
  loadState,
  busyAction,
  onCreate,
  onUpdate,
  onToggle,
  onArchive,
  onTest,
  testRecords,
  onTestComplete,
  onAudit,
}: {
  rules: RiskRuleRecord[];
  accounts: Account[];
  loadState: LoadState;
  busyAction: string | null;
  onCreate: (input: CreateRiskRuleInput) => Promise<boolean>;
  onUpdate: (ruleId: string, input: CreateRiskRuleInput) => Promise<boolean>;
  onToggle: (rule: RiskRuleRecord) => Promise<boolean>;
  onArchive: (rule: RiskRuleRecord) => Promise<boolean>;
  onTest: (rule: RiskRuleRecord) => Promise<RiskTestResult[] | null>;
  testRecords: Record<string, RiskTestRecord>;
  onTestComplete: (rule: RiskRuleRecord, results: RiskTestResult[]) => void;
  onAudit: (rule: RiskRuleRecord) => void;
}) {
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(rules[0]?.id ?? null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RiskRuleRecord | null>(null);
  const [archiveRule, setArchiveRule] = useState<RiskRuleRecord | null>(null);

  useEffect(() => {
    if (selectedRuleId && rules.some((rule) => rule.id === selectedRuleId)) return;
    setSelectedRuleId(rules[0]?.id ?? null);
  }, [rules, selectedRuleId]);

  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ?? null;
  const selectedTestRecord = selectedRule ? riskTestRecordForRule(testRecords, selectedRule) : null;
  const canCreate = busyAction === null;
  const empty = isDataLoaded(loadState) && rules.length === 0;

  const openCreate = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const openEdit = () => {
    if (!selectedRule) return;
    setEditingRule(selectedRule);
    setEditorOpen(true);
  };

  const submitEditor = async (input: CreateRiskRuleInput) => {
    if (editingRule) return onUpdate(editingRule.id, input);
    return onCreate(input);
  };

  const runTest = async () => {
    if (!selectedRule) return;
    const result = await onTest(selectedRule);
    if (!result) return;
    onTestComplete(selectedRule, result);
  };

  const confirmArchive = async () => {
    if (!archiveRule) return;
    const archived = await onArchive(archiveRule);
    if (archived) setArchiveRule(null);
  };

  return (
    <>
      <section className="panel mt-0">
        <div className="panel-heading flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2>规则工作台</h2>
            <p>规则全局共用；修改、启停和归档都会递增版本并写入审计。</p>
          </div>
          <Button type="button" disabled={!canCreate} onClick={openCreate}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            新建规则
          </Button>
        </div>

        {empty ? (
          <Empty className="min-h-40 rounded-lg border border-dashed p-8">
            <EmptyTitle>还没有风险规则</EmptyTitle>
            <EmptyDescription>创建第一条规则后，它会在这里集中管理。</EmptyDescription>
            <Button type="button" onClick={openCreate}>
              创建第一条规则
            </Button>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
            <aside
              className="flex min-h-64 flex-col gap-2 rounded-lg border border-border bg-card p-2"
              aria-label="风险规则列表"
            >
              <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="text-xs font-medium text-muted-foreground">全部规则</span>
                <Badge variant="outline">{rules.length}</Badge>
              </div>
              {rules.map((rule) => {
                const selected = rule.id === selectedRuleId;
                return (
                  <Button
                    key={rule.id}
                    type="button"
                    variant={selected ? 'secondary' : 'ghost'}
                    className={cn(
                      'h-auto min-h-16 justify-start whitespace-normal px-3 py-2 text-left',
                      selected && 'ring-1 ring-border',
                    )}
                    onClick={() => setSelectedRuleId(rule.id)}
                    aria-current={selected ? 'true' : undefined}
                  >
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate font-medium">{riskRuleKindLabel(rule.kind)}</span>
                        <Badge variant={rule.enabled ? 'secondary' : 'outline'}>
                          {rule.enabled ? '启用' : '已停用'}
                        </Badge>
                      </span>
                      <span className="w-full truncate text-xs text-muted-foreground">
                        {ruleTargetLabel(rule)} · v{rule.version}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </aside>

            <div className="min-w-0 rounded-lg border border-border bg-card p-5">
              {selectedRule ? (
                <RuleDetail
                  rule={selectedRule}
                  testResults={selectedTestRecord?.results ?? []}
                  testTime={selectedTestRecord?.testedAt ?? null}
                  busyAction={busyAction}
                  onEdit={openEdit}
                  onToggle={() => void onToggle(selectedRule)}
                  onArchive={() => setArchiveRule(selectedRule)}
                  onTest={() => void runTest()}
                  onAudit={() => onAudit(selectedRule)}
                />
              ) : (
                <Empty className="min-h-40 border-0 p-8">
                  <EmptyDescription>选择一条规则查看详情。</EmptyDescription>
                </Empty>
              )}
            </div>
          </div>
        )}
      </section>

      <RiskRuleEditorSheet
        open={editorOpen}
        rule={editingRule}
        accounts={accounts}
        pending={busyAction === 'create-rule' || busyAction === `patch:${editingRule?.id ?? ''}`}
        onOpenChange={setEditorOpen}
        onSubmit={submitEditor}
      />

      <AlertDialog
        open={Boolean(archiveRule)}
        onOpenChange={(open) => !open && setArchiveRule(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>归档风险规则？</AlertDialogTitle>
            <AlertDialogDescription>
              归档“{archiveRule ? riskRuleKindLabel(archiveRule.kind) : ''}
              ”后会停用规则，但不会删除历史事件和审计记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              render={<Button type="button" variant="outline" className="secondary" />}
            >
              取消
            </AlertDialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={busyAction === `archive:${archiveRule?.id ?? ''}`}
              aria-busy={busyAction === `archive:${archiveRule?.id ?? ''}`}
              onClick={() => void confirmArchive()}
            >
              {busyAction === `archive:${archiveRule?.id ?? ''}` && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {busyAction === `archive:${archiveRule?.id ?? ''}` ? '归档中…' : '确认归档'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RuleDetail({
  rule,
  testResults,
  testTime,
  busyAction,
  onEdit,
  onToggle,
  onArchive,
  onTest,
  onAudit,
}: {
  rule: RiskRuleRecord;
  testResults: RiskTestResult[];
  testTime: string | null;
  busyAction: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onArchive: () => void;
  onTest: () => void;
  onAudit: () => void;
}) {
  const testing = busyAction === `test:${rule.id}`;
  const toggling = busyAction === `patch:${rule.id}`;
  const archiving = busyAction === `archive:${rule.id}`;
  const triggered = testResults.filter((result) => result.triggered).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-xl font-semibold">{riskRuleKindLabel(rule.kind)}</h3>
            <Badge variant={rule.enabled ? 'secondary' : 'outline'}>
              {rule.enabled ? '已启用' : '已停用'}
            </Badge>
            <Badge variant={riskSeverityTone(rule.severity)}>
              {riskSeverityLabel(rule.severity)}
            </Badge>
          </div>
          <p className="mt-2 mb-0 text-sm text-muted-foreground">
            {riskScopeLabel(rule.scope)} · {ruleTargetLabel(rule)}
          </p>
        </div>
        <span className="text-sm font-medium text-muted-foreground">v{rule.version}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">阈值</dt>
          <dd className="mt-1 font-medium">{formatThreshold(rule.kind, rule.threshold)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">范围</dt>
          <dd className="mt-1 font-medium">{riskScopeLabel(rule.scope)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">目标</dt>
          <dd className="mt-1 truncate font-medium" title={ruleTargetLabel(rule)}>
            {ruleTargetLabel(rule)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">生效时间</dt>
          <dd className="mt-1 font-medium">{formatDateTime(rule.effectiveAt)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="secondary"
          disabled={busyAction !== null}
          onClick={onTest}
          aria-busy={testing}
        >
          {testing && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {testing ? '测试中…' : '人工测试'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="secondary"
          disabled={busyAction !== null}
          onClick={onEdit}
        >
          编辑规则
        </Button>
        <Button
          type="button"
          variant="outline"
          className="secondary"
          disabled={busyAction !== null}
          onClick={onToggle}
          aria-busy={toggling}
        >
          {toggling && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {toggleRuleLabel(toggling, rule.enabled)}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="secondary"
          disabled={busyAction !== null}
          onClick={onArchive}
          aria-busy={archiving}
        >
          归档规则
        </Button>
        <Button
          type="button"
          variant="link"
          className="text-button"
          disabled={busyAction !== null}
          onClick={onAudit}
        >
          查看审计
        </Button>
      </div>

      <section className="rounded-lg border border-border p-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="m-0 text-sm font-semibold">最近一次人工测试</h4>
            <p className="mt-1 mb-0 text-xs text-muted-foreground">
              {testTime ? `测试时间：${formatDateTime(testTime)}` : '尚未测试；结果会保留在此处。'}
            </p>
          </div>
          {testResults.length > 0 && (
            <Badge variant={triggered > 0 ? 'destructive' : 'secondary'}>{triggered} 个触发</Badge>
          )}
        </div>
        {testResults.length === 0 ? (
          <p className="mt-4 mb-0 text-sm text-muted-foreground">
            点击“人工测试”后查看当前组合上下文的判断结果。
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {testResults.slice(0, 6).map((result, index) => (
              <div
                key={result.id ?? `${rule.id}-test-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
              >
                <span>{testResultMessage(result)}</span>
                <Badge variant={result.triggered ? 'destructive' : 'secondary'}>
                  {result.triggered ? '触发' : '未触发'}
                </Badge>
              </div>
            ))}
            {testResults.length > 6 && <p className="field-hint">仅展示前 6 条结果。</p>}
          </div>
        )}
      </section>
    </div>
  );
}
