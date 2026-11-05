import assert from 'node:assert/strict';
import { request } from 'node:http';

export const targetFaultModel = '@cf/qwen/qwen3.8-27b';
export const targetFaultContracts = [
  { id: 'research', version: 'research-generation-v2' },
  { id: 'strategy_authoring_analysis', version: 'authoring-analysis-v1' },
];

export function targetFaultDraft(row, origin, apiKey, free) {
  const s = row.settings;
  const selected = [
    'authMode',
    'upstreamFormat',
    'chatImplementation',
    'compatibilityExtensionProfile',
    'timeoutMs',
  ];
  const input = {
    ...Object.fromEntries(
      selected.filter((key) => s[key] !== undefined).map((key) => [key, s[key]]),
    ),
    name: 'cloudflare',
    enabled: true,
    priority: row.priority,
    baseUrl: origin,
    models: s.models,
    modelPricing: Object.fromEntries(
      Object.entries(s.modelPricing).map(([model, rates]) => [
        model,
        Object.fromEntries(
          ['costPer1kInput', 'costPer1kOutput', 'costCurrency']
            .filter((key) => rates[key] !== undefined)
            .map((key) => [key, rates[key]]),
        ),
      ]),
    ),
    expectedRevision: row.updatedAt.toISOString(),
    ...(apiKey ? { apiKey } : {}),
    executionRoutes: targetFaultContracts.map((contract) => ({
      model: targetFaultModel,
      contract,
      mode: 'json_mode',
      outputPolicy: 'manual',
      enabled: true,
    })),
  };
  assert(input.models.includes(targetFaultModel));
  if (free)
    input.modelPricing = {
      ...input.modelPricing,
      [targetFaultModel]: {
        costPer1kInput: 0,
        costPer1kOutput: 0,
        costCurrency: 'USD',
      },
    };
  input.modelDefaults = {
    [targetFaultModel]: {
      mode: 'json_mode',
      requestOptions: {
        body: { chat_template_kwargs: { enable_thinking: false } },
        headers: {
          'cf-aig-gateway-id': 'default',
          'cf-aig-collect-log': 'true',
          'cf-aig-collect-log-payload': 'true',
        },
        ...(free ? { outputTokenLimit: 'upstream' } : {}),
      },
    },
  };
  return input;
}

export function targetFaultApi(path, body) {
  assert(
    ['/test', '/validation-plan', '/test-and-save', '/cloudflare/validation/cancel'].includes(path),
  );
  const bytes = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: `/api/v1/ai/providers${path}`,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': bytes.length },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) req.destroy(new Error('目标API响应过大'));
          else chunks.push(chunk);
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
            });
          } catch (error) {
            reject(error);
          }
        });
        res.on('error', reject);
      },
    );
    req.setTimeout(700000, () => req.destroy(new Error('验收API外层等待结束')));
    req.on('error', reject);
    req.end(bytes);
  });
}
