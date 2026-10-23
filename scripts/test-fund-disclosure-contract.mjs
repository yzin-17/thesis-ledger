import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fundHoldingsSchema } from '../packages/schemas/dist/index.js';
import { fundDisclosureAvailableAt } from '../apps/server/dist/src/performance/performance-fund-disclosure.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const program = `
from contextlib import asynccontextmanager
from decimal import Decimal
import json, socket
from types import SimpleNamespace
import pandas as pd
from fastapi import FastAPI
import uvicorn
from api.thesis_ledger import router_v3
from data_provider.fund_disclosure_reference import _reference
from data_provider.eastmoney_holdings_projection import holdings_result
from src.services.thesis_ledger_fund_holdings_contract_v1 import HoldingsRequest
import src.services.thesis_ledger_provider_runtime as runtime

record = _reference('161725.OF','2026-Q2')
cases = []
def add(name, count=3, symbol='161725.OF', period='2026-Q2', change=None):
 rows=record.holdings[:count]
 frame=pd.DataFrame({'股票代码':[r.symbol[:6] for r in rows], '股票名称':[r.name for r in rows],
   '占净值比例':[float(Decimal(r.weight)*100) for r in rows], '季度':[f'{period[:4]}年{period[-1]}季度']*count})
 if change=='weight': frame.loc[0,'占净值比例']+=0.01
 if change=='name': frame.loc[0,'股票名称']='受控当前名称'
 value=holdings_result(frame,HoldingsRequest(symbol=symbol),'efinance','eastmoney')
 proof=value.disclosure_evidence
 cases.append(({'name':name,'symbol':symbol,'rows':count,'evidence':proof.status if proof else 'missing'},value))
add('matched_subset')
add('matched_all',count=74)
add('legacy_unknown',symbol='000001.OF')
add('weights_mismatch',change='weight')
add('other_report',period='2026-Q3')
add('current_name',change='name')
pending=list(cases)
def fund_holdings(symbol,**kwargs):
 descriptor,value=pending.pop(0)
 assert symbol==descriptor['symbol']
 return SimpleNamespace(data=value,provider='efinance',fallback_used=False)
runtime.get_thesis_ledger_data_gateway=lambda:SimpleNamespace(fund_holdings=fund_holdings)
sock=socket.socket();sock.bind(('127.0.0.1',0));sock.listen(128)
@asynccontextmanager
async def lifespan(app):
 print('FUND_DISCLOSURE_SERVER='+json.dumps({'port':sock.getsockname()[1],'cases':[c[0] for c in cases]}),flush=True)
 yield
app=FastAPI(lifespan=lifespan);app.include_router(router_v3)
uvicorn.Server(uvicorn.Config(app,log_level='error',access_log=False)).run(sockets=[sock])
`;

async function run() {
  const args = process.argv.slice(2);
  assert(args.length === 2 && args[0] === '--python', '使用 --python 指定 DSA 已安装依赖的 Python');
  const folder = mkdtempSync(join(tmpdir(), 'fund-disclosure-contract-'));
  const envFile = join(folder, 'test.env');
  writeFileSync(envFile, '', { flag: 'wx', mode: 0o600 });
  const token = randomUUID();
  const child = spawn(resolve(args[1]), ['-u', '-c', program], {
    cwd: resolve(root, '../daily-stock-analysis'),
    env: {
      PATH: process.env.PATH,
      ENV_FILE: envFile,
      DATABASE_PATH: join(folder, 'test.db'),
      THESIS_LEDGER_DSA_TOKEN: token,
      THESIS_LEDGER_FIXTURE_MODE: 'false',
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUTF8: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-8000);
  });
  try {
    const ready = await new Promise((resolveReady, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => reject(new Error('独立合同 HTTP 进程未就绪')), 30000);
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        const line = buffer
          .split('\n')
          .slice(0, -1)
          .find((value) => value.startsWith('FUND_DISCLOSURE_SERVER='));
        if (line) {
          clearTimeout(timeout);
          resolveReady(JSON.parse(line.slice('FUND_DISCLOSURE_SERVER='.length)));
        }
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`独立合同进程退出 ${code}: ${stderr.slice(-1500)}`));
      });
    });
    const results = [];
    for (const item of ready.cases) {
      const url = `http://127.0.0.1:${ready.port}/thesis-ledger/market/fund-holdings?symbol=${item.symbol}`;
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(response.status, 200, `合同场景 ${item.name} HTTP 未通过`);
      const body = fundHoldingsSchema.parse(await response.json());
      assert.equal(body.disclosureDate, null);
      assert.equal(body.holdings.length, item.rows);
      assert.equal(body.disclosureEvidence?.status ?? 'missing', item.evidence);
      if (body.disclosureEvidence?.status === 'matched') {
        const boundary = body.disclosureEvidence.availableAt;
        assert.equal(
          fundDisclosureAvailableAt(body, new Date(Date.parse(boundary) + 60000)),
          boundary,
        );
        assert.throws(() => fundDisclosureAvailableAt(body, new Date(Date.parse(boundary) - 1)));
      } else assert.throws(() => fundDisclosureAvailableAt(body, new Date()));
      results.push({ case: item.name, evidence: item.evidence, rows: item.rows, passed: true });
    }
    console.log(
      JSON.stringify({
        passed: true,
        independentPythonProcesses: 1,
        authenticatedHttpResponses: results.length,
        realProviderSdkRequests: 0,
        projectModelRequests: 0,
        targetWritten: false,
        results,
      }),
    );
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolveExit) => {
      const timeout = setTimeout(resolveExit, 5000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolveExit();
      });
      if (child.exitCode !== null) {
        clearTimeout(timeout);
        resolveExit();
      }
    });
    if (child.exitCode === null) child.kill('SIGKILL');
    rmSync(folder, { recursive: true, force: true });
  }
}

await run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
