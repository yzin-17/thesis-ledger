export type ProviderHealthHistoryRecord = {
  provider: string;
  state: string;
  latencyMs: number | null;
  checkedAt: string;
  source?: string;
};

export type ProviderHealthHistoryPage = {
  items: ProviderHealthHistoryRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const PROVIDER_HEALTH_HISTORY_PAGE_SIZE = 20;

export type ProviderTestState = 'idle' | 'testing' | 'success' | 'warning' | 'error';

export interface ProviderTestEvidence {
  token: string;
  credentialsRef?: string;
}

export interface ProviderRecord {
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  health: string;
  credentialConfigured?: boolean;
}

export interface ProviderIssueRecord {
  id: string;
  provider: string;
  symbol: string | null;
  severity: string;
  code: string;
  status: string;
}

export interface AutomationJob {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  nextRunAt: string | null;
}

export interface AutomationHistoryRecord {
  id: string;
  jobId: string;
  status: string;
  startedAt: string;
  error: string | null;
}

export interface NotificationFailureRecord {
  id: string;
  provider: string;
  status: string;
  lastError: string | null;
}

export interface ProviderConnectionTestResult {
  status?: string;
  message?: string;
  credentialConfigured?: boolean;
  healthCheck?: ProviderHealthHistoryRecord;
}

export interface ProviderDraftTestResult {
  status?: string;
  message?: string;
  testToken?: string;
}

export interface SaveProviderInput {
  name: string;
  type: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  credentialsRef?: string;
  connectionTestToken?: string;
}

export type ProviderSaveResult = Partial<ProviderRecord> & {
  healthCheck?: ProviderHealthHistoryRecord;
};

export interface ProviderPageState {
  healthHistory: ProviderHealthHistoryRecord[];
  healthHistoryPagination: ProviderHealthHistoryPage;
  providerTestState: ProviderTestState;
  providerTestEvidence: ProviderTestEvidence | null;
}

export const providerCapabilityOptions = [
  { value: 'notification', label: '通知' },
  { value: 'quote', label: '报价' },
  { value: 'bars-1d', label: '日线' },
  { value: 'bars-1m', label: '分钟线' },
  { value: 'indicator', label: '指标' },
  { value: 'chip', label: '筹码' },
  { value: 'financials', label: '财务' },
  { value: 'news', label: '新闻' },
  { value: 'announcements', label: '公告' },
  { value: 'chat', label: '对话' },
  { value: 'vision', label: '图像理解' },
] as const;

export const providerTypeLabels: Record<string, string> = {
  notification: '通知',
  market: '行情',
  ai: 'AI',
  vision: '图像',
};

export const providerTypeLabel = (type: string) => providerTypeLabels[type] ?? `其他（${type}）`;
export const providerCapabilityLabel = (capability: string) =>
  providerCapabilityOptions.find((item) => item.value === capability)?.label ??
  `其他（${capability}）`;

export type ProviderStatusTone = 'normal' | 'error' | 'warning' | 'neutral';

export interface ProviderStatusInput {
  enabled: boolean;
  health: string;
  credentialConfigured?: boolean;
}

export const providerDisplayStatus = (
  provider: ProviderStatusInput,
): { label: string; tone: ProviderStatusTone } => {
  if (!provider.enabled) return { label: '已停用', tone: 'neutral' };
  if (!provider.credentialConfigured) return { label: '未配置', tone: 'warning' };
  if (provider.health === 'healthy') return { label: '正常', tone: 'normal' };
  if (provider.health === 'degraded' || provider.health === 'down') {
    return { label: '异常', tone: 'error' };
  }
  return { label: '未测试', tone: 'neutral' };
};

export const providerHealthSourceLabel = (source?: string) =>
  ({
    manual: '手动测试',
    scheduled: '定时检查',
    delivery: '实际投递',
  })[source ?? ''] ?? '其他检查';

export const providerCredentialTypeLabels: Record<string, string> = {
  notification: 'Webhook / Token',
  market: '行情 API Key / Token',
  ai: 'AI API Key / Token',
  vision: '图像 API Key / Token',
};

export const providerCredentialLabel = (name: string, type: string) => {
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (
    type === 'notification' &&
    ['feishu', 'feishu-webhook', 'lark', 'lark-webhook'].includes(normalizedName)
  ) {
    return '飞书 Webhook';
  }
  return providerCredentialTypeLabels[type] ?? 'API Key / Token';
};

export const providerCredentialPlaceholder = (label: string) =>
  label.includes('Webhook') ? '输入 Webhook 地址' : '输入 API Key 或 Token';

export const providerCredentialForSave = (
  draftCredential: string,
  testEvidence: ProviderTestEvidence | null,
) => testEvidence?.credentialsRef ?? draftCredential.trim();

export const replaceProviderRecord = <T extends { name: string }>(
  current: readonly T[],
  saved: T,
) =>
  current.some((provider) => provider.name === saved.name)
    ? current.map((provider) => (provider.name === saved.name ? saved : provider))
    : [...current, saved];

export const sortProviderRecords = <T extends { name: string; priority: number }>(
  providers: readonly T[],
) =>
  [...providers].sort(
    (left, right) => left.priority - right.priority || left.name.localeCompare(right.name),
  );

export const providerCredentialConfiguredAfterSave = (
  responseValue: boolean | undefined,
  submittedCredential: string,
  currentValue: boolean | undefined,
) => responseValue ?? (Boolean(submittedCredential) || currentValue === true);

export const newProviderDraft = () => ({
  name: 'feishu',
  type: 'notification',
  capabilities: ['notification'],
  credentialsRef: '',
  priority: 1,
  enabled: true,
});

export type ProviderDraft = ReturnType<typeof newProviderDraft>;

export const normalizeProviderHealthHistory = (
  value: unknown,
  requestedPage: number,
  pageSize: number,
): ProviderHealthHistoryPage => {
  const safePage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  if (Array.isArray(value)) {
    const total = value.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const page = totalPages === 0 ? 1 : Math.min(safePage, totalPages);
    const start = (page - 1) * pageSize;
    return {
      items: value.slice(start, start + pageSize) as ProviderHealthHistoryRecord[],
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    !('items' in value) ||
    !Array.isArray(value.items)
  ) {
    throw new Error('Provider 健康历史响应格式无效');
  }

  const response = value as Partial<ProviderHealthHistoryPage>;
  const items = value.items as ProviderHealthHistoryRecord[];
  const responsePageSize =
    typeof response.pageSize === 'number' && response.pageSize > 0 ? response.pageSize : pageSize;
  const total =
    typeof response.total === 'number' && response.total >= 0 ? response.total : items.length;
  let totalPages = response.totalPages;
  if (typeof totalPages !== 'number' || totalPages < 0) {
    totalPages = total === 0 ? 0 : Math.ceil(total / responsePageSize);
  }
  const page = typeof response.page === 'number' && response.page > 0 ? response.page : safePage;

  return { items, page, pageSize: responsePageSize, total, totalPages };
};
