import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import { LoaderCircle } from 'lucide-react';
import { fetchAccounts, fetchPortfolioValuation } from '../portfolio/portfolio.api.js';
import { portfolioKeys } from '../portfolio/portfolio.queries.js';
import { accountDisplayLabel, type Account } from '../portfolio/portfolio.types.js';
import { fetchStrategies } from '../strategy/strategy.api.js';
import { strategyKeys } from '../strategy/strategy.queries.js';
import type { StrategyRecord } from '../strategy/strategy.types.js';
import { useToastManager } from '@/components/ui/toast';
import { useCreateAiRunMutation } from './ai.mutations.js';
import { useAiCapabilitiesQuery, useAiResearchRetryPrefillQuery } from './ai.queries.js';
import { researchQuestionTemplates } from './ai.templates.js';
import type { AiResearchScope, AiRunResult, StartResearchInput } from './ai.types.js';

const scopeOptions: Array<{ value: AiResearchScope; label: string }> = [
  { value: 'portfolio', label: '全组合' },
  { value: 'account', label: '账户' },
  { value: 'position', label: '单个持仓' },
  { value: 'strategy', label: '策略版本' },
];

const errorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : '研究暂时无法启动，请稍后重试。';

const questionErrorFor = (value: string) => {
  const length = value.trim().length;
  if (length === 0) return '请先描述需要回答的问题。';
  if (length > 2000) return '研究问题不能超过 2000 个字符。';
  return null;
};

const buildContext = ({
  scope,
  accountId,
  symbol,
  strategyVersionId,
}: {
  scope: AiResearchScope;
  accountId: string | null;
  symbol: string | null;
  strategyVersionId: string | null;
}): StartResearchInput['context'] => {
  if (scope === 'portfolio') return { scope };
  if (scope === 'account') return { scope, accountId: accountId as string };
  if (scope === 'position')
    return { scope, accountId: accountId as string, symbol: symbol as string };
  return { scope, strategyVersionId: strategyVersionId as string };
};

export function NewResearchSheet({
  open,
  onOpenChange,
  initialQuestion = '',
  retryOfRunId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuestion?: string | undefined;
  retryOfRunId?: string | undefined;
  onCreated: (run: AiRunResult) => void;
}) {
  const [scope, setScope] = useState<AiResearchScope>('portfolio');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [strategyVersionId, setStrategyVersionId] = useState<string | null>(null);
  const [question, setQuestion] = useState(initialQuestion);
  const [templateId, setTemplateId] = useState<StartResearchInput['templateId']>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [retryContextReselected, setRetryContextReselected] = useState(false);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const [unknownRiskConfirmed, setUnknownRiskConfirmed] = useState(false);
  const mutation = useCreateAiRunMutation();
  const capabilitiesQuery = useAiCapabilitiesQuery(open);
  const retryPrefillQuery = useAiResearchRetryPrefillQuery(retryOfRunId, open);
  const toastManager = useToastManager();

  useEffect(() => {
    if (!open) return;
    setQuestion(initialQuestion);
    setScope('portfolio');
    setAccountId(null);
    setSymbol(null);
    setStrategyVersionId(null);
    setTemplateId(undefined);
    setSubmitError(null);
    setHasAttemptedSubmit(false);
    setRetryContextReselected(false);
    setRetryConfirmed(false);
    setUnknownRiskConfirmed(false);
  }, [open, initialQuestion]);

  useEffect(() => {
    const prefill = retryPrefillQuery.data;
    if (!open || !prefill || prefill.sourceRunId !== retryOfRunId) return;
    setQuestion(prefill.question);
    setScope(prefill.context.scope);
    setAccountId(prefill.context.accountId ?? null);
    setSymbol(prefill.context.symbol ?? null);
    setStrategyVersionId(prefill.context.strategyVersionId ?? null);
    setTemplateId(prefill.templateId ?? undefined);
  }, [open, retryOfRunId, retryPrefillQuery.data]);

  const accountsQuery = useQuery({
    queryKey: portfolioKeys.accounts(),
    queryFn: () => fetchAccounts(),
    enabled: open && (scope === 'account' || scope === 'position'),
    staleTime: 30_000,
  });
  const positionsQuery = useQuery({
    queryKey: portfolioKeys.valuation('actual', accountId ?? 'all'),
    queryFn: () => fetchPortfolioValuation('actual', accountId ?? undefined),
    enabled: open && scope === 'position' && Boolean(accountId),
    staleTime: 15_000,
  });
  const strategiesQuery = useQuery({
    queryKey: strategyKeys.strategies(),
    queryFn: () => fetchStrategies(),
    enabled: open && scope === 'strategy',
    staleTime: 15_000,
  });

  const accounts: Account[] = accountsQuery.data ?? [];
  const positions = positionsQuery.data?.positions ?? [];
  const strategies: StrategyRecord[] = strategiesQuery.data ?? [];
  const strategyVersions = useMemo(
    () =>
      strategies.flatMap((strategy) => strategy.versions.map((version) => ({ strategy, version }))),
    [strategies],
  );
  const selectedStrategy = strategyVersions.find((item) => item.version.id === strategyVersionId);
  const questionError = questionErrorFor(question);
  let entityError: string | null = null;
  if (scope === 'account' && !accountId) entityError = '请选择一个账户。';
  if (scope === 'position' && !accountId) entityError = '请先选择账户。';
  if (scope === 'position' && accountId && !symbol) entityError = '请选择账户中的实际持仓。';
  if (scope === 'strategy' && !strategyVersionId) entityError = '请选择一个具体策略版本。';
  if (retryPrefillQuery.data?.contextState === 'missing' && !retryContextReselected && !entityError)
    entityError = '原研究对象已失效，请显式重新选择研究范围或对象。';
  if (retryPrefillQuery.data?.contextState === 'forbidden' && !entityError)
    entityError = '原研究对象已不可访问，不能再次生成。';
  const visibleQuestionError = hasAttemptedSubmit ? questionError : null;
  const visibleEntityError = hasAttemptedSubmit ? entityError : null;
  const canSubmit =
    !questionError &&
    !entityError &&
    !mutation.isPending &&
    (!retryOfRunId || !retryPrefillQuery.isPending) &&
    (!retryOfRunId || !retryPrefillQuery.isError) &&
    (!retryOfRunId || retryConfirmed) &&
    (!retryPrefillQuery.data?.requiresUnknownOutcomeAcknowledgement || unknownRiskConfirmed) &&
    capabilitiesQuery.data?.canStart === true;

  const expectedTools = {
    portfolio: ['getPortfolio', 'getPositions', 'getRisk'],
    account: ['getPortfolio', 'getPositions', 'getRisk', 'getJournal'],
    position: ['getPositions', 'getRisk', 'getJournal'],
    strategy: ['getRisk', 'getJournal'],
  }[scope];
  const toolLabels: Record<string, string> = {
    getPortfolio: '组合摘要',
    getPositions: '持仓',
    getRisk: '风险历史',
    getJournal: '研究日志',
  };
  const availableTools = new Set(
    capabilitiesQuery.data?.providers.flatMap((provider) => provider.tools) ?? [],
  );
  let boundary = '正在检查可用读取范围';
  if (capabilitiesQuery.data) {
    const labels = expectedTools
      .filter((tool) => availableTools.has(tool))
      .map((tool) => toolLabels[tool] ?? tool);
    boundary = labels.length > 0 ? labels.join('、') : '当前没有可用的只读 Tool';
  }

  let capabilityMessage = '正在检查 Provider、Tool 和执行 Worker…';
  if (capabilitiesQuery.isError) capabilityMessage = '能力预检失败，请先刷新后再提交研究。';
  else if (capabilitiesQuery.data && !capabilitiesQuery.data.canStart) {
    const unavailable = capabilitiesQuery.data.providers[0];
    const missing = unavailable?.missing.length ? `缺少：${unavailable.missing.join('、')}。` : '';
    const impact = unavailable?.impact[0] ?? '研究任务不会进入可执行队列。';
    capabilityMessage = `${missing}${impact}`;
  } else if (capabilitiesQuery.data?.providers.some((provider) => provider.state === 'demo'))
    capabilityMessage = '当前使用演示 Provider，结果会明确标记为演示数据。';
  else if (capabilitiesQuery.data?.canStart)
    capabilityMessage = 'Provider、Tool 和执行 Worker 已就绪。';

  const handleScopeChange = (next: string[]) => {
    const nextScope = next[0] as AiResearchScope | undefined;
    if (!nextScope) return;
    setScope(nextScope);
    setAccountId(null);
    setSymbol(null);
    setStrategyVersionId(null);
    setSubmitError(null);
    setHasAttemptedSubmit(false);
    if (retryOfRunId) setRetryContextReselected(true);
  };

  const submit = async () => {
    setHasAttemptedSubmit(true);
    if (!canSubmit) return;
    let context = buildContext({ scope, accountId, symbol, strategyVersionId });
    if (retryPrefillQuery.data && !retryContextReselected) {
      context = retryPrefillQuery.data.context;
    }
    setSubmitError(null);
    try {
      const run = await mutation.mutateAsync({
        question: question.trim(),
        context,
        ...(templateId ? { templateId } : {}),
        ...(retryOfRunId
          ? {
              retryOfRunId,
              retryConfirmation: {
                contextConfirmed: true as const,
                acknowledgeUnknownOutcomeRisk: unknownRiskConfirmed,
              },
            }
          : {}),
      });
      onCreated(run);
      onOpenChange(false);
      toastManager.add({
        title: '研究已开始',
        description: '任务已进入列表，状态会自动更新。',
        type: 'success',
        timeout: 2800,
      });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  };

  const requestClose = useDraftCloseGuard({
    open,
    draft: null,
    dirty:
      question !== initialQuestion ||
      scope !== 'portfolio' ||
      Boolean(
        accountId ||
        symbol ||
        strategyVersionId ||
        templateId ||
        retryConfirmed ||
        unknownRiskConfirmed,
      ),
    busy: mutation.isPending,
    onOpenChange,
  });

  let submitLabel = retryOfRunId ? '确认并再次生成' : '开始研究';
  if (mutation.isPending) submitLabel = '开始中…';

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => void requestClose(nextOpen)}>
      <SheetContent side="right" size="form" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{retryOfRunId ? '再次生成研究' : '新建研究'}</SheetTitle>
          <SheetDescription>
            选择真实研究对象并描述需要回答的问题。研究只读取授权数据，不会修改账本或生成订单。
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel>研究范围</FieldLabel>
              <ToggleGroup
                value={[scope]}
                onValueChange={handleScopeChange}
                aria-label="选择研究范围"
                className="grid grid-cols-2 sm:grid-cols-4"
              >
                {scopeOptions.map((item) => (
                  <ToggleGroupItem key={item.value} value={item.value} className="w-full">
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>账户、持仓和策略研究都会写入精确对象 ID。</FieldDescription>
            </Field>
            {scope === 'account' && (
              <Field invalid={Boolean(visibleEntityError)}>
                <FieldLabel htmlFor="ai-account">研究账户</FieldLabel>
                <Select
                  value={accountId ?? ''}
                  onValueChange={(value) => {
                    setAccountId(value || null);
                    if (retryOfRunId) setRetryContextReselected(true);
                  }}
                >
                  <SelectTrigger
                    id="ai-account"
                    className="w-full"
                    aria-invalid={Boolean(visibleEntityError)}
                  >
                    <SelectValue placeholder="选择账户" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {accountDisplayLabel(account)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {accountsQuery.isPending && <FieldDescription>正在加载账户…</FieldDescription>}
                {accountsQuery.isError && <FieldError>账户读取失败，请重试后再提交。</FieldError>}
                {!accountsQuery.isPending && !accountsQuery.isError && accounts.length === 0 && (
                  <FieldError>暂无可用账户，请先完成账户配置。</FieldError>
                )}
                {!accountsQuery.isError && accounts.length > 0 && (
                  <FieldError>{visibleEntityError}</FieldError>
                )}
              </Field>
            )}
            {scope === 'position' && (
              <>
                <Field invalid={Boolean(visibleEntityError && !accountId)}>
                  <FieldLabel htmlFor="ai-position-account">持仓账户</FieldLabel>
                  <Select
                    value={accountId ?? ''}
                    onValueChange={(value) => {
                      setAccountId(value || null);
                      setSymbol(null);
                      if (retryOfRunId) setRetryContextReselected(true);
                    }}
                  >
                    <SelectTrigger
                      id="ai-position-account"
                      className="w-full"
                      aria-invalid={Boolean(visibleEntityError && !accountId)}
                    >
                      <SelectValue placeholder="先选择账户" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {accountDisplayLabel(account)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {accountsQuery.isPending && <FieldDescription>正在加载账户…</FieldDescription>}
                  {accountsQuery.isError && <FieldError>账户读取失败，请重试后再提交。</FieldError>}
                </Field>
                <Field invalid={Boolean(visibleEntityError && Boolean(accountId))}>
                  <FieldLabel htmlFor="ai-position-symbol">实际持仓</FieldLabel>
                  <Select
                    value={symbol ?? ''}
                    onValueChange={(value) => {
                      setSymbol(value || null);
                      if (retryOfRunId) setRetryContextReselected(true);
                    }}
                    disabled={!accountId || positionsQuery.isPending}
                  >
                    <SelectTrigger
                      id="ai-position-symbol"
                      className="w-full"
                      aria-invalid={Boolean(visibleEntityError && Boolean(accountId))}
                    >
                      <SelectValue placeholder={accountId ? '选择持仓' : '先选择账户'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {positions.map((position) => (
                          <SelectItem key={position.id} value={position.symbol}>
                            {position.symbol} · {position.asset.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {positionsQuery.isPending && (
                    <FieldDescription>正在读取账户持仓…</FieldDescription>
                  )}
                  {positionsQuery.isError && (
                    <FieldError>持仓读取失败，请重试后再提交。</FieldError>
                  )}
                  {!positionsQuery.isPending &&
                    !positionsQuery.isError &&
                    accountId &&
                    positions.length === 0 && <FieldError>该账户暂无可研究的实际持仓。</FieldError>}
                  {!positionsQuery.isError && positions.length > 0 && (
                    <FieldError>
                      {visibleEntityError && accountId ? visibleEntityError : undefined}
                    </FieldError>
                  )}
                </Field>
              </>
            )}
            {scope === 'strategy' && (
              <Field invalid={Boolean(visibleEntityError)}>
                <FieldLabel htmlFor="ai-strategy-version">策略版本</FieldLabel>
                <Select
                  value={strategyVersionId ?? ''}
                  onValueChange={(value) => {
                    setStrategyVersionId(value || null);
                    if (retryOfRunId) setRetryContextReselected(true);
                  }}
                >
                  <SelectTrigger
                    id="ai-strategy-version"
                    className="w-full"
                    aria-invalid={Boolean(visibleEntityError)}
                  >
                    <SelectValue placeholder="选择策略版本" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map((strategy) => (
                      <SelectGroup key={strategy.id}>
                        {strategy.versions.map((version) => (
                          <SelectItem key={version.id} value={version.id}>
                            {strategy.name} · v{version.version}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {strategiesQuery.isPending && (
                  <FieldDescription>正在加载策略版本…</FieldDescription>
                )}
                {strategiesQuery.isError && <FieldError>策略读取失败，请重试后再提交。</FieldError>}
                {!strategiesQuery.isPending &&
                  !strategiesQuery.isError &&
                  strategyVersions.length === 0 && <FieldError>暂无可用策略版本。</FieldError>}
                {selectedStrategy && (
                  <FieldDescription>
                    已选择 {selectedStrategy.strategy.name} v{selectedStrategy.version.version}
                  </FieldDescription>
                )}
                {!strategiesQuery.isError && strategyVersions.length > 0 && (
                  <FieldError>{visibleEntityError}</FieldError>
                )}
              </Field>
            )}
            <Field invalid={Boolean(visibleQuestionError)}>
              <FieldLabel htmlFor="ai-question">研究问题</FieldLabel>
              <Textarea
                id="ai-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={6}
                maxLength={2000}
                placeholder="例如：当前组合最主要的风险是什么？请列出证据、反例和数据缺口。"
                className="font-sans"
                aria-invalid={Boolean(visibleQuestionError)}
              />
              <div className="flex items-center justify-between gap-2">
                <FieldDescription>问题会保存在任务中，后续可从失败任务重试。</FieldDescription>
                <span className="text-xs text-muted-foreground">{question.length}/2000</span>
              </div>
              <FieldError>{visibleQuestionError}</FieldError>
            </Field>
          </FieldGroup>
          <section className="flex flex-col gap-2" aria-labelledby="ai-template-title">
            <div>
              <h2 id="ai-template-title" className="text-sm font-medium">
                常用问题
              </h2>
              <p className="text-xs text-muted-foreground">点击后仍可编辑，不会自动提交。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {researchQuestionTemplates.map((template) => (
                <Button
                  key={template.id}
                  type="button"
                  size="sm"
                  variant={templateId === template.id ? 'secondary' : 'outline'}
                  onClick={() => {
                    setQuestion(template.question);
                    setTemplateId(template.id);
                  }}
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </section>
          <Alert>
            <AlertTitle>本次预计读取</AlertTitle>
            <AlertDescription>
              {boundary}。来源是否可用以服务端实际返回为准，缺失来源会在结果中明确标注。
              {` ${capabilityMessage}`}
            </AlertDescription>
          </Alert>
          {retryOfRunId && retryPrefillQuery.isPending && (
            <Alert>
              <AlertTitle>正在核对来源任务</AlertTitle>
              <AlertDescription>服务端正在确认来源类型、终态和研究对象访问状态。</AlertDescription>
            </Alert>
          )}
          {retryOfRunId && retryPrefillQuery.isError && (
            <Alert variant="destructive">
              <AlertTitle>无法再次生成</AlertTitle>
              <AlertDescription>
                来源任务无效、状态不允许或不可访问。请返回列表重新选择失败任务。
              </AlertDescription>
            </Alert>
          )}
          {retryPrefillQuery.data && (
            <Alert
              variant={
                retryPrefillQuery.data.sourceOutcome === 'unknown' ? 'destructive' : 'default'
              }
            >
              <AlertTitle>
                {retryPrefillQuery.data.sourceOutcome === 'unknown'
                  ? '来源结果状态未知'
                  : '确认再次生成'}
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-3">
                <p>新任务会获得独立 ID、执行期限和预算；原任务的结果、计量事实与预留保持不变。</p>
                <div className="flex items-center justify-between gap-3">
                  <span>我已核对预填的问题、研究对象和问题模板</span>
                  <Switch
                    variant="risk"
                    checked={retryConfirmed}
                    onCheckedChange={setRetryConfirmed}
                    aria-label="确认再次生成的预填内容"
                  >
                    <SwitchThumb variant="risk" aria-hidden="true" />
                  </Switch>
                </div>
                {retryPrefillQuery.data.requiresUnknownOutcomeAcknowledgement && (
                  <div className="flex items-center justify-between gap-3">
                    <span>我理解原请求可能仍在外部执行，并确认创建独立的新请求</span>
                    <Switch
                      variant="risk"
                      checked={unknownRiskConfirmed}
                      onCheckedChange={setUnknownRiskConfirmed}
                      aria-label="确认未知外部结果风险"
                    >
                      <SwitchThumb variant="risk" aria-hidden="true" />
                    </Switch>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          {submitError && (
            <Alert variant="destructive">
              <AlertTitle>研究启动失败</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
              <Button type="button" size="sm" variant="outline" onClick={() => void submit()}>
                重试提交
              </Button>
            </Alert>
          )}
        </div>
        <SheetFooter>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="w-full"
          >
            {mutation.isPending && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
