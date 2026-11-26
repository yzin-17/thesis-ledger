import { createServer } from 'node:http';
import { once } from 'node:events';

export async function createSourceFaultControlled(generationSample, newsSample) {
  const server = createServer((request, response) => {
    void (async () => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      const input = text ? JSON.parse(text) : null;
      const path = new URL(request.url, 'http://127.0.0.1').pathname;
      const send = (value) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(value));
      };
      if (path.endsWith('/cache-context'))
        return send({
          contractVersion: 1,
          consumer: 'thesis-ledger',
          requestId: input.requestId,
          symbol: input.symbol,
          capability: input.capability,
          routeKey: {
            kind: 'data',
            market: 'CN',
            assetType: 'STOCK',
            capability: input.capability,
          },
          generation: 'a'.repeat(64),
          policyRevision: 1,
          ready: true,
          reason: null,
        });
      if (path.endsWith('/quote'))
        return send({
          version: 3,
          symbol: '600519.SH',
          open: 100,
          high: 100,
          low: 100,
          price: 100,
          previousClose: 100,
          volume: 10,
          amount: 1000,
          provider: 'controlled-data',
          upstreamSource: 'controlled-prices',
          marketTime: new Date(Date.now() - 1000).toISOString(),
          fetchedAt: new Date().toISOString(),
          freshness: 'live',
          stale: false,
          units: { priceCurrency: 'CNY', volume: 'share', turnoverCurrency: 'CNY' },
        });
      if (path.endsWith('/news')) {
        const sample = structuredClone(newsSample);
        sample.requestId = input.requestId;
        sample.instrument = input.instrument;
        sample.coverage.publishedStart = input.publishedStart;
        sample.coverage.publishedEnd = input.publishedEnd;
        sample.fetchedAt = new Date().toISOString();
        for (const item of sample.items) {
          item.publishedAt = new Date(Date.now() - 1000).toISOString();
          item.sourceAvailableAt = item.publishedAt;
          item.fetchedAt = sample.fetchedAt;
        }
        return send(sample);
      }
      if (path.endsWith('/chat/completions')) {
        const content = input.messages.findLast((row) => row.role === 'user').content;
        const research = JSON.parse(content.slice(content.indexOf('RESEARCH_REQUEST_JSON:') + 22));
        const output = JSON.parse(
          JSON.stringify(generationSample)
            .replaceAll('00000000-0000-4000-8000-000000000002', research.materials[0].evidenceId)
            .replaceAll(
              '00000000-0000-4000-8000-000000000001',
              research.instruments[0].instrumentId,
            ),
        );
        output.unknowns.push('新闻资料交付失败，未使用新闻内容。');
        const common = {
          id: 'controlled-source-fault',
          object: 'chat.completion.chunk',
          created: 1,
          model: input.model,
        };
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        for (const extra of [
          {
            choices: [
              { index: 0, delta: { content: JSON.stringify(output) }, finish_reason: null },
            ],
          },
          { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
          {
            choices: [],
            usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13, cost: 0 },
          },
        ])
          response.write(`data: ${JSON.stringify({ ...common, ...extra })}\n\n`);
        return response.end('data: [DONE]\n\n');
      }
      response.writeHead(404);
      response.end();
    })().catch(() => response.destroy());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
