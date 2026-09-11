import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { strategySchemaV2 } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAccounts } from '../portfolio/portfolio.api.js';
import {
  createStrategyRiskApplication,
  fetchStrategyRiskApplications,
  previewStrategyRiskApplication,
  updateStrategyRiskApplication,
  type RiskApplicationPreview,
} from './strategy-optimization.api.js';
import type { StrategyRecord } from './strategy.types.js';

const riskApplicationKey = ['desktop', 'strategy', 'risk-applications'] as const;

const stateLabel: Record<RiskApplicationPreview['evaluations'][number]['state'], string> = {
  triggered: '已触发',
  not_triggered: '未触发',
  unavailable: '不可用',
  not_applicable: '不适用',
};

export function StrategyRiskApplicationPanel({ strategies }: { strategies: StrategyRecord[] }) {
  const queryClient = useQueryClient();
  const versions = useMemo(
    () =>
      strategies.flatMap((strategy) =>
        strategy.versions
          .filter((version) => version.version > 0 && version.schemaVersion === 2 && version.schema)
          .map((version) => ({ strategy, version })),
      ),
    [strategies],
  );
  const [strategyVersionId, setStrategyVersionId] = useState(versions[0]?.version.id ?? '');
  const [accountId, setAccountId] = useState('');
  const [cycleMode, setCycleMode] = useState<'existingAndFuture' | 'nextPositionCycle'>(
    'existingAndFuture',
  );
  const [preview, setPreview] = useState<RiskApplicationPreview | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const selected = versions.find((entry) => entry.version.id === strategyVersionId) ?? versions[0];
  const parsed = selected?.version.schema ? strategySchemaV2.safeParse(selected.version.schema) : null;
  const symbol = parsed?.success ? parsed.data.executionInstrument.symbol : '';

  const accounts = useQuery({ queryKey: ['desktop', 'accounts'], queryFn: () => fetchAccounts() });
  const applications = useQuery({
    queryKey: [...riskApplicationKey, accountId, symbol],
    queryFn: () => fetchStrategyRiskApplications(accountId || undefined, symbol || undefined),
    enabled: Boolean(accountId && symbol),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      previewStrategyRiskApplication({ strategyVersionId, accountId, symbol, cycleMode }),
    onSuccess: (result) => {
      setPreview(result);
      setFeedback(null);
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '风险规则预览失败'),
  });

  const createMutation = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!preview) throw new Error('请先生成预览');
      return createStrategyRiskApplication({
        strategyVersionId,
        accountId,
        symbol,
        cycleMode,
        previewHash: preview.previewHash,
        idempotencyKey: crypto.randomUUID(),
        enabled,
        notification: { enabled: true, cooldownMinutes: 60 },
      });
    },
    onSuccess: async (application) => {
      setFeedback(application.enabled ? '风险应用已创建并启用。' : '风险应用已创建，当前保持停用。');
      await queryClient.invalidateQueries({ queryKey: riskApplicationKey });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '创建风险应用失败'),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; revision: number; enabled: boolean }) =>
      updateStrategyRiskApplication(input.id, {
        expectedRevision: input.revision,
        enabled: input.enabled,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: riskApplicationKey });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '更新风险应用失败'),
  });

  if (versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>策略风险规则</CardTitle>
          <CardDescription>至少需要一个正式 V2 策略版本后才能生成实际风险监控规则。</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>策略风险规则</CardTitle>
          <CardDescription>
            从正式 V2 策略确定性生成监控规则；创建前先用当前账户持仓、成本与已完成行情做预览。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">策略版本</span>
              <Select
                value={strategyVersionId}
                onValueChange={(value) => {
                  if (value) {
                    setStrategyVersionId(value);
                    setPreview(null);
                  }
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {versions.map(({ strategy, version }) => (
                    <SelectItem key={version.id} value={version.id}>
                      {strategy.name} · v{version.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">实际账户</span>
              <Select value={accountId} onValueChange={(value) => value && setAccountId(value)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="选择账户" /></SelectTrigger>
                <SelectContent>
                  {(accounts.data ?? []).filter((account) => account.mode === 'actual').map((account) => (
                    <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">生效周期</span>
              <Select value={cycleMode} onValueChange={(value) => value && setCycleMode(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="existingAndFuture">当前及未来持仓周期</SelectItem>
                  <SelectItem value="nextPositionCycle">仅下一持仓周期</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">执行标的 {symbol || '—'}</Badge>
            <Button
              variant="outline"
              disabled={!accountId || !symbol || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? '生成中…' : '预览风险规则'}
            </Button>
          </div>
          {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>应用预览</CardTitle>
            <CardDescription>
              已映射 {preview.plan.coverage.riskMapped}/{preview.plan.coverage.riskTotal} 项风险约束；技术离场条件不会被冒充为实时风险规则。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview.plan.rules.map((rule) => {
              const evaluation = preview.evaluations.find((item) => item.sourceKey === rule.sourceKey);
              return (
                <div key={rule.sourceKey} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div>
                    <div className="font-medium">{rule.label}</div>
                    <div className="text-xs text-muted-foreground">{rule.sourceKey} · 阈值 {rule.threshold}</div>
                  </div>
                  <Badge variant="outline">{evaluation ? stateLabel[evaluation.state] : '待评价'}</Badge>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" disabled={createMutation.isPending} onClick={() => createMutation.mutate(false)}>
                创建但不启用
              </Button>
              <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate(true)}>
                创建并启用
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {applications.data?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>已应用规则</CardTitle>
            <CardDescription>策略来源、应用修订与启用状态保持可追溯。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {applications.data.map((application) => (
              <div key={application.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="font-medium">{application.symbol} · r{application.revision}</div>
                  <div className="text-xs text-muted-foreground">plan {application.planHash.slice(0, 12)} · {application.plan.rules.length} 条规则</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={application.enabled ? 'default' : 'outline'}>{application.enabled ? '已启用' : '已停用'}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggleMutation.isPending}
                    onClick={() => toggleMutation.mutate({ id: application.id, revision: application.revision, enabled: !application.enabled })}
                  >
                    {application.enabled ? '停用' : '启用'}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
