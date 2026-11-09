import { z } from 'zod';
import type { AiProvider } from './contracts.js';
import { readModelCatalogItems } from './ai-provider-model-catalog-source.js';

type Runtime = ReturnType<NonNullable<AiProvider['sdkRuntime']>>;
const modelRow = z.object({
  type: z.string(),
  key: z.string(),
  loaded_instances: z.array(z.object({ id: z.string() })),
  quantization: z.object({ name: z.string().nullable() }).nullable().optional(),
  size_bytes: z.number().int().positive(),
  variants: z.array(z.string()).optional(),
  selected_variant: z.string().optional(),
});

export async function prepareModelReceipt(runtime: Runtime, model: string) {
  const catalog = runtime.modelCatalog;
  const pinned = /^(.+)@(q[a-z0-9_]+)$/iu.exec(model);
  if (
    !pinned ||
    !catalog ||
    catalog.itemsPath !== '/models' ||
    catalog.idPath !== '/key' ||
    new URL(catalog.url).href !== new URL('/api/v1/models', runtime.baseURL).href
  ) {
    return { verify: (actual: string | null) => Promise.resolve({ accepted: actual === model }) };
  }
  const key = pinned[1]!,
    quantization = pinned[2]!.toUpperCase();
  async function snapshot() {
    const items = await readModelCatalogItems(
      runtime.baseURL,
      runtime.apiKey,
      AbortSignal.timeout(3000),
      'chat-completions',
      runtime.authMode ?? 'api_key',
      { url: catalog!.url, itemsPath: '/models', idPath: '/key' },
    );
    const rows = modelRow.array().parse(items);
    const matching = rows.filter((row) => row.key === key || row.key === model);
    const row = matching[0];
    if (
      matching.length !== 1 ||
      !row ||
      row.type !== 'llm' ||
      row.quantization?.name?.toUpperCase() !== quantization ||
      (row.variants?.length && (row.variants.length !== 1 || row.variants[0] !== model)) ||
      (row.selected_variant !== undefined && row.selected_variant !== model) ||
      rows.some(
        (other) =>
          other !== row && other.loaded_instances.some((i) => i.id === key || i.id === model),
      )
    ) {
      throw new Error('目录未能唯一核实冻结模型的量化版本');
    }
    return {
      key: row.key,
      quantization,
      sizeBytes: row.size_bytes,
      instances: row.loaded_instances.map((i) => i.id),
      checkedAt: new Date().toISOString(),
    };
  }
  const before = await snapshot();
  return {
    verify: async (actual: string | null) => {
      try {
        const after = await snapshot();
        const accepted =
          (actual === key || actual === model) &&
          before.key === after.key &&
          before.sizeBytes === after.sizeBytes &&
          after.instances.filter((id) => id === actual).length === 1;
        return { accepted, before, after };
      } catch {
        return { accepted: false, before, after: null };
      }
    },
  };
}
