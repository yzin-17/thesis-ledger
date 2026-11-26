// 仅接收本轮原生宿主请求；不代理真实 API 或模型。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const source = resolve(process.argv[2] ?? '');
const output = resolve(process.argv[3] ?? '');
assert(
  source.includes('/var/acceptance/') || source.startsWith('/tmp/strategy-definition-editor-'),
);
assert(output.includes('/var/acceptance/'));
const captured = JSON.parse(readFileSync(source, 'utf8'));
if (captured.configuration) assert.equal(captured.category, 'passed');
const definition = captured.configuration ?? captured;
assert.equal(definition.schemaVersion, '3');
mkdirSync(output, { recursive: true, mode: 0o700 });
const requests = [];
const versions = [{ id: 'editor-version', version: 1, schemaVersion: 3, schema: definition }];
const record = () =>
  writeFileSync(
    resolve(output, 'http-receipt.json'),
    JSON.stringify({ source, definition, versions, requests }, null, 2),
    { mode: 0o600 },
  );
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  requests.push({ method: req.method, path: req.url, body });
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === '/api/v1/backtests/strategies') {
    res.end(
      JSON.stringify([
        { id: 'editor-strategy', name: definition.name, status: 'active', versions },
      ]),
    );
  } else if (
    req.method === 'POST' &&
    req.url === '/api/v1/backtests/strategies/editor-strategy/versions'
  ) {
    assert.equal(versions.length, 1, '禁止重复提交');
    versions.push({
      id: 'saved-version',
      version: 2,
      schemaVersion: 3,
      schema: body.schema ?? body,
    });
    res.statusCode = 503;
    res.end(JSON.stringify({ message: '受控回执丢失，读取并找回原保存' }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ message: '未授权的受控路径' }));
  }
  record();
});
server.listen(5193, '127.0.0.1', () => {
  record();
  console.log('原生策略受控接收端就绪 5193');
});
