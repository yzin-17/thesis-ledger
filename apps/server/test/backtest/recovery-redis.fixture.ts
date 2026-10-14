import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

const label = 'thesis-ledger.backtest-recovery-redis';
const docker = (args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

export async function startRecoveryRedis() {
  const nonce = randomUUID();
  const containerName = `tl-backtest-recovery-redis-${process.pid}-${nonce.slice(0, 8)}`;
  const directory = await mkdtemp(join(tmpdir(), 'tl-backtest-recovery-redis-'));
  // 固定本轮随机选出的端口；Docker 的空 HostPort 在 stop/start 后会重分配。
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done));
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((done, reject) =>
    reservation.close((error) => (error ? reject(error) : done())),
  );
  const image = docker(['image', 'inspect', '--format', '{{.Id}}', 'redis:8-alpine']);
  let started = false;
  const assertOwner = () => {
    if (
      docker(['inspect', '--format', `{{ index .Config.Labels "${label}" }}`, containerName]) !==
      nonce
    ) {
      throw new Error('专属 Redis 标签不符，拒绝故障注入或清理');
    }
  };
  const ready = async () => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        if (docker(['exec', containerName, 'redis-cli', 'ping']) === 'PONG') return;
      } catch {
        /* 仅等待本测试容器 */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('专属 Redis 未就绪');
  };
  try {
    docker([
      'run',
      '--detach',
      '--name',
      containerName,
      '--label',
      `${label}=${nonce}`,
      '--publish',
      `127.0.0.1:${port}:6379`,
      '--mount',
      `type=bind,source=${directory},target=/data`,
      image,
      'redis-server',
      '--appendonly',
      'yes',
      '--appendfsync',
      'always',
    ]);
    started = true;
    await ready();
    const mapping = /^127\.0\.0\.1:(\d+)$/u.exec(docker(['port', containerName, '6379/tcp']));
    if (!mapping) throw new Error('Redis 未绑定随机 loopback 端口');
    let cleaned = false;
    return {
      containerName,
      directory,
      image,
      prefix: `recovery-${nonce}`,
      redisUrl: `redis://127.0.0.1:${mapping[1]}/0`,
      stop() {
        assertOwner();
        docker(['stop', '--time', '5', containerName]);
      },
      async start() {
        assertOwner();
        docker(['start', containerName]);
        await ready();
        if (docker(['port', containerName, '6379/tcp']) !== `127.0.0.1:${port}`) {
          throw new Error('Redis 恢复后的端口改变');
        }
      },
      async cleanup() {
        if (cleaned) return;
        assertOwner();
        docker(['rm', '--force', containerName]);
        await rm(directory, { recursive: true, force: true });
        cleaned = true;
      },
    };
  } catch (error) {
    if (started) {
      assertOwner();
      docker(['rm', '--force', containerName]);
    }
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
