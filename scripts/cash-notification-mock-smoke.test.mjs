import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { cashMockProtectedSnapshotSource } from './cash-notification-mock-smoke.mjs';
import {
  cashMockNames,
  parseCashMockArguments,
  parseFeishuHookSource,
  redactFeishuDiagnostic,
  validateCashMockRedisTarget,
  validateCashMockTemporary,
} from './cash-notification-mock.contract.mjs';

const token = '1234abcd-1234-4234-8234-123456789abc';
const fixtureHook = new URL(
  'fixture-hook-1234567890',
  'https://open.feishu.cn/open-apis/bot/v2/hook/',
).href;

test('真实模式固定为单次飞书路径，默认仍为模拟且不接受额外目标', () => {
  assert.equal(
    parseCashMockArguments(['--output=/tmp/a', '--mode=feishu-live']).mode,
    'feishu-live',
  );
  for (const args of [
    ['--output=/tmp/a', '--mode=arbitrary'],
    ['--output=/tmp/a', '--webhook=https://example.test'],
    ['--output=/tmp/a', '--request-limit=2'],
  ])
    assert.throws(() => parseCashMockArguments(args));
});

test('只解析唯一官方Webhook字面量，不执行Shell或展开表达式', () => {
  for (const source of [
    `export FEISHU_HOOK="${fixtureHook}" # 仅验收`,
    `FEISHU_HOOK='${fixtureHook}'`,
    `FEISHU_HOOK=${fixtureHook}`,
  ])
    assert.equal(parseFeishuHookSource(source), fixtureHook);
  for (const source of [
    '# FEISHU_HOOK=missing',
    `FEISHU_HOOK=${fixtureHook}\nFEISHU_HOOK=${fixtureHook}`,
    'FEISHU_HOOK="$(echo secret)"',
    'FEISHU_HOOK="${TOKEN}"',
    'FEISHU_HOOK="`echo secret`"',
    `FEISHU_HOOK=${fixtureHook}; echo unsafe`,
    'FEISHU_HOOK=https://example.test/secret',
    `FEISHU_HOOK=${fixtureHook}?secret=value`,
    `FEISHU_HOOK=${fixtureHook}#fragment`,
    `FEISHU_HOOK=${fixtureHook.replace('https:', 'http:')}`,
    `FEISHU_HOOK=${fixtureHook.replace('open.feishu.cn', 'open.feishu.cn.attacker.test')}`,
  ])
    assert.throws(() => parseFeishuHookSource(source));
});

test('诊断隐藏完整Webhook和令牌，失败信息不含真实地址', () => {
  const hidden = redactFeishuDiagnostic(
    `失败：${fixtureHook} 令牌 fixture-hook-1234567890`,
    fixtureHook,
  );
  assert(!hidden.includes(fixtureHook));
  assert(!hidden.includes('fixture-hook-1234567890'));
  try {
    parseFeishuHookSource('FEISHU_HOOK=https://secret.invalid/private-token');
    assert.fail('应拒绝非官方地址');
  } catch (error) {
    assert(!error.message.includes('secret.invalid'));
    assert(!error.message.includes('private-token'));
  }
});

test('只读快照生成代码必须先通过语法检查，SQL引号不破坏子程序', () => {
  const source = cashMockProtectedSnapshotSource();
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: source,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert(source.includes('SET TRANSACTION READ ONLY'));
  assert(source.includes("i.database!=='thesis_ledger'"));
  assert(source.includes("i.role!=='thesis_ledger_app'"));
});
const target = (role) => ({
  Name: `/${cashMockNames(token)[role]}`,
  Config: {
    Labels: {
      'io.thesisledger.acceptance': 'cash-notification-mock',
      'io.thesisledger.acceptance-token': token,
      'io.thesisledger.acceptance-role': role,
    },
  },
  NetworkSettings: { Networks: { 'thesis-ledger-dev_default': {} } },
  Mounts: [{ Type: 'tmpfs' }],
  HostConfig: {
    Tmpfs: { [role === 'postgres' ? '/var/lib/postgresql/data' : '/data']: 'rw,size=16m' },
    PortBindings: {},
  },
});

test('入口拒绝任意目标、命令、重复参数和不完整清理许可', () => {
  assert.deepEqual(parseCashMockArguments(['--output=/tmp/receipt.json']), {
    output: '/tmp/receipt.json',
  });
  assert.equal(
    parseCashMockArguments([`--cleanup-token=${token}`, '--output=/tmp/receipt.json'])[
      'cleanup-token'
    ],
    token,
  );
  for (const args of [
    [],
    ['--output=relative.json'],
    ['--server=production', '--output=/tmp/a'],
    ['--output=/tmp/a', '--output=/tmp/b'],
    ['--output=/tmp/a', '--cleanup-token=bad'],
    ['--command=rm'],
  ])
    assert.throws(() => parseCashMockArguments(args));
});

test('临时资源必须匹配令牌、角色、网络和名称，不能清理正常服务', () => {
  for (const role of ['postgres', 'redis']) {
    validateCashMockTemporary(target(role), token, role);
    const changed = (mutate) => {
      const candidate = structuredClone(target(role));
      mutate(candidate);
      return candidate;
    };
    for (const candidate of [
      changed((t) => {
        t.Name = '/thesis-ledger-dev-postgres-1';
      }),
      changed((t) => {
        t.Config.Labels['io.thesisledger.acceptance-token'] = 'foreign-token';
      }),
      changed((t) => {
        t.Config.Labels['io.thesisledger.acceptance'] = 'other-work';
      }),
      changed((t) => {
        t.Config.Labels['io.thesisledger.acceptance-role'] = 'other';
      }),
      changed((t) => {
        t.NetworkSettings.Networks = {};
      }),
    ])
      assert.throws(() => validateCashMockTemporary(candidate, token, role));
  }
});

test('拒绝持久卷、绑定目录、缺少tmpfs声明和发布宿主端口', () => {
  for (const role of ['postgres', 'redis'])
    for (const mutate of [
      (t) => {
        t.Mounts = [{ Type: 'volume' }];
      },
      (t) => {
        t.Mounts = [{ Type: 'bind' }];
      },
      (t) => {
        t.HostConfig.Tmpfs = {};
      },
      (t) => {
        t.HostConfig.PortBindings = { '6379/tcp': [{ HostPort: '6379' }] };
      },
    ]) {
      const candidate = structuredClone(target(role));
      mutate(candidate);
      assert.throws(() => validateCashMockTemporary(candidate, token, role));
    }
});

test('Redis镜像只能复用本项目既有Redis角色，不拉取未知镜像', () => {
  const candidate = {
    Config: {
      Image: 'redis:8-alpine',
      Labels: {
        'com.docker.compose.project': 'thesis-ledger-dev',
        'com.docker.compose.service': 'redis',
      },
    },
    State: { Running: true },
    Image: `sha256:${'a'.repeat(64)}`,
  };
  assert.equal(validateCashMockRedisTarget(candidate), candidate.Image);
  for (const mutate of [
    (t) => {
      t.Config.Labels['com.docker.compose.project'] = 'other-project';
    },
    (t) => {
      t.Config.Labels['com.docker.compose.service'] = 'postgres';
    },
    (t) => {
      t.State.Running = false;
    },
    (t) => {
      t.Config.Image = 'unknown/custom:latest';
    },
  ]) {
    const value = structuredClone(candidate);
    mutate(value);
    assert.throws(() => validateCashMockRedisTarget(value));
  }
});
