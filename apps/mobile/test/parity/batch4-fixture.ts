import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { backtestRunPreparationResultV3Schema, backtestRunDetailReadSchema, authoringDraftReadSchema } from '@thesis-ledger/schemas';
import { initialStrategyDefinition } from '../../src/features/strategy-editor/strategy-editor-state';
import { experiment as sampleExperiment, risk as sampleRisk, plan as samplePlan } from '../../../../packages/api-client/test/strategy-management.fixture';
import { ledgerAccountId } from './ledger-fixture';
export const b4VersionId='11111111-1111-4111-8111-111111111111';
export const b4StrategyId='22222222-2222-4222-8222-222222222222';
export const b4RunId='33333333-3333-4333-8333-333333333333';
export const b4At='2026-10-24T00:00:00Z';
function fixtureRoot() {
  let candidate=process.cwd();
  for(;;){if(existsSync(join(candidate,'pnpm-workspace.yaml')))return join(candidate,'packages/schemas/fixtures');
    const parent=dirname(candidate);if(parent===candidate)throw Error('未找到工作区测试夹具。');candidate=parent;}
}
export const fixture=(name:string)=>JSON.parse(readFileSync(join(fixtureRoot(),name),'utf8'));
export const b4Definition={...initialStrategyDefinition('B4 受控策略'),executionInstrument:{symbol:'600519.SH',market:'CN',assetType:'stock'},
  signalSources:[{id:'execution',asset:{symbol:'600519.SH',market:'CN',assetType:'stock'},timeframe:'1d',series:['open','close']}],risk:[{type:'fixedStop',percent:'0.1'}]};
export const b4Strategy={id:b4StrategyId,name:'B4 受控策略',status:'active',versions:[{id:b4VersionId,strategyId:b4StrategyId,version:1,schemaVersion:2,schema:b4Definition}]};
export function b4Prepared() {
  const config={startDate:'2024-01-02',endDate:'2024-03-29',dataAsOf:'2026-09-11T00:00:00Z',baseCurrency:'CNY',initialCash:{CNY:'10000'},
    valuationPolicy:{baseTimezone:'Asia/Shanghai',dailyValuationTime:'15:00',pricePolicy:'latestAvailable',fxPolicy:'latestAvailable'},
    executionModel:fixture('backtest-execution-model.cn-2024q1.json')};
  const ready={contractVersion:3,requestId:'mobile-b4-prepare',checkedAt:config.dataAsOf,status:'ready',revisionStamp:fixture('backtest-preparation-stamp-v3.json'),diagnostics:[]};
  return backtestRunPreparationResultV3Schema.parse({contractVersion:3,requestId:ready.requestId,checkedAt:config.dataAsOf,scope:'execution-window',status:'prepared',
    runConfig:{...config,schemaVersion:'3',executionPriceProtocol:fixture('execution-price.raw-events.json'),priceInputBindings:{signals:[],benchmark:{binding:'execution-series'}}},
    actualSource:fixture('backtest-snapshot-v3.manifest.json').actualSources[0],executionPreflight:ready});
}
export function b4Run(status:'succeeded'|'failed'|'queued'|'running'|'cancelled'='succeeded') {
  const manifest=fixture('backtest-snapshot-v3.manifest.json');const prepared=b4Prepared();if(prepared.status!=='prepared')throw Error('受控准备无效');
  return backtestRunDetailReadSchema.parse({id:b4RunId,strategyVersionId:b4VersionId,mode:'V3',status,stage:status,
    progress:status==='succeeded'?100:0,executionAttempt:1,snapshotId:'controlled-snapshot',resultChecksum:status==='succeeded'?'checksum':null,
    readEligibility:{state:'readable',code:'READABLE',scope:'none',accessedAt:null,revealedAt:null},runConfig:prepared.runConfig,
    result:status==='succeeded'?{source:'BACKTEST',schemaVersion:'3',snapshotVersion:'snapshot-manifest-v3',runId:b4RunId,strategyVersionId:b4VersionId,
      snapshotId:'controlled-snapshot',resultChecksum:'checksum',engineVersion:'controlled',marketRuleVersion:'fixture',calendarVersion:'fixture',aggregationVersion:'fixture',
      contentHash:'content',completeness:'complete',warnings:[],rejectedOrders:[],simulationFills:[],trades:[],
      equityCurve:[{occurredAt:'2024-01-02T07:00:00Z',value:{amount:'10000.12345678',currency:'CNY'}},{occurredAt:'2024-03-29T07:00:00Z',value:{amount:'10005.12345678',currency:'CNY'}}],metrics:{},
      executionPriceProtocol:manifest.executionPriceProtocol,comparableDataFingerprint:manifest.comparableDataFingerprint,actualSources:manifest.actualSources}:null});
}
export const b4Draft=authoringDraftReadSchema.parse({id:b4RunId,ownerId:'local',state:'editing',revision:1,title:'B4 受控编写',savedVersionId:null,
  content:{title:'B4 受控编写',description:'保留原始需求',questions:[],requirements:[],runtimeIntents:[],removedRequirements:[],definitionText:JSON.stringify(b4Definition),manualChanges:[]},
  validation:{status:'structurally_valid',issues:[]},createdAt:b4At,updatedAt:b4At});
export const b4Plan={...samplePlan,strategyVersionId:b4VersionId,executionSymbol:'600519.SH'};
export const b4Risk={...sampleRisk,id:b4RunId,strategyVersionId:b4VersionId,accountId:ledgerAccountId,symbol:'600519.SH',plan:b4Plan};
export const b4Preview={previewHash:'b4-preview',plan:b4Plan,evaluations:[],cycleMode:'existingAndFuture',context:{ledgerRevision:'7'}};
export const b4Experiment={...sampleExperiment,id:b4StrategyId,baselineStrategyVersionId:b4VersionId};
