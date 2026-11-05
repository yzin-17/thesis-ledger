import { describe,it,expect } from 'vitest';
import { recoverStrategySave, validatedDefinition, parsePendingStrategySave } from '../../src/features/strategy-editor/strategy-editor-state';
import { backtestActionRecovered } from '../../src/features/backtest-jobs/backtest-state';
import { freezeOrdinarySubmission, freezeNavSubmission } from '../../src/features/backtest-setup/backtest-submission';
import { ordinaryPreparationIntent, newBacktestForm } from '../../src/features/backtest-setup/backtest-intent';
import { mobileEquityChart, mobileEquityCsv } from '../../src/features/backtest-results/backtest-equity';
import { parseExperimentAction } from '../../src/features/optimization-results/experiment-actions';
import { riskUpdateSatisfied } from '../../src/features/strategy-risk/risk-application-actions';
import { riskNotificationBody, emptyRiskNotification } from '../../src/features/strategy-risk/risk-notification-model';
import { candidateAdoptionEligibility, canRevealTestMetrics,canGenerateAuthoringContent,canModifyAuthoringContent,authoringContentSchema } from '@thesis-ledger/schemas';
import { b4Definition,b4Prepared,b4Strategy,b4StrategyId,b4VersionId,b4Run,b4RunId,b4Risk,b4Draft,fixture } from './batch4-fixture';
describe('第 4 批冻结、归属与恢复',()=>{
  it('完整确认的有效定义允许局部修改，损坏文本或未确认内容仍拒绝',()=>{
    const content=authoringContentSchema.parse({...b4Draft.content,
      requirements:[{id:'confirmed',quote:'已确认需求',interpretation:'保留定义',state:'understood',definitionPaths:['entry']}],
      confirmation:{instrumentId:'controlled',instrument:b4Definition.executionInstrument,timeframe:b4Definition.primaryTimeframe,
        entrySummary:'close > open',exitSummary:'持仓退出',sizing:b4Definition.sizing,risk:b4Definition.risk,
        noExtraRiskConfirmed:false,execution:b4Definition.execution,cost:b4Definition.cost,periodsAreBarsConfirmed:true}});
    expect(canGenerateAuthoringContent(content)).toBe(true);expect(canModifyAuthoringContent(content)).toBe(true);
    expect(canModifyAuthoringContent({...content,definitionText:'{ broken'})).toBe(false);
    expect(canModifyAuthoringContent({...content,confirmation:undefined})).toBe(false);
  });
  it('定义完整保留，非法输入不被示例替换；未知提交只认新且唯一的匹配回执',()=>{
    const schema=validatedDefinition(JSON.stringify(b4Definition));expect(schema).toEqual(b4Definition);
    expect(()=>validatedDefinition('{ broken')).toThrow();
    const pending=parsePendingStrategySave({name:b4Strategy.name,schema,baselineIds:[]});
    expect(recoverStrategySave(pending,[b4Strategy])).toEqual({strategyId:b4StrategyId,versionId:b4VersionId});
    expect(recoverStrategySave({...pending,baselineIds:[b4StrategyId]},[b4Strategy])).toBeNull();
    expect(recoverStrategySave(pending,[b4Strategy,{...b4Strategy,id:b4RunId}])).toBeNull();
    expect(recoverStrategySave({...pending,strategyId:b4StrategyId,baselineIds:[b4VersionId]},[b4Strategy])).toBeNull();
  });
  it('普通冻结保留预检版本和整个配置，不允许换版本；不完整净值凭证拒绝',()=>{
    const prepared=b4Prepared();const pending=freezeOrdinarySubmission(b4VersionId,prepared,'original-key');
    expect(pending.body.idempotencyKey).toBe('original-key');
    expect(pending.kind==='ordinary'&&pending.body.runConfig).toEqual(prepared.status==='prepared'&&prepared.runConfig);
    expect(()=>freezeOrdinarySubmission(b4RunId,prepared,'new-key')).toThrow();
    expect(()=>freezeNavSubmission(b4VersionId,{status:'prepared',binding:{strategyVersionId:b4VersionId},receipt:null} as never,'key')).toThrow();
  });
  it('已确认的失败重试以轮次恢复，查询到推进后不再投递；缺失轮次拒绝',()=>{
    const pending={id:b4RunId,kind:'ordinary' as const,action:'retry' as const,expectedAttempt:1};
    expect(backtestActionRecovered(pending,b4Run('failed'))).toBe(false);
    expect(backtestActionRecovered(pending,{...b4Run('failed'),executionAttempt:2})).toBe(true);
    expect(()=>backtestActionRecovered({...pending,expectedAttempt:null},b4Run('failed'))).toThrow();
    expect(backtestActionRecovered({...pending,action:'cancel'},b4Run('succeeded'))).toBe(true);
  });
  it('历史口径与执行模型不自动转换，非法研究附加字段零准备',()=>{
    const form={...newBacktestForm('600519.SH'),start:'2024-01-02',end:'2024-03-29',cash:'10000',model:JSON.stringify(fixture('backtest-execution-model.cn-2024q1.json'))};
    const intent=ordinaryPreparationIntent(form,b4VersionId,'intent-1','2026-09-11T00:00:00Z');
    expect(intent.accountingBasis).toBe('raw-events');expect(intent.history.basis).toBe('fixed-provider-snapshot');
    expect(()=>ordinaryPreparationIntent({...form,extras:'{"strategyVersionId":"escape"}'},b4VersionId,'i','2026-09-11T00:00:00Z')).toThrow();
    expect(()=>ordinaryPreparationIntent({...form,history:'point-in-time',evidence:''},b4VersionId,'i','2026-09-11T00:00:00Z')).toThrow();
  });
  it('图表有限值且按时点排序，CSV 保留原始金额与所选范围，不补造现金',()=>{
    const result=b4Run().result!;const csv=mobileEquityCsv(result,'Asia/Shanghai','CNY');
    expect(csv).toContain('10000.12345678,,');expect(csv).toContain('10005.12345678,,');
    expect(mobileEquityCsv(result,'Asia/Shanghai','CNY','month')).not.toContain('10000.12345678');
    const chart=mobileEquityChart(result);expect(chart.main).toBe('line');expect(chart.candles).toHaveLength(2);
    expect(chart.candles.every(p=>Number.isFinite(p.close))).toBe(true);
  });
  it('未揭示候选不能采用；锁定集合与通知整数受合同校验',()=>{
    const experiment={status:'succeeded',stage:'completed',readEligibility:{state:'restricted' as const,code:'TEST_NOT_REVEALED' as const,scope:'test' as const,accessedAt:null,revealedAt:null}};
    const candidate={id:b4RunId,validationStatus:'test_valid',metrics:{},readEligibility:{...experiment.readEligibility,state:'readable' as const}};
    expect(canRevealTestMetrics(experiment,candidate)).toBe(false);expect(candidateAdoptionEligibility(experiment,candidate)).toContain('尚未揭示');
    expect(()=>parseExperimentAction({id:b4StrategyId,action:'finalize',body:{candidateIds:[b4RunId],selectedCandidateId:b4VersionId,expectedStage:'awaiting_finalization'}})).toThrow();
    expect(()=>riskNotificationBody({...emptyRiskNotification(),cooldown:''})).toThrow();
    expect(riskUpdateSatisfied(b4Risk as never,{expectedRevision:2,enabled:false})).toBe(true);
    expect(riskUpdateSatisfied(b4Risk as never,{expectedRevision:2,enabled:true})).toBe(false);
  });
});
