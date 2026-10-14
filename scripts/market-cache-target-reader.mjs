import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { countObservedCacheRequests } from './market-cache-request-evidence.mjs';

// 原目标Reader进程；只查询持仓/原缓存，不注入Prisma、不创建HTTP接口或访问Ledger。
export const holdingsReaderDriver = `
import assert from 'node:assert/strict';
import { DsaClient } from '/app/apps/server/dist/src/integration/dsa/dsa.client.js';
import { MarketService } from '/app/apps/server/dist/src/market/market.service.js';
import { RedisService } from '/app/apps/server/dist/src/platform/redis.service.js';
import { StructuredLogger, runWithTrace } from '/app/apps/server/dist/src/platform/structured-logger.js';
let input=''; for await(const chunk of process.stdin) input+=chunk;
const request=JSON.parse(input);
assert(['selected','disabled','reenabled'].includes(request.phase));
assert(request.symbol==='000001.OF' && request.traces.length===(request.phase==='disabled'?1:2));
const redis=new RedisService(), service=new MarketService(new DsaClient(),redis), results=[];
const logger=new StructuredLogger('CacheTargetReader');
try {
  for(const traceId of request.traces) {
    await runWithTrace(traceId,async()=>{
      try {
        const value=await service.getFundHoldings(request.symbol);
        assert(value.fundSymbol===request.symbol && value.provider==='akshare' && value.holdings.length>0);
        results.push({cached:value.servedFromCache===true,provider:value.provider,holdings:value.holdings.length});
      } catch(error) {
        results.push({rejected:error?.code==='control-rejected',failed:true});
      } finally {
        logger.log({operation:'market.cache-target-reader',stage:'completed',capability:'FUND_HOLDINGS'});
      }
    });
  }
  console.log('CACHE_READER_RESULT='+JSON.stringify(results));
} finally { await redis.onModuleDestroy(); }
`;

export function probeTargetHoldings(phase, traces, spawn = spawnSync) {
  assert(['selected', 'disabled', 'reenabled'].includes(phase), '未知原Reader阶段');
  const child = spawn('docker', ['exec', '-i', '-w', '/app', 'thesis-ledger-dev-thesis-ledger-1',
    'node', '--input-type=module', '-e', holdingsReaderDriver], {
    input: JSON.stringify({ phase, traces, symbol: '000001.OF' }), encoding: 'utf8', timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert(child.status === 0, '目标原持仓Reader进程未成功完成');
  const output = stripVTControlCharacters(child.stdout);
  const marker = output.split('\n').find((line) => line.startsWith('CACHE_READER_RESULT='));
  assert(marker, '缺少目标原Reader结果');
  const values = JSON.parse(marker.slice('CACHE_READER_RESULT='.length));
  assert(values.length === traces.length, '目标原Reader结果数量不匹配');
  const counts = countObservedCacheRequests(child.stdout, traces, 'target-original-holdings-reader');
  return { capability: 'FUND_HOLDINGS', layer: 'target-original-reader', ...counts,
    ...(phase === 'disabled' ? { rejected: values[0].rejected === true }
      : { firstCached: values[0].cached === true, secondCached: values[1].cached === true }) };
}
