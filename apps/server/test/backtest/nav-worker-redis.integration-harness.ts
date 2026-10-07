import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const REDIS_IMAGE = 'redis:8-alpine';
const CONTAINER_LABEL = 'thesis-ledger.n3-nav-worker-redis';

function docker(args: string[]) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 32 * 1024,
    }).trim();
  } catch {
    throw new Error(`隔离 Redis Docker 操作失败: ${args[0] ?? 'command'}`);
  }
}

function inspectLabel(containerName: string): string | undefined {
  try {
    return execFileSync(
      'docker',
      [
        'inspect',
        '--format',
        `{{ index .Config.Labels "${CONTAINER_LABEL}" }}`,
        containerName,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      },
    ).trim();
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr)
        : '';
    if (/No such (?:object|container)/u.test(stderr)) return undefined;
    throw new Error('隔离 Redis 容器标签检查失败');
  }
}

async function waitUntilReady(containerName: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if (docker(['exec', containerName, 'redis-cli', 'ping']) === 'PONG') return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('隔离 Redis 容器未就绪');
}

export interface IsolatedNavRedis {
  containerName: string;
  containerLabel: string;
  redisUrl: string;
  cleanup(): Promise<void>;
}

/** 在随机 loopback 端口和 tmpfs 中启动独立 Redis，不挂载任何 Docker volume。 */
export async function startIsolatedNavRedis(): Promise<IsolatedNavRedis> {
  const imageId = docker(['image', 'inspect', '--format', '{{.Id}}', REDIS_IMAGE]);
  if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) {
    throw new Error(`本机 Redis 测试镜像标识无效: ${REDIS_IMAGE}`);
  }

  const nonce = randomUUID();
  const containerName = `tl-nav-n3-redis-${process.pid}-${nonce.slice(0, 8)}`;
  const containerLabel = `${CONTAINER_LABEL}=${nonce}`;
  let containerStarted = false;
  try {
    docker([
      'run',
      '--detach',
      '--name',
      containerName,
      '--label',
      containerLabel,
      '--publish',
      '127.0.0.1::6379',
      '--tmpfs',
      '/data:rw,size=67108864',
      imageId,
      'redis-server',
      '--save',
      '',
      '--appendonly',
      'no',
    ]);
    containerStarted = true;
    await waitUntilReady(containerName);

    const portMapping = docker(['port', containerName, '6379/tcp']);
    const match = /^127\.0\.0\.1:(\d+)$/u.exec(portMapping);
    if (!match) throw new Error('隔离 Redis 端口不是随机 loopback 端口');
    let cleaned = false;
    return {
      containerName,
      containerLabel,
      redisUrl: `redis://127.0.0.1:${match[1]}/0`,
      async cleanup() {
        if (cleaned) return;
        cleaned = true;
        const actualLabel = inspectLabel(containerName);
        if (actualLabel === undefined) return;
        if (actualLabel !== nonce) throw new Error('隔离 Redis 标签不符，拒绝清理');
        docker(['rm', '--force', containerName]);
      },
    };
  } catch (error) {
    if (containerStarted && inspectLabel(containerName) === nonce) {
      docker(['rm', '--force', containerName]);
    }
    throw error;
  }
}
