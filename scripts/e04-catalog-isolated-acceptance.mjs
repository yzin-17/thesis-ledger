import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const root = await mkdtemp(join(tmpdir(), 'canonical-catalog-'));
const listener = createServer();
await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const dsaRoot = new URL('../../daily-stock-analysis/', import.meta.url).pathname;
const child = spawn(
  join(dsaRoot, '.venv/bin/python'),
  [
    '-c',
    `
from fastapi import FastAPI
from api.thesis_ledger import router_v3
from api.thesis_ledger_oauth import router, initialize_provider_oauth
import uvicorn
app=FastAPI()
app.include_router(router_v3,prefix='/api/v3')
app.include_router(router,prefix='/api/v3')
initialize_provider_oauth(app)
uvicorn.run(app,host='127.0.0.1',port=${port},log_level='error')
`,
  ],
  {
    cwd: dsaRoot,
    env: {
      ...process.env,
      DATABASE_PATH: join(root, 'catalog.db'),
      THESIS_LEDGER_CONTROL_TOKEN: 'isolated-provider-token',
      THESIS_LEDGER_DSA_TOKEN: 'isolated-data-token',
      THESIS_LEDGER_DSA_SECRET_KEY: 'isolated-provider-encryption',
      THESIS_LEDGER_FIXTURE_MODE: 'true',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  },
);
let errors = '';
child.stderr.on('data', (data) => {
  errors = (errors + data.toString()).slice(-2000);
});
process.env.DSA_BASE_URL = `http://127.0.0.1:${port}`;
process.env.THESIS_LEDGER_CONTROL_TOKEN = 'isolated-provider-token';
process.env.THESIS_LEDGER_DSA_TOKEN = 'isolated-data-token';
process.env.DATABASE_URL = 'postgresql://isolated:isolated@127.0.0.1:1/isolated';
process.env.REDIS_URL = 'redis://127.0.0.1:1';
process.env.CREDENTIAL_ENCRYPTION_KEY = 'isolated-provider-key';
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`隔离服务启动失败: ${errors}`);
    try {
      const response = await fetch(
        `${process.env.DSA_BASE_URL}/api/v3/thesis-ledger/control/providers`,
        { headers: { authorization: 'Bearer isolated-provider-token' } },
      );
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* 等待独立 HTTP 服务就绪。 */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, '隔离服务未就绪');
  const { DsaClient } = await import('../apps/server/dist/src/integration/dsa/dsa.client.js');
  const client = new DsaClient();
  const snapshot = await client.catalogSnapshot();
  assert(snapshot.complete && snapshot.items.length > 0);
  const delta = await client.catalogDelta(snapshot.cursor);
  assert.deepEqual(delta.items, []);
  assert.deepEqual(delta.deleted, []);
  const ack = await client.acknowledgeCatalog(
    snapshot.generation,
    snapshot.checksum,
    'isolated-ack',
  );
  assert.equal(ack.cursor, snapshot.cursor);
  let job = await client.triggerCatalogJob('isolated-trigger');
  assert.equal(job.requestId, 'isolated-trigger');
  const id = job.id;
  for (
    let attempt = 0;
    ['pending', 'running'].includes(job.status) && attempt < 100;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    job = await client.catalogJob(id);
  }
  assert.equal(job.status, 'succeeded');
  assert.equal(job.id, id);
  assert.equal(job.generation, snapshot.generation);
  assert.equal(job.checksum, snapshot.checksum);
  for (const cursor of ['0', 'generation:0', 'v2:1']) {
    await assert.rejects(client.catalogSnapshot(cursor));
    await assert.rejects(client.catalogDelta(cursor));
  }
  for (const contractVersion of [1, 2]) {
    const response = await fetch(
      process.env.DSA_BASE_URL + '/api/v3/thesis-ledger/control/catalog/jobs',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer isolated-provider-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ contractVersion, consumer: 'thesis-ledger', requestId: 'old' }),
      },
    );
    assert.equal(response.status, 422);
  }
  console.log(
    JSON.stringify({
      snapshot: true,
      delta: true,
      ack: true,
      job: true,
      oldCursor: 6,
      oldEnvelope: 2,
    }),
  );
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(timer);
  }
  await rm(root, { recursive: true, force: true });
}
