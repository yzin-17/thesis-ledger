/** 提供方状态展示只消费服务端事实，不决定任务能否执行。 */
export const aiProviderPurposeOptions = [
  { value: 'strategy_authoring_analysis', label: '策略需求分析' },
  { value: 'strategy_authoring_generation', label: '策略定义生成' },
  { value: 'strategy_authoring_modification', label: '策略局部修改' },
  { value: 'research', label: '研究报告' },
  { value: 'parameter_optimization', label: '参数优化' },
  { value: 'arena_decision', label: '模拟交易决策' },
  { value: 'arena_live_research', label: '竞技场自主研究' },
  { value: 'strategy_discovery', label: '策略发现' },
] as const;

export type AiProviderStatusRoute = {
  model: string;
  contract: { id: string; version: string };
  readiness: { state: string; reasons: readonly string[] };
  liveValidation: { status: string };
};

const reasonLabels: Readonly<Record<string, string>> = {
  configuration_invalid: '配置不完整或存在不支持的设置',
  provider_disabled: '提供方已停用',
  provider_down: '最近连接失败',
  adapter_contract_evidence_missing:
    '当前接入方式、用途版本或输出方式未通过兼容检查，请检查后重新测试保存',
  budget_not_authorized: '需在具体任务中授权费用',
  capability_revoked: '此配置的调用能力已被撤销，需检查后重新验证',
};

export const aiProviderReasonLabel = (reason: string) =>
  reasonLabels[reason] ?? `其他使用限制（${reason}）`;

export const aiProviderConnectionLabel = (health: string) => {
  if (health === 'healthy') return '最近连接成功';
  if (health === 'down') return '最近连接失败';
  if (health === 'degraded') return '连接异常';
  return '连接状态待确认';
};

const configurationNeedsAttention = (route: AiProviderStatusRoute) =>
  route.readiness.state !== 'ready' &&
  (route.readiness.reasons.length === 0 ||
    route.readiness.reasons.some((reason) => reason !== 'budget_not_authorized'));

const validationLabel = (status: string) => {
  if (status === 'passed') return '历史用途测试通过';
  if (status === 'failed') return '最近用途测试未通过';
  return '用途尚未测试';
};

export const projectAiProviderStatus = (input: readonly AiProviderStatusRoute[] = []) => {
  const problems = input.filter(configurationNeedsAttention).length;
  const budgetPending = input.filter(
    (route) =>
      route.readiness.state !== 'ready' &&
      route.readiness.reasons.includes('budget_not_authorized'),
  ).length;
  let label = '尚未配置模型用途';
  let tone: 'outline' | 'secondary' | 'destructive' = 'secondary';
  if (problems > 0) {
    label = `配置待处理 ${problems}/${input.length}`;
    tone = 'destructive';
  } else if (budgetPending > 0) {
    label = `待任务费用授权 ${budgetPending}/${input.length}`;
  } else if (input.length > 0) {
    label = `配置检查通过 ${input.length}/${input.length}`;
    tone = 'outline';
  }
  let testLabel = '用途尚未测试';
  if (input.some((route) => route.liveValidation.status === 'failed'))
    testLabel = '最近用途测试未通过';
  else if (input.length > 0 && input.every((route) => route.liveValidation.status === 'passed'))
    testLabel = '历史用途测试通过';
  else if (input.some((route) => route.liveValidation.status === 'passed'))
    testLabel = '部分用途有历史测试记录';
  let testTone: 'outline' | 'secondary' | 'destructive' = 'secondary';
  if (input.some((route) => route.liveValidation.status === 'failed')) testTone = 'destructive';
  else if (input.length > 0 && input.every((route) => route.liveValidation.status === 'passed'))
    testTone = 'outline';
  return {
    label,
    tone,
    testLabel,
    testTone,
    budgetNote: budgetPending > 0 ? '付费模型需在具体任务中授权费用。' : null,
    routes: input.map((route) => {
      let readinessLabel = '配置检查通过';
      if (configurationNeedsAttention(route)) readinessLabel = '配置待处理';
      else if (route.readiness.state !== 'ready') readinessLabel = '待任务费用授权';
      const version = /-v(\d+)$/u.exec(route.contract.version);
      return {
        model: route.model,
        purpose:
          aiProviderPurposeOptions.find((option) => option.value === route.contract.id)?.label ??
          `其他用途（${route.contract.id}）`,
        version: version ? `V${version[1]}` : route.contract.version,
        readinessLabel,
        budgetPending:
          route.readiness.state !== 'ready' &&
          route.readiness.reasons.includes('budget_not_authorized'),
        validationLabel: validationLabel(route.liveValidation.status),
        reasons:
          route.readiness.state === 'ready'
            ? []
            : route.readiness.reasons
                .filter((reason) => reason !== 'budget_not_authorized')
                .map(aiProviderReasonLabel),
      };
    }),
  };
};
