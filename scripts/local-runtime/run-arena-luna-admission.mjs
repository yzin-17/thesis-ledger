import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DsaRuntimeRecovery } from '../../../thesis-ledger-infra/scripts/dsa-runtime-recovery.mjs';
import { ownsUpdateLock } from '../../../thesis-ledger-infra/scripts/runtime/lock.mjs';

assert(ownsUpdateLock(process.env.INFRA_UPDATE_LOCK_PATH ?? ''), '必须持有正式维护锁');
const [packetFile, outputFile] = process.argv.slice(2);
const packet = JSON.parse(readFileSync(resolve(packetFile)));
assert.equal(packet.provider.name, 'openai-arena');
assert.equal(packet.authorization.maxCalls, 1);
assert.equal(packet.authorization.authorized, true);
assert(packet.provider.executionRoutes.some(r => r.model === 'gpt-6-luna'));
assert(resolve(outputFile).startsWith(resolve('.recovery-artifacts') + '/'));
const runtime = new DsaRuntimeRecovery(resolve('../thesis-ledger-infra'), resolve('../thesis-ledger-infra/.env')).runtime;
const code = `import 'reflect-metadata';
const load=n=>import('./dist/src/'+n+'.js');
const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
const {RedisService}=await load('platform/redis.service');const redis=new RedisService();
try{
const {ProviderHealthService}=await load('providers/provider-health.service');
const {ProviderConfigService}=await load('providers/provider-config.service');
const {AiProviderRegistry}=await load('ai/provider-registry');
const {AiSdkGenerationAdapter}=await load('ai/ai-sdk-generation.adapter');
const {AiProviderService}=await load('ai/ai-provider.service');
const {AiRoutingSettingsService}=await load('ai/ai-routing-settings.service');
const {AiProviderSaveService}=await load('ai/ai-provider-save.service');
const {AiProviderValidationJournal}=await load('ai/ai-provider-validation-journal');
const health=new ProviderHealthService(db,redis),configs=new ProviderConfigService(db,health),sdk=new AiSdkGenerationAdapter();
const providers=new AiProviderService(configs,health,new AiProviderRegistry(),sdk,new AiRoutingSettingsService(db),db);
const captured=[];
const wrapper={generate:async input=>{try{const result=await sdk.generate(input);captured.push({requestId:input.requestId,result});return result;}catch(error){captured.push({requestId:input.requestId,fact:error.fact,message:error.message});throw error;}}};
const service=new AiProviderSaveService(providers,configs,wrapper,health,new AiProviderValidationJournal(db));
const packet=${JSON.stringify(packet)};
try{const provider=await service.testAndSave(packet.provider,packet.authorization);console.log(JSON.stringify({status:'saved',provider,captured}));}
catch(error){console.log(JSON.stringify({status:'failed',message:error.message,captured}));}
}finally{await db.$disconnect();await redis.onModuleDestroy();}`;
const result = runtime.dockerSync(['exec','-i','-w','/app/apps/server','thesis-ledger-dev-thesis-ledger-1','node','--input-type=module','-'],{input:code,timeout:660000});
writeFileSync(resolve(outputFile),result,{mode:0o600,flag:'wx'});
const receipt=JSON.parse(result.trim().split('\n').at(-1));
console.log(JSON.stringify({status:receipt.status,message:receipt.message,calls:receipt.captured?.length}));
if(receipt.status!=='saved')process.exitCode=1;
