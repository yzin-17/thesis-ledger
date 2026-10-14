import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { assertQuoteFailureArgs, quoteFailureProcessSource } from './market-quote-failure-acceptance.mjs';

test('配置/旧政策授权与陈旧代次不能执行隔离报价故障', () => {
  const plan = { baseline: { revision: 99 }, configVersion: 5 };
  const args = ['--execute', '--authorized-quote-failure-case', '--expected-policy=99', '--expected-config=5'];
  assert.doesNotThrow(() => assertQuoteFailureArgs(args, plan));
  for (const bad of [
    args.filter((x) => x !== '--authorized-quote-failure-case').concat('--authorized-source-config-cache-case'),
    args.map((x) => x === '--expected-policy=99' ? '--expected-policy=98' : x),
    args.map((x) => x === '--expected-config=5' ? '--expected-config=6' : x),
  ]) assert.throws(() => assertQuoteFailureArgs(bad, plan));
});

test('维护故障模块与原目标驱动拼接语法有效，独立进程绑定实际执行一次拦截', async () => {
  const driver = await fs.readFile(new URL('./market-quote-failure-driver.mjs', import.meta.url), 'utf8');
  const source = quoteFailureProcessSource(driver);
  const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  const isolated = quoteFailureProcessSource(`import assert from 'node:assert/strict';
    const proof={injected:0}; const read=quoteFaultFetch(()=>assert.fail('不能发送真实HTTP'),proof);
    const response=await read('http://dsa/api/v3/thesis-ledger/market/quote?symbol=600519.SH');
    assert.equal(response.status,503);assert.equal(proof.injected,1);`);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', isolated], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
