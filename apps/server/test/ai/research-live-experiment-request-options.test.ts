import { expect, it } from 'vitest';
import type { ResearchGenerationV2 } from '@thesis-ledger/schemas';
import { fixture } from './research-live-experiment-fixture.js';
import {
  AiSdkGenerationAdapter,
  type AiSdkGenerationRequest,
} from '../../src/ai/ai-sdk-generation.adapter.js';
import { createLiveExperimentBudget } from '../../src/ai/research-live-experiment-budget.js';
import { runLiveResearchArm } from '../../src/ai/research-live-experiment-arm.js';
import { runLiveResearchExperiment } from '../../src/ai/research-live-experiment-driver.js';
import { liveExperimentRequestFields } from '../../src/ai/research-live-experiment-request-options.js';
import { verifyLiveExperimentResume } from '../../src/ai/research-live-experiment-resume.js';
import { experimentFingerprint } from '../../src/ai/research-experiment-protocol.js';
import {
  CLOUDFLARE_EXPERIMENT_CONTEXT_TOKENS as context,
  FIVE_CASE_SCREENING_CASE_IDS,
  type LiveExperimentProtocol,
} from '../../src/ai/research-live-experiment-protocol.js';

function configuredFixture() {
  const v = fixture();
  const protocol: LiveExperimentProtocol = {
    ...v.protocol,
    version: 'research-live-experiment-v5',
    failurePolicy: 'record_and_continue',
    reasoningEffort: 'low',
    caseIds: [...FIVE_CASE_SCREENING_CASE_IDS],
    requestOptions: {
      headers: { 'cf-aig-gateway-id': 'configured', 'cf-aig-collect-log': 'true' },
      body: { reasoning_effort: 'medium', chat_template_kwargs: { enable_thinking: true } },
      outputTokenLimit: 'upstream',
    },
    budget: {
      ...v.protocol.budget,
      authorizedCalls: 68,
      outputTokenLimit: 'upstream',
      modelContextTokens: context,
      maxInputTokensPerArm: 3 * context,
      maxOutputTokensPerArm: 3 * context,
    },
  };
  return { ...v, protocol };
}

it.each(['upstream', undefined] as const)(
  '输出策略%s：单链和三阶段的SDK序列化遵循前端快照',
  async (outputPolicy) => {
    const v = configuredFixture();
    if (outputPolicy === undefined) delete v.protocol.requestOptions!.outputTokenLimit;
    const sent: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
    const adapter = new AiSdkGenerationAdapter();
    const binding = {
      ...v.binding,
      generate: async (request: AiSdkGenerationRequest<ResearchGenerationV2>) => {
        const expected = await v.generate(request);
        return adapter.generate({
          ...request,
          httpClient: async (_url, init) => {
            sent.push({
              headers: new Headers(init?.headers),
              body: JSON.parse(String(init?.body)),
            });
            const frames = [
              {
                choices: [
                  {
                    index: 0,
                    delta: { content: JSON.stringify(expected.output) },
                    finish_reason: null,
                  },
                ],
              },
              { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
              {
                choices: [],
                usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
              },
            ];
            const body =
              frames
                .map(
                  (frame) =>
                    'data: ' +
                    JSON.stringify({
                      id: 'local-configured',
                      model: v.protocol.model.id,
                      created: 1,
                      ...frame,
                    }) +
                    '\n\n',
                )
                .join('') + 'data: [DONE]\n\n';
            return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
          },
        });
      },
    };
    const budget = createLiveExperimentBudget(v.protocol);
    for (const arm of ['single', 'staged'] as const) {
      const result = await runLiveResearchArm(
        v.benchmark.cases[0]!,
        arm,
        v.protocol,
        binding,
        budget,
      );
      expect(result.status).toBe('complete');
    }
    expect(sent).toHaveLength(4);
    expect(
      v.generate.mock.calls.map(([request]) => JSON.parse(request.messages[1].content).stage),
    ).toEqual(['single', 'organize', 'challenge', 'synthesize']);
    for (const wire of sent) {
      expect(wire.headers.get('cf-aig-gateway-id')).toBe('configured');
      expect(wire.headers.get('cf-aig-collect-log')).toBe('true');
      expect(wire.headers.get('authorization')).toBe('Bearer synthetic-test-key');
      expect(wire.body).toMatchObject(v.protocol.requestOptions!.body!);
      expect(wire.body).not.toHaveProperty('max_tokens');
      expect(wire.body).not.toHaveProperty('max_completion_tokens');
    }
  },
);

it('空配置不注入实验固定头或推理参数，显式预算策略沿用实际预留', () => {
  const v = configuredFixture();
  v.protocol.requestOptions = {};
  expect(liveExperimentRequestFields(v.protocol, 12345)).toEqual({ requestOptions: {} });
  v.protocol.requestOptions = { outputTokenLimit: 'budget' };
  expect(liveExperimentRequestFields(v.protocol, 12345)).toEqual({
    requestOptions: { outputTokenLimit: 'budget' },
    maxOutputTokens: 12345,
  });
});

it.each([{ headers: { Authorization: 'synthetic-private' } }, { body: { messages: [] } }])(
  '非法保存参数在实验派发前拒绝',
  async (requestOptions) => {
    const v = fixture();
    await expect(
      runLiveResearchExperiment(
        { ...v.protocol, requestOptions },
        v.benchmark,
        v.evaluation,
        v.binding,
      ),
    ).rejects.toBeDefined();
    expect(v.generate).not.toHaveBeenCalled();
  },
);

it('配置进入协议摘要；更改参数或从旧无配置协议接续时拒绝复用', () => {
  const v = fixture();
  const oldFingerprint = experimentFingerprint(v.protocol);
  const configured = { ...v.protocol, requestOptions: {} };
  const changed = { ...configured, requestOptions: { headers: { 'x-observation': 'changed' } } };
  for (const [protocol, previous] of [
    [configured, oldFingerprint],
    [changed, experimentFingerprint(configured)],
  ] as const) {
    expect(() =>
      verifyLiveExperimentResume(protocol, v.benchmark, v.evaluation, {
        sourceProtocolFingerprint: previous,
        completedArms: [],
        unresolvedRequests: [],
      }),
    ).toThrow('接续协议与原封存摘要不一致');
  }
});
