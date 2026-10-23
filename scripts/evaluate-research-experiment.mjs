import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { AiSdkGenerationAdapter } from '../apps/server/dist/src/ai/ai-sdk-generation.adapter.js';
import { researchExperimentProtocolSchema } from '../apps/server/dist/src/ai/research-experiment-protocol.js';
import { runControlledResearchExperiment } from '../apps/server/dist/src/ai/research-experiment-driver.js';

const [input, ...extra] = process.argv.slice(2);
if (!input || extra.length)
  throw new Error('用法：node scripts/evaluate-research-experiment.mjs <受控固定集 JSON>');
const file = resolve(input);
if (statSync(file).size > 2 * 1024 * 1024) throw new Error('受控固定集不得超过 2 MiB');
const bytes = readFileSync(file, 'utf8');
const protocol = researchExperimentProtocolSchema.parse(JSON.parse(bytes));
const calls = [];
const server = http.createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404);
    response.end('{}');
    return;
  }
  try {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 2000000) throw new Error('受控请求超过预算');
    }
    const wire = JSON.parse(body);
    const content = wire.messages.find((message) => message.role === 'user').content;
    const text =
      typeof content === 'string'
        ? content
        : content
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('\n');
    const context = JSON.parse(text);
    const entry = protocol.cases.find((item) => item.id === context.caseId);
    if (
      !entry ||
      !Object.hasOwn(entry.controlledResponses, context.stage) ||
      wire.model !== protocol.model.id
    )
      throw new Error('受控阶段不匹配');
    calls.push({ caseId: entry.id, arm: context.arm, stage: context.stage });
    response.end(
      JSON.stringify({
        id: 'controlled-' + calls.length,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: protocol.model.id,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(entry.controlledResponses[context.stage]),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 70, completion_tokens: 30, total_tokens: 100 },
      }),
    );
  } catch {
    response.writeHead(400);
    response.end('{"error":{"message":"受控请求不符合协议"}}');
  }
});
const originalFetch = globalThis.fetch;
try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = 'http://127.0.0.1:' + server.address().port;
  globalThis.fetch = (resource, options) => {
    const url = new URL(
      typeof resource === 'string' || resource instanceof URL ? resource : resource.url,
    );
    if (url.origin !== origin) throw new Error('受控实验禁止访问其他响应端');
    return originalFetch(resource, options);
  };
  const adapter = new AiSdkGenerationAdapter();
  const report = await runControlledResearchExperiment(protocol, {
    baseURL: origin + '/v1',
    generate: (request) => adapter.generate(request),
  });
  const auditedRequests = report.cases.reduce(
    (sum, entry) => sum + entry.single.requests.length + entry.staged.requests.length,
    0,
  );
  const transport = {
    receivedRequests: calls.length,
    auditedRequests,
    reconciled: calls.length === auditedRequests,
    calls,
  };
  const implementation = Object.fromEntries(
    [
      'research-experiment-driver.js',
      'research-experiment-protocol.js',
      'ai-sdk-generation.adapter.js',
    ].map((name) => [
      name,
      createHash('sha256')
        .update(readFileSync(new URL('../apps/server/dist/src/ai/' + name, import.meta.url)))
        .digest('hex'),
    ]),
  );
  process.stdout.write(
    JSON.stringify(
      {
        ...report,
        implementation,
        fixedInputSha256: createHash('sha256').update(bytes).digest('hex'),
        transport,
      },
      null,
      2,
    ) + '\n',
  );
  if (!report.passed || !transport.reconciled) process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
