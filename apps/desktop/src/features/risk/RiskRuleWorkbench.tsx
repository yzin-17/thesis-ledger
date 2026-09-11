import { useEffect, useMemo, useState } from 'react';
import { ArchiveIcon, PlayIcon, PlusIcon, RotateCcwIcon } from 'lucide-react';
import type { RiskEvaluationResponseV1, RiskRuleV1 } from '@thesis-ledger/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToastManager } from '@/components/ui/toast';
import {
  riskRuleKindLabel,
  riskScopeLabel,
  riskSeverityLabel,
  riskSeverityTone,
  ruleStatusLabel,
  ruleStatusTone,
} from './risk.labels.js';
import { RiskRuleEditorSheet } from './RiskRuleEditorSheet.js';
import {
  useArchiveRiskRuleMutation,
  usePatchRiskRuleMutation,
  useRestoreRiskRuleMutation,
  useTestRiskRuleMutation,
} from './risk.mutations.js';
import { useRiskAuditQuery, useRiskRulesQuery } from './risk.queries.js';
import type { Account, RiskRuleDraft } from './risk.types.js';
import { riskRuleDraftFromRule } from './risk.utils.js';
import { cn } from '@/lib/utils';

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
};

const formatThreshold = (kind: RiskRuleV1['kind'], threshold: RiskRuleV1['threshold']) => {
  if (kind === 'STOP_LOSS' || kind === 'TAKE_PROFIT' || kind === 'DRAWDOWN_LIMIT')
    return `${threshold}%`;
  if (kind === 'POSITION_LIMIT' || kind === 'SINGLE_POSITION_LIMIT') return `${threshold}%`;
  return threshold;
};

const ruleTargetLabel = (rule: RiskRuleV1, accountName: string, assetName?: string | null) => {
  if (rule.scope === 'PORTFOLIO') return accountName;
  return assetName ?? rule.symbol ?? '未绑定标的';
};

const auditActionLabel = (action: string) => {
  const labels: Record<string, string> = {
    CREATED: '创建',
    UPDATED: '更新',
    ENABLED: '启用',
    DISABLED: '停用',
    ARCHIVED: '归档',
    RESTORED: '恢复',
    TESTED: '测试',
  };
  return labels[action] ?? action;
};

const actorLabel = (actor: string) => {
  if (actor === 'desktop') return '桌面端';
  if (actor === 'system') return '系统';
  return actor;
};

function StatusDot({ status }: { status: RiskEvaluationResponseV1['status'] }) {
  const className =
    status === 'TRIGGERED'
      ? 'bg-destructive'
      : status === 'OK'
        ? 'bg-foreground'
        : status === 'STALE'
          ? 'bg-amber-500'
          : 'bg-muted-foreground';
  return <span className={cn('inline-block size-2 rounded-full', className)} />;
}

function AuditList({ ruleId }: { ruleId: string }) {
  const auditQuery = useRiskAuditQuery(ruleId);
  if (auditQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (auditQuery.isError) {
    return <p className="text-sm text-destructive">{auditQuery.error.message}</p>;
  }
  if (!auditQuery.data?.length) {
    return <p className="text-sm text-muted-foreground">暂无审计记录。</p>;
  }
  return (
    <div className="space-y-2">
      {auditQuery.data.map((item) => (
        <div key={item.id} className="rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{auditActionLabel(item.action)}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}</span>
          </div>
          <p className="mt-1 mb-0 text-xs text-muted-foreground">
            {actorLabel(item.actor)} · v{item.version}
          </p>
          {item.summary ? <p className="mt-2 mb-0 text-sm">{item.summary}</p> : null}
        </div>
      ))}
    </div>
  );
}

function TestResultList({ results }: { results: RiskEvaluationResponseV1[] }) {
  if (!results.length) {
    return <p className="text-sm text-muted-foreground">运行测试后会在这里显示逐规则结果。</p>;
  }
  return (
    <div className="space-y-2">
      {results.map((result) => (
        <div key={`${result.ruleId}:${result.evaluatedAt}`} className="rounded-lg border p-3 text-sm">
          <div className="flex items-center gap-2">
            <StatusDot status={result.status} />
            <span className="font-medium">{result.message}</span>
          </div>
          <p className="mt-1 mb-0 text-xs text-muted-foreground">
            {result.currentValue === null ? '当前值不可用' : `当前值 ${result.currentValue}`} ·{' '}
            {formatDateTime(result.evaluatedAt)}
          </p>
        </div>
      ))}
    </div>
  );
}

function RuleList({
  rules,
  accounts,
  selectedRuleId,
  onSelect,
}: {
  rules: RiskRuleV1[];
  accounts: Account[];
  selectedRuleId: string | null;
  onSelect: (ruleId: string) => void;
}) {
  if (!rules.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>暂无风险规则</EmptyTitle>
          <EmptyDescription>创建第一条规则后，可在这里测试、启停和审计。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="space-y-2">
      {rules.map((rule) => {
        const accountName = accounts.find((account) => account.id === rule.accountId)?.name ?? '未知账户';
        return (
          <button
            key={rule.id}
            type="button"
            className={cn(
              'w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
              selectedRuleId === rule.id && 'border-foreground bg-muted/40',
            )}
            onClick={() => onSelect(rule.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{riskRuleKindLabel(rule.kind)}</span>
                  <Badge variant={ruleStatusTone(rule)}>{ruleStatusLabel(rule)}</Badge>
                </div>
                <p className="mt-1 mb-0 truncate text-xs text-muted-foreground">
                  {riskScopeLabel(rule.scope)} · {ruleTargetLabel(rule, accountName, rule.assetName)}
                </p>
              </div>
              <Badge variant={riskSeverityTone(rule.severity)}>
                {riskSeverityLabel(rule.severity)}
              </Badge>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RuleDetail({
  rule,
  accountName,
  testResults,
  busyAction,
  onEdit,
  onToggle,
  onArchive,
  onRestore,
  onTest,
  onAudit,
}: {
  rule: RiskRuleV1;
  accountName: string;
  testResults: RiskEvaluationResponseV1[];
  busyAction: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onTest: () => void;
  onAudit: () => void;
}) {
  const testing = busyAction === `test:${rule.id}`;
  const toggling = busyAction === `patch:${rule.id}`;
  const archiving = busyAction === `archive:${rule.id}`;
  const restoring = busyAction === `restore:${rule.id}`;
  const triggered = testResults.filter((result) => result.triggered).length;
  const targetLabel = ruleTargetLabel(rule, accountName, rule.assetName);
  const archivedAt = rule.archivedAt;
  const archived = archivedAt != null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-xl font-semibold">{riskRuleKindLabel(rule.kind)}</h3>
            <Badge variant={ruleStatusTone(rule)}>{ruleStatusLabel(rule)}</Badge>
            {rule.needsRepair && <Badge variant="destructive">需补齐账户和标的</Badge>}
            <Badge variant={riskSeverityTone(rule.severity)}>
              {riskSeverityLabel(rule.severity)}
            </Badge>
          </div>
          <p className="mt-2 mb-0 text-sm text-muted-foreground">
            {riskScopeLabel(rule.scope)} · {targetLabel}
          </p>
          {rule.needsRepair && (
            <p className="mt-2 mb-0 text-sm text-destructive">
              这条旧规则缺少账户绑定，编辑并补齐账户和标的后才能恢复。
            </p>
          )}
          {archived && (
            <p className="mt-2 mb-0 text-sm text-muted-foreground">
              这条规则已于 {formatDateTime(archivedAt)} 归档，不再出现在默认列表中；
              恢复后会保持停用状态。
            </p>
          )}
        </div>
        <span className="text-sm font-medium text-muted-foreground">v{rule.version}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">阈值</dt>
          <dd className="mt-1 font-medium">{formatThreshold(rule.kind, rule.threshold)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">生效时间</dt>
          <dd className="mt-1 font-medium">{formatDateTime(rule.effectiveAt)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {archived ? (
          <Button
            type="button"
            variant="outline"
            className="secondary"
            disabled={restoring || rule.needsRepair}
            onClick={onRestore}
          >
            <RotateCcwIcon className="size-4" />
            恢复规则
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onEdit}>
              编辑规则
            </Button>
            <Button type="button" variant="outline" disabled={toggling} onClick={onToggle}>
              {rule.enabled ? '停用' : '启用'}
            </Button>
            <Button type="button" variant="outline" disabled={testing} onClick={onTest}>
              <PlayIcon className="size-4" />
              测试规则
            </Button>
            <Button type="button" variant="outline" onClick={onAudit}>
              查看审计
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={archiving}
              onClick={onArchive}
            >
              <ArchiveIcon className="size-4" />
              归档
            </Button>
          </>
        )}
      </div>

      {testResults.length > 0 ? (
        <div className="rounded-lg border p-4">
          <p className="m-0 text-sm font-medium">最近一次测试：{triggered} 条触发</p>
          <div className="mt-3">
            <TestResultList results={testResults} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RiskRuleWorkbench({ accounts }: { accounts: Account[] }) {
  const toast = useToastManager();
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [severity, setSeverity] = useState<string>('all');
  const [status, setStatus] = useState<string>('active');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<RiskRuleDraft | null>(null);
  const [testResults, setTestResults] = useState<Record<string, RiskEvaluationResponseV1[]>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const rulesQuery = useRiskRulesQuery({ includeArchived });
  const patchMutation = usePatchRiskRuleMutation();
  const archiveMutation = useArchiveRiskRuleMutation();
  const restoreMutation = useRestoreRiskRuleMutation();
  const testMutation = useTestRiskRuleMutation();

  const rules = useMemo(() => {
    const rows = rulesQuery.data ?? [];
    return rows.filter((rule) => {
      if (severity !== 'all' && rule.severity !== severity) return false;
      if (status === 'enabled' && !rule.enabled) return false;
      if (status === 'disabled' && rule.enabled) return false;
      if (status === 'active' && rule.archivedAt != null) return false;
      return true;
    });
  }, [rulesQuery.data, severity, status]);

  useEffect(() => {
    if (!rules.length) {
      setSelectedRuleId(null);
      return;
    }
    if (!selectedRuleId || !rules.some((rule) => rule.id === selectedRuleId)) {
      setSelectedRuleId(rules[0]?.id ?? null);
    }
  }, [rules, selectedRuleId]);

  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ?? null;
  const selectedAccountName =
    accounts.find((account) => account.id === selectedRule?.accountId)?.name ?? '未知账户';

  const openCreate = () => {
    setEditingDraft(null);
    setEditorOpen(true);
  };

  const openEdit = () => {
    if (!selectedRule) return;
    setEditingDraft(riskRuleDraftFromRule(selectedRule));
    setEditorOpen(true);
  };

  const handleToggle = async () => {
    if (!selectedRule) return;
    setBusyAction(`patch:${selectedRule.id}`);
    try {
      await patchMutation.mutateAsync({ id: selectedRule.id, enabled: !selectedRule.enabled });
    } catch (error) {
      toast.show({
        title: '更新风险规则失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleArchive = async () => {
    if (!selectedRule) return;
    setBusyAction(`archive:${selectedRule.id}`);
    try {
      await archiveMutation.mutateAsync(selectedRule.id);
    } catch (error) {
      toast.show({
        title: '归档风险规则失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRestore = async () => {
    if (!selectedRule) return;
    setBusyAction(`restore:${selectedRule.id}`);
    try {
      await restoreMutation.mutateAsync(selectedRule.id);
    } catch (error) {
      toast.show({
        title: '恢复风险规则失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleTest = async () => {
    if (!selectedRule) return;
    setBusyAction(`test:${selectedRule.id}`);
    try {
      const response = await testMutation.mutateAsync(selectedRule.id);
      setTestResults((current) => ({ ...current, [selectedRule.id]: response }));
    } catch (error) {
      toast.show({
        title: '测试风险规则失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold">风险规则</h2>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">
            管理止损、止盈、回撤和仓位约束，并保留规则测试与审计记录。
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <PlusIcon className="size-4" />
          新建规则
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="全部严重度" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部严重度</SelectItem>
            <SelectItem value="INFO">提示</SelectItem>
            <SelectItem value="WARNING">警告</SelectItem>
            <SelectItem value="CRITICAL">严重</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">未归档</SelectItem>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="enabled">已启用</SelectItem>
            <SelectItem value="disabled">已停用</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={includeArchived} onCheckedChange={(checked) => setIncludeArchived(checked === true)} />
          包含已归档
        </label>
      </div>

      {rulesQuery.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : rulesQuery.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{rulesQuery.error.message}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card>
            <CardContent className="p-3">
              <RuleList
                rules={rules}
                accounts={accounts}
                selectedRuleId={selectedRuleId}
                onSelect={setSelectedRuleId}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              {selectedRule ? (
                <Tabs defaultValue="rule">
                  <TabsList>
                    <TabsTrigger value="rule">规则</TabsTrigger>
                    <TabsTrigger value="audit">审计</TabsTrigger>
                  </TabsList>
                  <TabsContent value="rule" className="pt-4">
                    <RuleDetail
                      rule={selectedRule}
                      accountName={selectedAccountName}
                      testResults={testResults[selectedRule.id] ?? []}
                      busyAction={busyAction}
                      onEdit={openEdit}
                      onToggle={() => void handleToggle()}
                      onArchive={() => void handleArchive()}
                      onRestore={() => void handleRestore()}
                      onTest={() => void handleTest()}
                      onAudit={() => undefined}
                    />
                  </TabsContent>
                  <TabsContent value="audit" className="pt-4">
                    <AuditList ruleId={selectedRule.id} />
                  </TabsContent>
                </Tabs>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>选择一条风险规则</EmptyTitle>
                    <EmptyDescription>在左侧选择规则后查看详细配置。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <RiskRuleEditorSheet
        accounts={accounts}
        initialDraft={editingDraft}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </div>
  );
}
