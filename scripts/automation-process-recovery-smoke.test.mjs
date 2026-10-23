import assert from 'node:assert/strict';
import test from 'node:test';
import {
  stableTarget,
  validateTarget,
  validateTemporary,
} from './automation-process-recovery-smoke.mjs';

const target = () => ({
  Id: 'server-id',
  Image: `sha256:${'a'.repeat(64)}`,
  Mounts: [{ Type: 'volume', Name: 'protected-volume' }],
  Config: {
    WorkingDir: '/app',
    Labels: {
      'com.docker.compose.project': 'thesis-ledger-dev',
      'com.docker.compose.service': 'thesis-ledger',
    },
  },
  State: { Running: true, StartedAt: 'stable-start', Health: { Status: 'healthy' } },
  NetworkSettings: { Networks: { 'thesis-ledger-dev_default': {} } },
});

test('只接受健康的明确 Compose Server，不对 Worker 或其他项目执行故障入口', () => {
  assert.equal(validateTarget(target(), 'thesis-ledger-dev'), 'thesis-ledger-dev_default');
  for (const mutate of [
    (t) => {
      t.Config.Labels['com.docker.compose.project'] = 'other-project';
    },
    (t) => {
      t.Config.Labels['com.docker.compose.service'] = 'backtest-worker';
    },
    (t) => {
      t.State.Health.Status = 'unhealthy';
    },
    (t) => {
      t.State.Running = false;
    },
    (t) => {
      t.NetworkSettings.Networks = {};
    },
    (t) => {
      t.Config.WorkingDir = '/unexpected';
    },
  ]) {
    const candidate = target();
    mutate(candidate);
    assert.throws(() => validateTarget(candidate, 'thesis-ledger-dev'));
  }
});

test('清理只接受同令牌的 tmpfs 临时容器，拒绝卷、绑定目录和原服务', () => {
  const name = 'ledger-automation-test-1234abcd';
  const candidate = {
    Name: `/${name}`,
    Config: {
      Labels: {
        'io.thesisledger.acceptance': 'automation-process-recovery',
        'io.thesisledger.acceptance-token': 'owned-token',
      },
    },
    Mounts: [{ Type: 'tmpfs', Destination: '/var/lib/postgresql/data' }],
    HostConfig: { Tmpfs: { '/var/lib/postgresql/data': 'rw,size=256m' } },
  };
  validateTemporary(candidate, 'owned-token', name);
  validateTemporary({ ...candidate, Mounts: [] }, 'owned-token', name);
  assert.throws(() =>
    validateTemporary({ ...candidate, HostConfig: { Tmpfs: {} } }, 'owned-token', name),
  );
  assert.throws(() => validateTemporary(candidate, 'other-token', name));
  assert.throws(() =>
    validateTemporary(candidate, 'owned-token', 'thesis-ledger-dev-thesis-ledger-1'),
  );
  for (const Type of ['volume', 'bind'])
    assert.throws(() =>
      validateTemporary({ ...candidate, Mounts: [{ Type }] }, 'owned-token', name),
    );
});

test('服务身份快照保留启动时点、镜像和全部受保护挂载', () => {
  const value = target();
  assert.deepEqual(stableTarget(value), {
    id: value.Id,
    image: value.Image,
    mounts: value.Mounts,
    startedAt: value.State.StartedAt,
  });
});
