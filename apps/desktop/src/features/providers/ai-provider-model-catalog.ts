import {
  aiProviderModelCatalogConfigSchema,
  aiProviderModelCatalogOriginAllowed,
  type AiAuthMode,
  type AiProviderModelCatalogConfig,
  type AiProviderModelCatalogRequest,
  type AiUpstreamFormat,
} from '@thesis-ledger/schemas';

export type ModelCatalogDraft = {
  url: string;
  itemsPath: string;
  idPath: string;
  reasoningPath: string | undefined;
  filter: { path: string; equals: string } | null;
  pagination: {
    pageParam: string;
    pageSizeParam: string;
    pageSize: string;
    startPage: string;
    stopWhen: 'empty-page' | 'short-page';
  } | null;
};

export const modelCatalogDraftFromConfig = (
  config?: AiProviderModelCatalogConfig,
): ModelCatalogDraft => ({
  url: config?.url ?? '',
  itemsPath: config?.itemsPath ?? '/data',
  idPath: config?.idPath ?? '/id',
  reasoningPath: config?.reasoningPath,
  filter: config?.filter ? { ...config.filter } : null,
  pagination: config?.pagination
    ? {
        ...config.pagination,
        pageSizeParam: config.pagination.pageSizeParam ?? '',
        pageSize: String(config.pagination.pageSize),
        startPage: String(config.pagination.startPage),
      }
    : null,
});

export const modelCatalogConfigFromDraft = (
  draft: ModelCatalogDraft | null | undefined,
): AiProviderModelCatalogConfig | null | undefined => {
  if (!draft) return draft;
  const pagination = draft.pagination;
  return {
    url: draft.url.trim(),
    itemsPath: draft.itemsPath,
    idPath: draft.idPath,
    ...(draft.reasoningPath === undefined ? {} : { reasoningPath: draft.reasoningPath }),
    ...(draft.filter ? { filter: { ...draft.filter } } : {}),
    ...(pagination
      ? {
          pagination: {
            pageParam: pagination.pageParam.trim(),
            ...(pagination.pageSizeParam.trim()
              ? { pageSizeParam: pagination.pageSizeParam.trim() }
              : {}),
            pageSize: Number(pagination.pageSize),
            startPage: Number(pagination.startPage),
            stopWhen: pagination.stopWhen,
          },
        }
      : {}),
  };
};

type CatalogRequestDraft = {
  name: string;
  baseUrl: string;
  authMode: AiAuthMode;
  credentialsRef: string;
  upstreamFormat: AiUpstreamFormat;
  timeoutMs: string;
  modelCatalog: ModelCatalogDraft | null | undefined;
};

export const modelCatalogRequestFromDraft = (
  draft: CatalogRequestDraft,
): AiProviderModelCatalogRequest => {
  const name = draft.name.trim();
  const apiKey = draft.authMode === 'api_key' ? draft.credentialsRef.trim() : '';
  const timeoutMs = Number(draft.timeoutMs);
  const modelCatalog = modelCatalogConfigFromDraft(draft.modelCatalog);
  return {
    ...(name ? { name } : {}),
    baseUrl: draft.baseUrl.trim(),
    authMode: draft.authMode,
    upstreamFormat: draft.upstreamFormat,
    ...(apiKey ? { apiKey } : {}),
    ...(Number.isInteger(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
    ...(modelCatalog === undefined ? {} : { modelCatalog }),
  };
};

export const modelCatalogInputError = (input: {
  baseUrl: string;
  authMode: AiAuthMode;
  modelCatalog?: AiProviderModelCatalogConfig | null | undefined;
}) => {
  if (!input.baseUrl.trim()) return '请先填写 API Base URL。';
  if (!input.modelCatalog) return null;
  const parsed = aiProviderModelCatalogConfigSchema.safeParse(input.modelCatalog);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'url') return '请填写有效的 HTTP(S) 模型目录地址。';
    if (issue?.path[1] === 'pageSize') return '目录页容量必须是 1 到 2000 的整数。';
    if (issue?.path[1] === 'startPage') return '目录起始页必须是 0 到 1000000 的整数。';
    return issue?.message ?? '模型目录规则无效。';
  }
  if (!aiProviderModelCatalogOriginAllowed(input.baseUrl, parsed.data, input.authMode))
    return '使用 API Key 的目录地址必须与生成地址同源。';
  return null;
};
