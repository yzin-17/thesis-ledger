import assert from 'node:assert/strict';
import test from 'node:test';
import {
  freezeOpenRouterExperimentModel,
  openRouterFreeModel,
  createOpenRouterFreeRequestPacer,
  openRouterNemotronModel,
} from './research-live-experiment-openrouter.mjs';

test('免费请求间隔保留每次派发且可取消，复用现有可取消delay', async () => {
  let now = 1000;
  const waits = [];
  const pace = createOpenRouterFreeRequestPacer({
    now: () => now,
    wait: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });
  await pace();
  now += 100;
  await pace();
  now += 4000;
  await pace();
  assert.deepEqual(waits, [3000]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => pace(controller.signal), { name: 'AbortError' });
});

test('Nemotron封存指定5例，仅需20次额度，身份/费率/额度漂移不派发', async () => {
  for (const change of ['valid', 'identity', 'price', 'quota']) {
    const v = fixture();
    v.data.models.data = [
      {
        id: openRouterNemotronModel,
        canonical_slug: 'nvidia/nemotron-3.5-super-vl-20261015',
        pricing: { prompt: '0', completion: '0' },
        supported_parameters: ['response_format'],
      },
    ];
    v.data.key.data.free_model_daily_requests.remaining = 20;
    if (change === 'identity') v.data.models.data[0].canonical_slug = 'changed';
    if (change === 'price') v.data.models.data[0].pricing.completion = '0.01';
    if (change === 'quota') v.data.key.data.free_model_daily_requests.remaining = 19;
    const run = () => freezeOpenRouterExperimentModel(v.source, openRouterNemotronModel, v.fetch);
    if (change === 'valid') {
      const plan = await run();
      assert.equal(plan.plannedModelRequests, 20);
      assert.deepEqual(plan.caseIds, [
        'single-price',
        'currencies',
        'future-publication',
        'dividend-proposal',
        'prompt-injection',
      ]);
    } else await assert.rejects(run);
    assert(v.calls.every((c) => c.options.method === 'GET'));
  }
});
import { assertLiveExperimentRequest } from './research-live-experiment-target.mjs';

function fixture() {
  const data = {
    models: {
      data: [
        {
          id: openRouterFreeModel,
          canonical_slug: 'google/gemma-4-26b-a4b-it-20260403',
          pricing: { prompt: '0', completion: '0' },
          supported_parameters: ['response_format'],
        },
      ],
    },
    key: {
      data: {
        is_free_tier: true,
        limit_remaining: null,
        free_model_daily_requests: { used: 0, limit: 50, remaining: 50 },
      },
    },
    credits: { data: { total_credits: 0, total_usage: 0 } },
  };
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const endpoint = new URL(url).pathname.endsWith('/models/user')
      ? 'models'
      : new URL(url).pathname.split('/').at(-1);
    return Response.json(data[endpoint]);
  };
  const source = { providerId: 'openrouter', revision: 'r1', apiKey: 'synthetic-private-key' };
  return { data, calls, fetch, source };
}

test('只读封存具体免费型号、目录费率和28次可用额度，不保存凭据', async () => {
  const v = fixture();
  const plan = await freezeOpenRouterExperimentModel(v.source, openRouterFreeModel, v.fetch);
  assert.equal(plan.model.id, openRouterFreeModel);
  assert.equal(plan.pricing.costPer1kInput, 0);
  assert.equal(plan.plannedModelRequests, 28);
  assert.equal(plan.freeModelDailyRequests.remaining, 50);
  assert.equal(plan.freeQuotaVerified, true);
  assert(!JSON.stringify(plan).includes(v.source.apiKey));
  assert.equal(v.calls.length, 3);
  for (const { url, options } of v.calls) {
    assert.equal(new URL(url).origin, 'https://openrouter.ai');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
  }
});

test('随机型号、目录漂移、带费免费型号或不足28次额度均不产生生成请求', async () => {
  for (const change of ['random', 'identity', 'price', 'quota']) {
    const v = fixture();
    if (change === 'identity') v.data.models.data[0].canonical_slug = 'changed';
    if (change === 'price') v.data.models.data[0].pricing.prompt = '0.001';
    if (change === 'quota') v.data.key.data.free_model_daily_requests.remaining = 27;
    await assert.rejects(() =>
      freezeOpenRouterExperimentModel(
        v.source,
        change === 'random' ? 'openrouter/free' : openRouterFreeModel,
        v.fetch,
      ),
    );
    assert(v.calls.every((call) => call.options.method === 'GET'));
  }
});

test('固定OpenRouter Chat POST拒绝跨Provider、查询、重定向地址与URL凭据', () => {
  const base = 'https://openrouter.ai/api/v1';
  assert.doesNotThrow(() =>
    assertLiveExperimentRequest('openrouter', base, base + '/chat/completions', 'POST'),
  );
  for (const [provider, target, method] of [
    ['cloudflare', base + '/chat/completions', 'POST'],
    ['openrouter', base + '/chat/completions?key=synthetic', 'POST'],
    ['openrouter', 'https://example.test/api/v1/chat/completions', 'POST'],
    ['openrouter', base.replace('https://', 'https://private@') + '/chat/completions', 'POST'],
    ['openrouter', base + '/chat/completions', 'GET'],
  ])
    assert.throws(() => assertLiveExperimentRequest(provider, base, target, method));
});

test('固定付费Qwen先检查现有余额，余额不足不派发，足额时不受免费日额度影响', async () => {
  const v = fixture();
  v.data.models.data = [
    {
      id: 'qwen/qwen3.8-27b',
      canonical_slug: 'qwen/qwen3.8-27b-20260814',
      pricing: { prompt: '0.00000015', completion: '0.000001875' },
      supported_parameters: ['response_format'],
    },
  ];
  await assert.rejects(
    () => freezeOpenRouterExperimentModel(v.source, 'qwen/qwen3.8-27b', v.fetch),
    /余额不足/,
  );
  v.data.credits.data.total_credits = 1;
  v.data.key.data.free_model_daily_requests.remaining = 0;
  const plan = await freezeOpenRouterExperimentModel(v.source, 'qwen/qwen3.8-27b', v.fetch);
  assert.equal(plan.model.id, 'qwen/qwen3.8-27b');
  assert.equal(plan.pricing.costPer1kInput, 0.00015);
  assert.equal(plan.plannedModelRequests, 28);
  assert(v.calls.every((call) => call.options.method === 'GET'));
});
