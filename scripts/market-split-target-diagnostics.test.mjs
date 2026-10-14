import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeSplitClientFailure } from './market-split-target-acceptance.mjs';

test('脱敏保留DsaClient内层码及HTTP状态，不保留消息/请求/响应/凭据', () => {
  const secret = 'private-token-fixture';
  const result = safeSplitClientFailure({ code: 'invalid-response', status: 503,
    message: secret, request: { headers: { authorization: secret } }, response: { body: secret } });
  assert.deepEqual(result, { stage: 'dsa_transport_or_protocol', code: 'invalid-response', httpStatus: 503 });
  assert(!JSON.stringify(result).includes(secret));
});

test('未知/敏感码和非HTTP状态都降为未知，不猜源失败阶段', () => {
  for (const status of [true, '503', NaN, 0, 600]) {
    assert.deepEqual(safeSplitClientFailure({ code: 'private-token-fixture', status }),
      { stage: 'dsa_transport_or_protocol', code: 'unknown', httpStatus: null });
  }
  assert.equal(safeSplitClientFailure(new Error('private-token-fixture')).code, 'unknown');
});

test('嵌入目标驱动的纯函数独立运行，不依赖宿主模块变量', () => {
  const embedded = Function(`return (${safeSplitClientFailure.toString()})`)();
  assert.deepEqual(embedded({ code: 'unavailable', status: 503 }), safeSplitClientFailure({ code: 'unavailable', status: 503 }));
});
