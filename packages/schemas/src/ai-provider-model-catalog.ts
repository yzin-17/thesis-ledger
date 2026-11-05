import { z } from 'zod';

const jsonPointer = z
  .string()
  .max(500)
  .refine(
    (value) => value === '' || (value.startsWith('/') && !/~(?![01])/u.test(value)),
    '请填写 JSON Pointer，例如 /data；空值表示根节点',
  );
const parameterName = z.string().trim().min(1).max(80);
const catalogUrl = z
  .url()
  .max(2_000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return /^https?:$/u.test(url.protocol) && !url.username && !url.password && !url.hash;
    } catch {
      return false;
    }
  }, '目录地址必须使用 HTTP(S)，且不能包含用户名、密码或片段');

export const aiProviderModelCatalogConfigSchema = z
  .object({
    url: catalogUrl,
    itemsPath: jsonPointer,
    idPath: jsonPointer,
    reasoningPath: jsonPointer.optional(),
    filter: z
      .object({ path: jsonPointer, equals: z.string().max(200) })
      .strict()
      .optional(),
    pagination: z
      .object({
        pageParam: parameterName,
        pageSizeParam: parameterName.optional(),
        pageSize: z.number().int().min(1).max(2_000),
        startPage: z.number().int().min(0).max(1_000_000),
        stopWhen: z.enum(['empty-page', 'short-page']),
      })
      .strict()
      .refine((value) => value.pageParam !== value.pageSizeParam, '页码和页容量参数名不能相同')
      .optional(),
  })
  .strict();

export type AiProviderModelCatalogConfig = z.infer<typeof aiProviderModelCatalogConfigSchema>;

export const aiProviderModelCatalogOriginAllowed = (
  baseUrl: string,
  config: AiProviderModelCatalogConfig | null | undefined,
  authMode: 'api_key' | 'none',
) => {
  if (!config || authMode === 'none') return true;
  try {
    return new URL(baseUrl).origin === new URL(config.url).origin;
  } catch {
    return false;
  }
};

export const refineAiProviderModelCatalogOrigin = (
  value: {
    baseUrl: string;
    authMode: 'api_key' | 'none';
    modelCatalog?: AiProviderModelCatalogConfig | null | undefined;
  },
  context: z.RefinementCtx,
) => {
  if (!aiProviderModelCatalogOriginAllowed(value.baseUrl, value.modelCatalog, value.authMode)) {
    context.addIssue({
      code: 'custom',
      path: ['modelCatalog', 'url'],
      message: '使用 API Key 的目录地址必须与生成地址同源',
    });
  }
};
