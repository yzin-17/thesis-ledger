import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertOwnedAccount, assertRuntimeTarget } from './portfolio-calibration-acceptance.mjs';

test('账户 UUID、名称、模式和类型必须同时属于声明的验收对象', () => {
  const account = {
    id: '11111111-1111-4111-8111-111111111111',
    name: '风险与正式校准验收-20261017-abcdef12',
    mode: 'actual',
    type: 'securities',
    currency: 'CNY',
  };
  assert.doesNotThrow(() => assertOwnedAccount(account, account));
  for (const change of [
    { id: 'other' },
    { name: '原有账户' },
    { mode: 'shadow' },
    { type: 'cash' },
  ])
    assert.throws(() => assertOwnedAccount({ ...account, ...change }, account));
});
test('拒绝其他 Compose 项目、服务、非健康容器或未停止 AI 的环境', () => {
  const target = {
    Config: {
      Labels: {
        'com.docker.compose.project': 'thesis-ledger-dev',
        'com.docker.compose.service': 'thesis-ledger',
      },
      Env: ['AI_RESEARCH_EXECUTION_ENABLED=false'],
    },
    State: { Status: 'running', Health: { Status: 'healthy' } },
  };
  assert.doesNotThrow(() => assertRuntimeTarget(target));
  const other = structuredClone(target);
  other.Config.Labels['com.docker.compose.project'] = 'other';
  assert.throws(() => assertRuntimeTarget(other));
  const unsafe = structuredClone(target);
  unsafe.Config.Env = [];
  assert.throws(() => assertRuntimeTarget(unsafe));
});
