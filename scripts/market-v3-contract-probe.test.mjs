import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { probeMarketV3Contract } from './market-v3-contract-probe.mjs';

const fixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`../packages/schemas/fixtures/${name}`, import.meta.url), 'utf8'),
  );
async function environment(overrides = {}) {
  const calls = [];
  const catalog = await fixture('market-route-catalog-v3.complete.json');
  const handshake = await fixture('market-control-v3.handshake.response.json');
  const capabilities = await fixture('market-data-v3.capabilities.json');
  return {
    calls,
    options: {
      origin: 'http://localhost:8765',
      controlToken: 'local-fixture-control',
      dataToken: 'local-fixture-data',
      fetchImpl: async (url, init) => {
        calls.push({ url: url.pathname, ...init });
        if (init.headers?.authorization?.startsWith('Bearer invalid-'))
          return new Response('{}', { status: overrides.bypass ? 200 : 401 });
        if (overrides.httpFailure) return new Response('PRIVATE_PROVIDER_PAYLOAD', { status: 500 });
        if (url.pathname.endsWith('/market/bars')) {
          if (overrides.dataUnauthorized) return new Response('{}', { status: 401 });
          return Response.json({ contractVersion: 3,
            requestId: overrides.wrongDataId ? 'wrong' : JSON.parse(init.body).requestId,
            error: { code: 'unsupported_data_contract_version', message: '不支持请求的数据契约版本' },
          }, { status: 422 });
        }
        if (url.pathname === '/api/v3/thesis-ledger/capabilities')
          return Response.json(overrides.capabilities ?? capabilities);
        if (url.pathname === '/api/v1/thesis-ledger/control/handshake')
          return Response.json({}, { status: overrides.oldHandshakeAvailable ? 200 : 404 });
        if (url.pathname.endsWith('/handshake'))
          return Response.json({
            ...handshake,
            requestId: overrides.wrongId ? 'wrong' : JSON.parse(init.body).requestId,
          });
        return Response.json(overrides.catalog ?? catalog);
      },
    },
  };
}

test('V3 协议探针只读取能力和目录并协商握手，不应用策略或获取行情', async () => {
  const f = await environment();
  assert.equal((await probeMarketV3Contract(f.options)).scope, 'market-v3-protocol-only');
  assert.equal(f.calls.length, 8);
  const handshakeCalls = f.calls.filter((call) => call.url.endsWith('/handshake'));
  assert.equal(handshakeCalls.length, 3);
  assert.equal(
    handshakeCalls.filter((call) => call.url === '/api/v3/thesis-ledger/control/handshake').length,
    2,
  );
  const dataCall = f.calls.find((call) => call.headers?.authorization === 'Bearer local-fixture-data');
  assert.equal(JSON.parse(dataCall.body).contractVersion, 0);
  assert.equal(JSON.parse(dataCall.body).symbol, undefined);
  const authorized = f.calls.filter(
    (call) => call.headers?.authorization === 'Bearer local-fixture-control',
  );
  assert.equal(authorized.length, 3);
  assert.ok(
    authorized.every(
      (call) => !call.url.endsWith('/market/bars') && !call.url.includes('/policies'),
    ),
  );
  assert.ok(
    f.calls.every((call) => call.redirect === 'error' && call.signal instanceof AbortSignal),
  );
});
test('旧版 Data 声明不能代替 V3', async () => {
  const f = await environment({ capabilities: { dataContractVersions: [1, 2] } });
  await assert.rejects(probeMarketV3Contract(f.options), /Data Contract V3/);
});
test('旧版 Control 握手仍可调用时协议探针失败', async () => {
  const f = await environment({ oldHandshakeAvailable: true });
  await assert.rejects(probeMarketV3Contract(f.options), /状态异常/);
});
test('握手请求身份必须匹配', async () => {
  const f = await environment({ wrongId: true });
  await assert.rejects(probeMarketV3Contract(f.options), /请求身份不匹配/);
});
test('partial 目录不能通过兼容验收', async () => {
  const f = await environment({ catalog: await fixture('market-route-catalog-v3.partial.json') });
  await assert.rejects(probeMarketV3Contract(f.options), /目录无效或不完整/);
});
test('无效凭据被接受时阻断', async () => {
  const f = await environment({ bypass: true });
  await assert.rejects(probeMarketV3Contract(f.options), /未拒绝无效凭据/);
});
test('错误不包含响应体或凭据', async () => {
  const f = await environment({ httpFailure: true });
  await assert.rejects(probeMarketV3Contract(f.options), (error) => {
    assert.ok(!error.message.includes('PRIVATE_PROVIDER_PAYLOAD'));
    assert.ok(!error.message.includes(f.options.controlToken));
    return /状态异常/.test(error.message);
  });
});
test('缺 Token 或 origin 含用户信息时在请求前拒绝', async () => {
  const f = await environment();
  await assert.rejects(
    probeMarketV3Contract({ ...f.options, dataToken: '' }), /缺少 Data Token/,
  );
  await assert.rejects(
    probeMarketV3Contract({ ...f.options, controlToken: '' }),
    /缺少 Control Token/,
  );
  await assert.rejects(
    probeMarketV3Contract({ ...f.options, origin: 'http://user:secret@localhost:8765' }),
    /只包含/,
  );
  assert.equal(f.calls.length, 0);
});
test('Control 正常但 Data Token 不可用时不能通过', async () => {
  const f = await environment({ dataUnauthorized: true });
  await assert.rejects(probeMarketV3Contract(f.options), /状态异常/);
});
test('Data 校验错误的请求身份必须匹配', async () => {
  const f = await environment({ wrongDataId: true });
  await assert.rejects(probeMarketV3Contract(f.options), /校验边界无效/);
});
