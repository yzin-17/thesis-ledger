import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';

export const cashMockProject = 'thesis-ledger-dev';
export const cashMockKind = 'cash-notification-mock';
export const cashMockDatabase = 'cash_notification_fixture';
export const cashMockOwner = 'fixture_owner';
export const cashMockLabel = 'io.thesisledger.acceptance';
const tokenPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;

export function cashMockNames(token) {
  assert.match(token, tokenPattern, '隔离令牌必须是UUID');
  const suffix = token.replaceAll('-', '').slice(0, 8);
  return {
    postgres: `ledger-cash-notice-pg-${suffix}`,
    redis: `ledger-cash-notice-redis-${suffix}`,
  };
}

export function parseCashMockArguments(args) {
  const options = {};
  for (const arg of args) {
    const match = /^--(output|cleanup-token|mode)=(.+)$/u.exec(arg);
    assert.ok(match, '只接受output、cleanup-token及固定mode');
    assert.ok(!Object.hasOwn(options, match[1]), '参数不得重复');
    options[match[1]] = match[2];
  }
  assert.ok(options.output && isAbsolute(options.output), '必须提供绝对输出路径');
  if (options['cleanup-token']) cashMockNames(options['cleanup-token']);
  assert.ok(!options.mode || options.mode === 'feishu-live', '不支持该通知验收模式');
  return options;
}

export function parseFeishuHookSource(source) {
  const assignments = source
    .split(/\r?\n/u)
    .map((line) => /^\s*(?:export\s+)?FEISHU_HOOK\s*=\s*(.*)$/u.exec(line))
    .filter(Boolean);
  assert.equal(assignments.length, 1, 'FEISHU_HOOK必须存在且仅有一项字面量定义');
  const raw = assignments[0][1];
  const quoted = /^(['"])([^\r\n]*?)\1(?:\s+#.*|\s*)$/u.exec(raw);
  const plain = /^([^\s'"\\]+)(?:\s+#.*|\s*)$/u.exec(raw);
  const value = quoted?.[2] ?? plain?.[1];
  assert.ok(value && !/[$`\\'"\s]/u.test(value), 'FEISHU_HOOK必须是无表达式的字面量');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('FEISHU_HOOK地址格式无效');
  }
  assert.ok(
    url.protocol === 'https:' &&
      ['open.feishu.cn', 'open.larksuite.com'].includes(url.hostname) &&
      (!url.port || url.port === '443') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]+$/u.test(url.pathname),
    'FEISHU_HOOK必须是无额外参数的官方HTTPS Webhook',
  );
  return url.href;
}

export function redactFeishuDiagnostic(value, webhook) {
  let text = String(value);
  if (webhook) {
    text = text.replaceAll(webhook, '[已隐藏Webhook]');
    const token = new URL(webhook).pathname.split('/').at(-1);
    text = text.replaceAll(token, '[已隐藏令牌]');
  }
  return text.replace(
    /https:\/\/(?:open\.feishu\.cn|open\.larksuite\.com)\/open-apis\/bot\/v2\/hook\/[^\s"'<>]+/giu,
    '[已隐藏Webhook]',
  );
}

export function validateCashMockTemporary(target, token, role) {
  assert.ok(['postgres', 'redis'].includes(role));
  const name = cashMockNames(token)[role];
  const directory = role === 'postgres' ? '/var/lib/postgresql/data' : '/data';
  assert.equal(target.Name, `/${name}`);
  assert.equal(target.Config.Labels[cashMockLabel], cashMockKind);
  assert.equal(target.Config.Labels['io.thesisledger.acceptance-token'], token);
  assert.equal(target.Config.Labels['io.thesisledger.acceptance-role'], role);
  assert.ok(Object.hasOwn(target.NetworkSettings.Networks, `${cashMockProject}_default`));
  assert.ok(target.Mounts.every((mount) => mount.Type === 'tmpfs'));
  assert.ok(Object.hasOwn(target.HostConfig.Tmpfs ?? {}, directory));
  assert.equal(Object.keys(target.HostConfig.PortBindings ?? {}).length, 0);
}

export function validateCashMockRedisTarget(target) {
  assert.equal(target.Config.Labels['com.docker.compose.project'], cashMockProject);
  assert.equal(target.Config.Labels['com.docker.compose.service'], 'redis');
  assert.equal(target.State.Running, true);
  assert.match(target.Config.Image, /^redis:[\w.-]+$/u);
  assert.match(target.Image, /^sha256:[a-f0-9]{64}$/u);
  return target.Image;
}
