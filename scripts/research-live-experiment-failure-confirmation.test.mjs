import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createLiveFailureConfirmer } from './research-live-experiment-failure-confirmation.mjs';
import { parseLiveExperimentArgs } from './research-live-experiment-args.mjs';

function fixture() {
  const saved = [],
    calls = [];
  const metadata = {
    id: 'gen-test',
    model: 'vendor/model:free',
    finish_reason: 'stop',
    total_cost: 0,
    native_tokens_prompt: 100,
    native_tokens_completion: 100,
  };
  let output = '{"privateValue":"do-not-save"}',
    status = 200;
  const request = {
    requestId: '00000000-0000-4000-8000-000000000001',
    facts: [{ usage: { inputTokens: 100, outputTokens: 100 } }],
  };
  const confirm = createLiveFailureConfirmer({
    getCredential: () => 'private-credential',
    identityForRequest: () => ({ generationId: 'gen-test', actualModel: 'vendor/model:free' }),
    isModelQualified: (model) => model === 'vendor/model:free',
    save: (_name, value) => saved.push(structuredClone(value)),
    httpClient: async (url, options) => {
      calls.push({ url: String(url), method: options.method });
      assert.equal(options.redirect, 'error');
      assert.equal(options.method, 'GET');
      const content = url.pathname.endsWith('/content');
      return new Response(
        JSON.stringify({ data: content ? { output: { completion: output } } : metadata }),
        { status: content ? status : 200 },
      );
    },
  });
  return {
    request,
    confirm,
    metadata,
    saved,
    calls,
    setOutput: (value) => {
      output = value;
    },
    setStatus: (value) => {
      status = value;
    },
  };
}

test('只有元数据和存储Schema失败一致才确认，不保存正文或凭据', async () => {
  const v = fixture();
  const result = await v.confirm(v.request);
  assert.equal(result.metadataConfirmed, true);
  assert.equal(result.schemaValid, false);
  assert.equal(result.totalCostUSD, '0');
  assert.equal(v.calls.length, 2);
  const serialized = JSON.stringify(v.saved);
  assert.equal(serialized.includes('do-not-save'), false);
  assert.equal(serialized.includes('private-credential'), false);
  assert.equal(serialized.includes('privateValue'), false);
  assert.equal(v.saved.at(-1)[0].outcome, 'confirmed_schema_failure');
});

test('费用、型号、用量、完成状态、内容权限或Schema矛盾均拒绝', async () => {
  const mutations = [
    (v) => {
      v.metadata.total_cost = 0.1;
    },
    (v) => {
      v.metadata.model = 'other/model';
    },
    (v) => {
      v.metadata.native_tokens_prompt = 99;
    },
    (v) => {
      v.metadata.finish_reason = 'length';
    },
    (v) => {
      v.metadata.id = 'gen-other';
    },
    (v) => v.setStatus(403),
    (v) => v.setOutput('{'),
    (v) => v.setOutput('[]'),
    (v) => v.setOutput('x'.repeat(66000)),
    (v) =>
      v.setOutput(
        JSON.stringify(
          JSON.parse(
            readFileSync(
              new URL(
                '../apps/server/test/fixtures/research-experiment-controlled-v1.json',
                import.meta.url,
              ),
              'utf8',
            ),
          ).cases[0].controlledResponses.single,
        ),
      ),
  ];
  for (const mutate of mutations) {
    const v = fixture();
    mutate(v);
    assert.equal(await v.confirm(v.request), null);
    assert(v.calls.every((call) => call.method === 'GET'));
  }
});

test('显式策略仅与OpenRouter多组终态或Nemotron独立历史筛查启用', () => {
  const base = [
    '--provider=openrouter',
    '--output=.recovery-artifacts/test',
    '--continue-confirmed-schema-failures',
  ];
  assert.throws(() => parseLiveExperimentArgs(base));
  assert.equal(
    parseLiveExperimentArgs([...base, '--continue-terminal=source'])
      .continueConfirmedSchemaFailures,
    true,
  );
  assert.throws(() => parseLiveExperimentArgs([...base, '--history=source']));
  assert.equal(
    parseLiveExperimentArgs([
      ...base,
      '--history=source',
      '--model=nvidia/nemotron-3.5-super-vl:free',
    ]).continueConfirmedSchemaFailures,
    true,
  );
});
