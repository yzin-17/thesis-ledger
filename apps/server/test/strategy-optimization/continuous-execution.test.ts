import {expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {backtestRunPreparationRequestV3Schema,optimizationRunPreparationRequestSchema,type StrategySubmissionInput} from '@thesis-ledger/schemas';
import {BacktestRunPreparationService} from '../../src/backtest/backtest-run-preparation.service.js';
import {OptimizationPreparation} from '../../src/strategy-optimization/optimization-preparation.js';
import {StrategySubmissionExecution} from '../../src/strategy-optimization/strategy-submission-execution.js';
import {priceResearchFixture} from '../backtest/price-research.fixtures.js';

it('普通回测与零价优化使用原冻结输入；收费或未知模型在取价前阻断',async()=>{
  const f=await priceResearchFixture(), c=f.input.runConfig, id=randomUUID();
  const prep=new BacktestRunPreparationService({strategyVersion:{findUnique:async()=>({schemaVersion:3,schema:f.input.strategy})}} as never,f.reader as never,f.control as never);
  const intent={contractVersion:3,requestId:id,warmupBudgetSessions:60,adjustment:'hfq',priceResearch:'price-research-v1',priceResearchReference:'freeze',accountingBasis:'normalized-series',history:{basis:'fixed-provider-snapshot'},
    runConfig:{startDate:c.startDate,endDate:c.endDate,dataAsOf:c.dataAsOf,baseCurrency:c.baseCurrency,initialCash:c.initialCash,valuationPolicy:c.valuationPolicy,executionModel:c.executionModel}};
  const ordinary:StrategySubmissionInput={kind:'ordinary',preparation:backtestRunPreparationRequestV3Schema.parse({...intent,strategyVersionId:id})};
  const optimization:Extract<StrategySubmissionInput,{kind:'optimization'}>={kind:'optimization',preparation:optimizationRunPreparationRequestSchema.parse({intent,target:{sourceMode:'existing',strategyVersionId:id}}),
    settings:{models:[{provider:'fixture',model:'test'}],maxRounds:1,allowedParameterIds:['params.period'],objective:{mode:'balanced',minClosedTrades:1},
      split:{development:{start:c.startDate,end:c.startDate},validation:{start:c.startDate,end:c.endDate},test:{start:c.endDate,end:c.endDate}},
      budget:{maxAiCalls:2,maxBacktestRuns:10,maxInputTokens:10000,maxOutputTokens:2000,maxDurationSeconds:600},acknowledgeUnknownCost:false}};
  let price:number|undefined=1;
  const ordinaryCreate=vi.fn(async()=>({id})),experimentCreate=vi.fn(async()=>({id}));
  const revisions=vi.fn();
  const service=new StrategySubmissionExecution({} as never,prep,{} as never,new OptimizationPreparation(prep),{createRun:ordinaryCreate} as never,{} as never,
    {create:experimentCreate} as never,{capabilities:()=>({aiOptimizationEnabled:true,providers:[{provider:'fixture',model:'test',costStatus:'known'}]})} as never,
    {strict:()=>({metadata:{costPer1kInput:price,costPer1kOutput:price,costCurrency:'CNY'}})} as never,{readCurrent:revisions} as never);
  await expect(service.prepare(optimization)).rejects.toThrow('零价');price=undefined;await expect(service.prepare(optimization)).rejects.toThrow('零价');
  expect(f.reader.readV3).not.toHaveBeenCalled();price=0;
  const a=await service.prepare(ordinary);expect(a.status).toBe('prepared');
  await service.create(id,ordinary,a);
  expect(ordinaryCreate).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:'strategy-submit:'+id,runConfig:expect.objectContaining({frozenExecutionWindow:expect.anything()})}));
  const b=await service.prepare(optimization);
  if(b.status!=='prepared'||!('routeRevisions' in b))throw Error('未获得冻结实验配置');
  revisions.mockResolvedValue({...b.routeRevisions,desiredRevision:b.routeRevisions.desiredRevision+1});await expect(service.create(id,optimization,b)).rejects.toThrow('路由已变化');
  expect(experimentCreate).not.toHaveBeenCalled();
  revisions.mockResolvedValue(b.routeRevisions);await service.create(id,optimization,b);
  expect(experimentCreate).toHaveBeenCalledWith(expect.objectContaining({runConfig:b.runConfig,budget:expect.objectContaining({maxCost:'0'})}));
});
