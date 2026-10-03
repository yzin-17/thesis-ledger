import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from '../../src/platform/prisma.service.js';
import {
  discoverDatabaseStructure,
  type DatabaseStructureInput,
} from '../../src/platform/database-structure.js';

const POSTGRES_IMAGE = 'postgres:17-alpine';
const DATABASE_NAME = 'nav_n2_6';
const APP_ROLE = 'nav_n2_6_app';
const APP_PASSWORD = randomBytes(24).toString('base64url');
const OWNER_PASSWORD = randomBytes(24).toString('base64url');

function docker(args: string[], input?: string) {
  return execFileSync('docker', args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30_000,
  }).trim();
}

function psql(containerName: string, databaseName: string, sql: string) {
  return docker(
    [
      'exec',
      '-i',
      containerName,
      'psql',
      '-U',
      'postgres',
      '-d',
      databaseName,
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    sql,
  );
}

const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function waitUntilReady(containerName: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      docker([
        'exec',
        containerName,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'postgres',
        '-d',
        'postgres',
      ]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`隔离 PostgreSQL 容器未就绪: ${containerName}`);
}

async function installStructure(containerName: string, source: DatabaseStructureInput) {
  for (const migration of source.migrations) {
    psql(containerName, DATABASE_NAME, migration.sql);
  }

  const head = sqlLiteral(source.currentHead);
  const expected = source.expectedTables.map(sqlLiteral).join(', ');
  psql(
    containerName,
    DATABASE_NAME,
    `UPDATE "SchemaVersion" SET "version" = ${head}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 1;`,
  );
  const actualHead = psql(
    containerName,
    DATABASE_NAME,
    'SELECT "version" FROM "SchemaVersion" WHERE "id" = 1;',
  );
  const publicTables = Number(
    psql(
      containerName,
      DATABASE_NAME,
      "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';",
    ),
  );
  const presentExpectedTables = Number(
    psql(
      containerName,
      DATABASE_NAME,
      `SELECT count(*) FROM unnest(ARRAY[${expected}]) AS expected(name)
WHERE to_regclass(format('public.%I', expected.name)) IS NOT NULL;`,
    ),
  );
  const expectedPublicTables = source.expectedTables.length;
  if (
    actualHead !== source.currentHead ||
    publicTables !== expectedPublicTables ||
    presentExpectedTables !== expectedPublicTables
  ) {
    throw new Error(
      `隔离 PostgreSQL 结构核验失败: head=${actualHead || '<missing>'}, expectedHead=${source.currentHead}, ` +
        `presentExpectedTables=${presentExpectedTables}, expectedTables=${expectedPublicTables}, ` +
        `publicTables=${publicTables}`,
    );
  }
}

async function initializeApplicationRole(containerName: string) {
  const permissionsSql = await import('node:fs/promises').then(({ readFile }) =>
    readFile(
      new URL('../../../../../thesis-ledger-infra/scripts/bootstrap-app-role.sql', import.meta.url),
      'utf8',
    ),
  );
  psql(
    containerName,
    DATABASE_NAME,
    `\\setenv POSTGRES_OWNER_USER postgres
\\setenv POSTGRES_APP_USER ${APP_ROLE}
\\setenv POSTGRES_APP_PASSWORD ${APP_PASSWORD}
${permissionsSql}`,
  );
}

export interface IsolatedNavPostgres {
  containerName: string;
  containerLabel: string;
  databaseUrl: string;
  source: DatabaseStructureInput;
  prisma: PrismaService;
  artifactRoot: string;
  adminSql(sql: string): string;
  cleanup(): Promise<void>;
}

/** 在全新且名称唯一的 PostgreSQL 容器中执行当前完整迁移链。
 * 不连接已有应用或数据库容器，也不移除它们。
 */
export async function startIsolatedNavPostgres(): Promise<IsolatedNavPostgres> {
  const imageId = docker(['image', 'inspect', '--format', '{{.Id}}', POSTGRES_IMAGE]);
  if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) {
    throw new Error(`本机 PostgreSQL 测试镜像标识无效: ${POSTGRES_IMAGE}`);
  }

  const nonce = randomUUID();
  const containerName = `tl-nav-n2-6-${process.pid}-${nonce.slice(0, 8)}`;
  const containerLabel = `thesis-ledger.n2-6=${nonce}`;
  const artifactRoot = await mkdtemp(join(tmpdir(), 'tl-nav-n2-6-artifacts-'));
  let prisma: PrismaService | undefined;
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
      '127.0.0.1::5432',
      '--tmpfs',
      '/var/lib/postgresql/data:rw,size=1073741824',
      '--env',
      'POSTGRES_USER=postgres',
      '--env',
      `POSTGRES_PASSWORD=${OWNER_PASSWORD}`,
      '--env',
      `POSTGRES_DB=${DATABASE_NAME}`,
      imageId,
    ]);
    containerStarted = true;
    await waitUntilReady(containerName);
    const databaseExists = psql(
      containerName,
      'postgres',
      `SELECT 1 FROM pg_database WHERE datname = ${sqlLiteral(DATABASE_NAME)};`,
    );
    if (databaseExists !== '1') {
      psql(containerName, 'postgres', `CREATE DATABASE "${DATABASE_NAME}";`);
    }

    const source = await discoverDatabaseStructure();
    await installStructure(containerName, source);
    await initializeApplicationRole(containerName);

    const portMapping = docker(['port', containerName, '5432/tcp']);
    const match = /^127\.0\.0\.1:(\d+)$/u.exec(portMapping);
    if (!match) throw new Error(`隔离 PostgreSQL 端口不是本机随机端口: ${portMapping}`);
    const databaseUrl = new URL(
      `postgresql://${APP_ROLE}:${APP_PASSWORD}@127.0.0.1:${match[1]}/${DATABASE_NAME}`,
    );
    prisma = new PrismaService({ datasources: { db: { url: databaseUrl.toString() } } });
    await prisma.onModuleInit();
    const identity = await prisma.$queryRaw<Array<{ database: string; role: string }>>`
      SELECT current_database() AS database, current_user AS role
    `;
    if (identity[0]?.database !== DATABASE_NAME || identity[0]?.role !== APP_ROLE) {
      throw new Error('隔离 Prisma 连接的数据库或应用角色身份不符');
    }

    let cleaned = false;
    return {
      containerName,
      containerLabel,
      databaseUrl: databaseUrl.toString(),
      source,
      prisma,
      artifactRoot,
      adminSql(sql: string) {
        const actualLabel = docker([
          'inspect',
          '--format',
          '{{ index .Config.Labels "thesis-ledger.n2-6" }}',
          containerName,
        ]);
        if (actualLabel !== nonce) throw new Error('隔离容器标签不符，拒绝执行管理员 SQL');
        return psql(containerName, DATABASE_NAME, sql);
      },
      async cleanup() {
        if (cleaned) return;
        cleaned = true;
        await prisma?.onModuleDestroy();
        await rm(artifactRoot, { recursive: true, force: true });
        try {
          const actualLabel = docker([
            'inspect',
            '--format',
            '{{ index .Config.Labels "thesis-ledger.n2-6" }}',
            containerName,
          ]);
          if (actualLabel !== nonce) throw new Error('隔离容器标签不符，拒绝清理');
          docker(['rm', '--force', containerName]);
        } catch (error) {
          if (!String(error).includes('No such object')) throw error;
        }
      },
    };
  } catch (error) {
    await prisma?.onModuleDestroy().catch(() => undefined);
    await rm(artifactRoot, { recursive: true, force: true });
    if (containerStarted) {
      try {
        const actualLabel = docker([
          'inspect',
          '--format',
          '{{ index .Config.Labels "thesis-ledger.n2-6" }}',
          containerName,
        ]);
        if (actualLabel === nonce) docker(['rm', '--force', containerName]);
      } catch {
        // 容器启动可能早于 Docker 完成注册。
      }
    }
    throw error;
  }
}
