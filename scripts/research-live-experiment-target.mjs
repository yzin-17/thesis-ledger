import { execFileSync } from 'node:child_process';

const container = 'thesis-ledger-dev-thesis-ledger-1';
export const liveExperimentTargetReadProgram = String.raw`
const {createRequire}=require('node:module');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const load=createRequire('/app/apps/server/package.json');
const {PrismaClient}=load('@prisma/client');
const prisma=new PrismaClient();
const digest=value=>createHash('sha256').update(JSON.stringify(value,(_key,item)=>typeof item==='bigint'?item.toString():item)).digest('hex');
(async()=>{try{
const value=await prisma.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
 const identity=await tx.$queryRawUnsafe('SELECT current_database() AS database,current_user AS role');
 if(identity[0]?.database!=='thesis_ledger'||identity[0]?.role!=='thesis_ledger_app')throw Error('身份不符');
  const provider=process.argv[3]??'cloudflare';
  if(!['cloudflare','openrouter'].includes(provider))throw Error('Provider不符');
  const row=await tx.providerConfig.findUniqueOrThrow({where:{name:provider}});
  const model=provider==='cloudflare'?'@cf/qwen/qwen3.8-27b':'openrouter/free';const s=row.settings??{};const p=s.modelPricing?.[model];
   const requestOptionsModel=process.argv[4]||model;
   if(provider==='cloudflare'&&requestOptionsModel!==model)throw Error('型号不符');
   const requestOptions=load('@thesis-ledger/schemas').aiModelRequestOptionsSchema.parse(s.modelDefaults?.[requestOptionsModel]?.requestOptions??{});
  const stateMatches=provider==='cloudflare'?row.enabled===false&&(s.executionRoutes??[]).length===0:row.enabled===true;
  if(!stateMatches||!s.models?.includes(model)||!p||
    s.authMode!=='api_key'||s.upstreamFormat!=='chat-completions'||s.chatImplementation!=='compatible')throw Error('配置不符');
  const base=new URL(s.baseUrl);const official=provider==='cloudflare'?
    base.origin==='https://api.cloudflare.com'&&/^\/client\/v4\/accounts\/[^/]+\/ai\/v1\/?$/.test(base.pathname):
    base.origin==='https://openrouter.ai'&&/^\/api\/v1\/?$/.test(base.pathname);
  if(!official||base.search||base.hash||base.username||base.password)throw Error('目标不符');
 const tables=['account','accountLedgerState','ledgerEvent','trade','journalEntry','providerConfig','aiRoutingSettings',
   'aiRun','aiToolCall','notificationDelivery','recurringCashDepositPlan','recurringCashDepositOccurrence'];
 const protectedState={};
 for(const table of tables){
   const orderBy=table==='accountLedgerState'?{accountId:'asc'}:{id:'asc'};
   const rows=await tx[table].findMany({orderBy});protectedState[table]={rows:rows.length,sha256:digest(rows)};
 }
 const modules=['ai-sdk-generation.adapter','ai-generation-output','ai-research-numeric-evidence-v2','ai-research-frozen-integrity-v2'];
 const moduleHashes=Object.fromEntries(modules.map(name=>[name,createHash('sha256').update(readFileSync('/app/apps/server/dist/src/ai/'+name+'.js')).digest('hex')]));
 const result={revision:row.updatedAt.toISOString(),credentialCipherHash:createHash('sha256').update(row.encryptedCredentials).digest('hex'),
    providerId:provider,model,baseURL:s.baseUrl,pricing:{costPer1kInput:p.costPer1kInput,costPer1kOutput:p.costPer1kOutput,
    costCurrency:p.costCurrency,pricingVersion:p.pricingVersion},requestOptionsModel,requestOptions,protectedState,moduleHashes,
   activeRuns:await tx.aiRun.count({where:{status:{in:['queued','running']}}})};
 if(process.argv[2]==='with-credential'){
  result.apiKey=load('/app/apps/server/dist/src/platform/credential-security.js').normalizeProviderCredential(row.encryptedCredentials).credential;
  if(!result.apiKey)throw Error('缺少凭据');
 }
 return result;
},{timeout:30000});process.stdout.write(JSON.stringify(value));
}finally{await prisma.$disconnect();}})().catch(()=>{process.stderr.write('固定目标只读核查失败');process.exitCode=1;});
`;

export function readLiveExperimentTarget(
  withCredential = false,
  providerId = 'cloudflare',
  requestOptionsModel = '',
) {
  if (!['cloudflare', 'openrouter'].includes(providerId))
    throw new Error('实验Provider不在授权范围');
  const labels = JSON.parse(
    execFileSync('docker', ['inspect', '--format', '{{json .Config.Labels}}', container], {
      encoding: 'utf8',
    }),
  );
  if (
    labels['com.docker.compose.project'] !== 'thesis-ledger-dev' ||
    labels['com.docker.compose.service'] !== 'thesis-ledger'
  )
    throw new Error('实验只允许既有本地开发Server');
  let result;
  try {
    result = JSON.parse(
      execFileSync(
        'docker',
        [
          'exec',
          '-i',
          container,
          'node',
          '-',
          withCredential ? 'with-credential' : 'metadata-only',
          providerId,
          requestOptionsModel,
        ],
        {
          input: liveExperimentTargetReadProgram,
          encoding: 'utf8',
          timeout: 45000,
          maxBuffer: 2 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      ),
    );
  } catch {
    throw new Error('固定目标只读核查失败，未导出诊断原文');
  }
  if (result.activeRuns !== 0) throw new Error('正常服务存在在途模型任务，实验未派发');
  return result;
}

export function publicLiveExperimentTarget(value) {
  return {
    providerId: value.providerId,
    model: value.model,
    revision: value.revision,
    credentialCipherHash: value.credentialCipherHash,
    pricing: value.pricing,
    requestOptionsModel: value.requestOptionsModel,
    requestOptions: value.requestOptions,
    protectedState: value.protectedState,
    moduleHashes: value.moduleHashes,
    activeRuns: value.activeRuns,
  };
}

export function assertCloudflareExperimentRequest(baseURL, resource, method) {
  return assertLiveExperimentRequest('cloudflare', baseURL, resource, method);
}

export function assertLiveExperimentRequest(providerId, baseURL, resource, method) {
  const base = new URL(baseURL);
  const target = new URL(
    typeof resource === 'string' || resource instanceof URL ? resource : resource.url,
  );
  let official = false;
  if (providerId === 'cloudflare')
    official =
      base.origin === 'https://api.cloudflare.com' &&
      /^\/client\/v4\/accounts\/[^/]+\/ai\/v1\/?$/.test(base.pathname);
  else if (providerId === 'openrouter')
    official = base.origin === 'https://openrouter.ai' && /^\/api\/v1\/?$/.test(base.pathname);
  if (
    !official ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    target.origin !== base.origin ||
    target.pathname !== base.pathname.replace(/\/$/, '') + '/chat/completions' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    method !== 'POST'
  )
    throw new Error('拒绝本次模型之外的请求或重定向');
}
