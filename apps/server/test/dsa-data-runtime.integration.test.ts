import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { DsaClient } from '../src/integration/dsa/dsa.client.js';
import { DsaNavClient } from '../src/integration/dsa/dsa-nav-client.js';
import { readSecurityLotSize } from '../src/integration/dsa/dsa-security-lot-size.js';

type Case = {
  client: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  status: number;
};
type Message = { kind: string; port: number; cases: Case[]; models: Record<string, boolean> };
const python = process.env.DSA_DATA_RUNTIME_PYTHON;
const repository = resolve(process.cwd(), '../../../daily-stock-analysis');

async function withProducer(scenario: string, run: (base: string, cases: Case[]) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'dsa-data-consumer-'));
  await writeFile(join(root, 'empty.env'), '');
  const child = spawn(python!, ['-m', 'tests.data_runtime_process'], {
    cwd: repository,
    env: {
      PATH: process.env.PATH,
      LANG: 'en_US.UTF-8',
      HOME: root,
      PYTHONPATH: repository,
      PYTHONNOUSERSITE: '1',
      ENV_FILE: join(root, 'empty.env'),
      DATABASE_PATH: join(root, 'data.db'),
      LOG_DIR: join(root, 'logs'),
      STOCK_INDEX_REMOTE_UPDATE_ENABLED: 'false',
      THESIS_LEDGER_FIXTURE_MODE: 'false',
      THESIS_LEDGER_DSA_TOKEN: 'data-runtime-controlled-token',
      THESIS_LEDGER_CONTROL_TOKEN: 'data-runtime-controlled-control',
      DSA_DATA_RUNTIME_SCENARIO: scenario,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let output = '';
  let stopped: unknown;
  let bound: Message | undefined;
  const lines = createInterface({ input: child.stdout });
  child.stderr.on('data', (chunk) => {
    output = (output + String(chunk)).slice(-4_000);
  });
  lines.on('line', (line) => {
    output = (output + line).slice(-4_000);
    if (!line.startsWith('DSA_RUNTIME:')) return;
    const value = JSON.parse(line.slice('DSA_RUNTIME:'.length)) as Message;
    if (value.kind === 'bound') bound = value;
    if (value.kind === 'stopped') stopped = value;
  });
  try {
    for (let count = 0; !bound; count++) {
      if (child.exitCode !== null || count > 400) throw new Error(output);
      await delay(25);
    }
    expect(Object.values(bound.models)).toEqual(Array(7).fill(false));
    const base = `http://127.0.0.1:${bound.port}`;
    for (let count = 0; ; count++) {
      try {
        if ((await fetch(base + '/health')).ok) break;
      } catch {
        /* Uvicorn 尚在启动。 */
      }
      if (count > 200) throw new Error(output);
      await delay(25);
    }
    await run(base, bound.cases);
  } finally {
    child.stdin.end('stop\n');
    const result = await Promise.race([exited, delay(10_000).then(() => null)]);
    if (!result) {
      child.kill('SIGKILL');
      await exited;
    }
    lines.close();
    await rm(root, { recursive: true, force: true });
    expect(result, '独立 DSA 未正常退出：' + output).not.toBeNull();
    expect(result?.[0], output).toBe(0);
    expect(stopped).toEqual({
      kind: 'stopped',
      forbiddenImports: [],
      children: 0,
      lifecycleActive: false,
      oauthActive: false,
    });
  }
}

function consume(client: DsaClient, nav: DsaNavClient, item: Case) {
  switch (item.client) {
    case 'marketBarsV3':
      return client.marketBarsV3(item.body as Parameters<DsaClient['marketBarsV3']>[0]);
    case 'marketChartBarsV3':
      return client.marketChartBarsV3(item.body as Parameters<DsaClient['marketChartBarsV3']>[0]);
    case 'marketEventsV3':
      return client.marketEventsV3(item.body as Parameters<DsaClient['marketEventsV3']>[0]);
    case 'marketPublicFeesV3':
      return client.marketPublicFeesV3(item.body as Parameters<DsaClient['marketPublicFeesV3']>[0]);
    case 'marketNavInputsV3':
      return nav.read(item.body as Parameters<DsaNavClient['read']>[0]);
    case 'calculateIndicators':
      return client.calculateIndicators(
        item.body as Parameters<DsaClient['calculateIndicators']>[0],
      );
    case 'marketCalendar':
    case 'backtestCalendar':
      return client[item.client](item.query as Parameters<DsaClient['marketCalendar']>[0]);
    case 'fxRates':
      return client.fxRates({
        baseCurrency: 'CNY',
        currencies: ['USD', 'CNY'],
        asOf: '2026-10-16',
      });
    case 'securityLotSize':
      if (item.status !== 200) return client.post(item.path, item.body, 1);
      return readSecurityLotSize(client, '00700.HK');
    default:
      throw new Error('未覆盖的数据消费者：' + item.client);
  }
}

describe.skipIf(!python)('DG1 物理无模型 SDK 的真实 DSA HTTP 消费', () => {
  it.each(['basics', 'bars', 'events', 'nav', 'rules', 'reference'])(
    '%s',
    async (scenario) => {
      await withProducer(scenario, async (base, cases) => {
        const config = {
          dsaBaseUrl: base,
          dsaTimeoutMs: 10_000,
          dsaToken: 'data-runtime-controlled-token',
          dsaControlToken: 'data-runtime-controlled-control',
        };
        const client = Object.assign(Object.create(DsaClient.prototype), { config }) as DsaClient;
        const nav = Object.assign(Object.create(DsaNavClient.prototype), {
          config,
        }) as DsaNavClient;
        for (const item of cases) {
          const pending = Promise.resolve().then(() => consume(client, nav, item));
          if (item.status === 200) {
            const value = await pending;
            expect(value, item.client).toBeTruthy();
          } else await expect(pending, item.client).rejects.toBeDefined();
        }
      });
    },
    25_000,
  );
});
