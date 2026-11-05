import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const serverRequire = createRequire(new URL('../apps/server/package.json', import.meta.url));
const { delay } = serverRequire('es-toolkit/promise');

export function createOpenRouterFreeRequestPacer({ now = Date.now, wait = delay } = {}) {
  let previous = null;
  return async (signal) => {
    signal?.throwIfAborted();
    if (previous !== null) {
      const remaining = Math.max(0, previous + 3100 - now());
      if (remaining > 0) await wait(remaining, { signal });
    }
    previous = now();
  };
}

export const openRouterScreeningCaseIds = [
  'single-price',
  'stale-price',
  'currencies',
  'future-publication',
  'adjustment-basis',
  'dividend-proposal',
  'prompt-injection',
];
export const openRouterFreeModel = 'google/gemma-4-26b-a4b-it:free';
export const openRouterNemotronModel = 'nvidia/nemotron-3.5-super-vl:free';
const nemotronCaseIds = [
  'single-price',
  'currencies',
  'future-publication',
  'dividend-proposal',
  'prompt-injection',
];
const canonicalModels = {
  [openRouterFreeModel]: 'google/gemma-4-26b-a4b-it-20260403',
  'qwen/qwen3.8-27b': 'qwen/qwen3.8-27b-20260814',
  'xingchen-agi/xing4.0-29b-a4b:free': 'xingchen-agi/xing4.0-29b-a4b-20261015',
  [openRouterNemotronModel]: 'nvidia/nemotron-3.5-super-vl-20261015',
};

export async function freezeOpenRouterExperimentModel(
  source,
  model = openRouterFreeModel,
  httpClient = fetch,
) {
  if (source.providerId !== 'openrouter' || !source.apiKey || !canonicalModels[model])
    throw new Error('OpenRouter固定型号或内存凭据不符');
  const caseIds = model === openRouterNemotronModel ? nemotronCaseIds : openRouterScreeningCaseIds;
  const plannedModelRequests = caseIds.length * 4;
  const read = async (endpoint) => {
    const response = await httpClient('https://openrouter.ai/api/v1/' + endpoint, {
      method: 'GET',
      headers: endpoint === 'models' ? {} : { Authorization: 'Bearer ' + source.apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('OpenRouter只读目录或额度接口拒绝');
    return response.json();
  };
  const [catalog, key, credits] = await Promise.all([
    read('models/user'),
    read('key'),
    read('credits'),
  ]);
  const entry = catalog.data?.find((item) => item.id === model);
  if (
    !entry ||
    entry.canonical_slug !== canonicalModels[model] ||
    !entry.supported_parameters?.includes('response_format')
  )
    throw new Error('固定型号目录身份或JSON能力不符');
  const input = Number(entry.pricing?.prompt);
  const output = Number(entry.pricing?.completion);
  if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0)
    throw new Error('OpenRouter目录费率无效');
  const balance = credits.data?.total_credits - credits.data?.total_usage;
  if (!Number.isFinite(balance) || balance < 0) throw new Error('OpenRouter余额不合格');
  const quota = key.data?.free_model_daily_requests ?? null;
  if (model.endsWith(':free')) {
    if (input !== 0 || output !== 0) throw new Error('固定免费型号不能带付费费率');
    if (quota && (!Number.isInteger(quota.remaining) || quota.remaining < plannedModelRequests))
      throw new Error('免费剩余额度不足本轮' + plannedModelRequests + '次上限');
  } else if (
    balance < caseIds.length * 2 * (100000 * input + 6000 * output) ||
    key.data?.limit_remaining === 0
  ) {
    throw new Error('OpenRouter现有余额不足缩减筛查上限');
  }
  const snapshot = {
    id: entry.id,
    canonicalId: entry.canonical_slug,
    pricing: entry.pricing,
    supportedParameters: entry.supported_parameters,
  };
  const sha256 = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return {
    model: {
      providerId: 'openrouter',
      id: model,
      canonicalId: entry.canonical_slug,
      revision: source.revision + ':' + sha256,
    },
    pricing: {
      costPer1kInput: input * 1000,
      costPer1kOutput: output * 1000,
      costCurrency: 'USD',
      pricingVersion: 'openrouter-catalog-' + sha256.slice(0, 16),
    },
    snapshot,
    sha256,
    at: new Date().toISOString(),
    balanceUSD: balance,
    freeModelDailyRequests: quota,
    freeQuotaVerified: quota !== null,
    isFreeTier: key.data?.is_free_tier === true,
    plannedModelRequests,
    caseIds: [...caseIds],
  };
}
