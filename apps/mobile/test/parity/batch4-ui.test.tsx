// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { button,click,field,input,mount,setApi,view,flush } from './mobile-view-harness';
import { StrategyEditorScreen } from '../../src/features/strategy-editor/StrategyEditorScreen';
import { StrategyLibraryScreen } from '../../src/features/strategy-library/StrategyLibraryScreen';
import { AuthoringDraftScreen } from '../../src/features/strategy-authoring/AuthoringDraftScreen';
import { BacktestResultScreen } from '../../src/features/backtest-results/BacktestResultScreen';
import { StrategyRiskCreateScreen } from '../../src/features/strategy-risk/StrategyRiskCreateScreen';
import { StrategyRiskEditorScreen } from '../../src/features/strategy-risk/StrategyRiskEditorScreen';
import { OptimizationSetupScreen } from '../../src/features/optimization-setup/OptimizationSetupScreen';
import { BacktestPreparationEvidence } from '../../src/features/backtest-setup/BacktestPreparationEvidence';
import { b4Definition,b4Draft,b4Preview,b4Risk,b4Run,b4RunId,b4Strategy,b4VersionId,b4Prepared } from './batch4-fixture';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { ledgerAccount } from './ledger-fixture';
const storage=vi.hoisted(()=>new Map<string,string>());
vi.mock('@react-native-async-storage/async-storage',()=>({default:{getItem:async(k:string)=>storage.get(k)??null,
  setItem:async(k:string,v:string)=>{storage.set(k,v);},removeItem:async(k:string)=>{storage.delete(k);}}}));
vi.mock('../../src/platform/charts/MobileChart',()=>({MobileChart:()=>null}));
vi.mock('../../src/platform/output/export-file',()=>({exportCsv:vi.fn().mockResolvedValue(undefined)}));
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(status>=400?{error:'controlled_failure',...(value as object)}:value),{status});
beforeEach(()=>{storage.clear();view.runtime.baseUrl='https://ledger.test/api/v1';});
describe('第 4 批手机界面失败恢复',()=>{
  it('策略库按真实草稿、使用中及归档状态筛选，版本搜索保持身份',async()=>{
    const rows=[b4Strategy,{...b4Strategy,id:'draft-strategy',name:'本轮草稿',status:'draft',versions:[{...b4Strategy.versions[0],id:'draft-version',strategyId:'draft-strategy'}]},
      {...b4Strategy,id:'archived-strategy',name:'归档策略',status:'archived',versions:[{...b4Strategy.versions[0],id:'archived-version',strategyId:'archived-strategy'}]}];
    setApi(vi.fn<typeof fetch>().mockResolvedValue(respond(rows)));
    await mount(<StrategyLibraryScreen/>);await click(button('草稿'));
    expect(button('查看 本轮草稿 · 版本 1')).toBeTruthy();expect(button('查看 B4 受控策略 · 版本 1')).toBeUndefined();
    await input(field('搜索策略或版本'),'draft-version');expect(button('查看 本轮草稿 · 版本 1')).toBeTruthy();
    await input(field('搜索策略或版本'),'');await click(button('使用中'));
    expect(button('查看 B4 受控策略 · 版本 1')).toBeTruthy();expect(button('查看 本轮草稿 · 版本 1')).toBeUndefined();
    await click(button('已归档'));expect(button('查看 归档策略 · 版本 1')).toBeTruthy();expect(button('查看 B4 受控策略 · 版本 1')).toBeUndefined();
  });
  it('冻结概要保留关键来源与指纹，完整配置只在显式展开后显示',async()=>{
    const prepared=b4Prepared();if(prepared.status!=='prepared')throw Error('准备夹具无效');
    await mount(<BacktestPreparationEvidence value={prepared}/>);
    expect(document.body.textContent).toContain(prepared.runConfig.dataAsOf);
    expect(document.body.textContent).toContain(prepared.actualSource.provenance.providerId);
    expect(document.body.textContent).not.toContain('priceInputBindings');
    await click(button('展开完整准备证据'));expect(document.body.textContent).toContain('priceInputBindings');
    await click(button('收起完整准备证据'));expect(document.body.textContent).not.toContain('priceInputBindings');
  });
  it('创建响应丢失后保留完整输入与基线，找回唯一版本且不再次 POST',async()=>{
    let created=false;let saved:unknown;let posts=0;
    setApi(vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
      if(String(url).endsWith('/backtests/strategies')){
        if(init?.method==='POST'){posts++;saved=JSON.parse(String(init.body));created=true;throw new TypeError('Network response lost');}
        return respond(created?[b4Strategy]:[]);
      }return respond([]);
    }));
    await mount(<StrategyEditorScreen/>);
    await input(field('策略名称'),b4Strategy.name);await click(button('高级 JSON'));
    const text=JSON.stringify(b4Definition);await input(field('完整策略 JSON'),text);
    await click(button('确认创建策略'));expect(posts).toBe(1);expect(field('完整策略 JSON').value).toBe(text);
    expect(button('确认创建策略').disabled).toBe(true);expect([...storage.values()].some(v=>JSON.parse(v).pending)).toBe(true);
    await click(button('读取并找回保存结果'));expect(posts).toBe(1);expect(saved).toEqual({name:b4Strategy.name,schema:b4Definition});
    expect(button('打开已保存版本')).toBeTruthy();
  });
  it('编写修订冲突保留需求与本机原修订，不覆盖为服务端内容',async()=>{
    const posted:unknown[]=[];
    setApi(vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
      const p=String(url);if(p.endsWith(`/strategy-authoring/drafts/${b4RunId}`)){
        if(init?.method==='PATCH'){posted.push(JSON.parse(String(init.body)));return respond({message:'草稿修订冲突'},409);}
        return respond(b4Draft);
      }
      return respond([]);
    }));
    await mount(<AuthoringDraftScreen id={b4RunId}/>);await input(field('策略需求'),'需要保留的新需求');
    await click(button('保存服务端草稿'));expect(field('策略需求').value).toBe('需要保留的新需求');
    expect(document.body.textContent).toContain('草稿修订冲突');expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({expectedRevision:1,content:{description:'需要保留的新需求'}});
    expect([...storage.values()].some(v=>JSON.parse(v).revision===1)).toBe(true);
  });
  it('受限 Run 不渲染指标、曲线或 JSON 证据中的经济结果',async()=>{
    view.params={id:b4RunId,kind:'ordinary'};const run=b4Run();
    setApi(vi.fn<typeof fetch>().mockResolvedValue(respond({...run,readEligibility:{state:'restricted',code:'TEST_NOT_REVEALED',scope:'test',accessedAt:null,revealedAt:null},resultMetrics:{secret:'should-stay-hidden'}})));
    await mount(<BacktestResultScreen/>);await click(button('展开冻结来源与证据'));
    expect(document.body.textContent).toContain('读取受限');expect(document.body.textContent).not.toContain('10005.12345678');
    expect(document.body.textContent).not.toContain('should-stay-hidden');expect(button('导出权益 CSV')).toBeUndefined();
  });
  it('正式保存响应丢失并重启后复用原审核凭据，服务端修订推进不阻断找回',async()=>{
    const key=JSON.stringify(['mobile-authoring-content-v1',view.runtime.baseUrl,b4RunId]);
    const pendingSave={expectedRevision:1,name:b4Draft.content.title,reviewedDefinitionHash:'a'.repeat(64)};
    storage.set(key,JSON.stringify({text:JSON.stringify(b4Draft.content),revision:1,pendingSave}));
    const posts:unknown[]=[];
    setApi(vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
      const p=String(url);
      if(p.endsWith(`/drafts/${b4RunId}/save`)){
        posts.push(JSON.parse(String(init?.body)));
        return respond({strategyId:b4Strategy.id,versionId:b4VersionId,version:1});
      }
      if(p.endsWith(`/drafts/${b4RunId}`))return respond({...b4Draft,state:'saved',revision:2,savedVersionId:b4VersionId});
      return respond([]);
    }));
    await mount(<AuthoringDraftScreen id={b4RunId}/>);
    expect(button('找回原正式保存').disabled).toBe(false);
    await click(button('找回原正式保存'));
    expect(posts).toEqual([pendingSave]);expect(storage.has(key)).toBe(false);
    expect(button('打开正式策略版本')).toBeTruthy();
  });
  it('失败重试响应丢失后先读原 Run，轮次已推进时找回并禁止再次投递',async()=>{
    view.params={id:b4RunId,kind:'ordinary'};let retried=false;let posts=0;
    setApi(vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
      if(init?.method==='POST'&&String(url).endsWith('/retry')){posts++;retried=true;throw new TypeError('Network response lost');}
      return respond(retried?{...b4Run('running'),executionAttempt:2}:b4Run('failed'));
    }));
    await mount(<BacktestResultScreen/>);await click(button('重试失败回测'));expect(posts).toBe(1);
    expect(button('读取原 Run 找回操作')).toBeTruthy();await click(button('读取原 Run 找回操作'));await flush();
    expect(posts).toBe(1);expect(document.body.textContent).toContain('已从原 Run 找回操作进展');
  });
  it('风险申请变更标的使旧预览失效，默认应用与通知均关闭',async()=>{
    view.params={versionId:b4VersionId};const writes:unknown[]=[];
    setApi(vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
      const p=String(url);
      if(p.includes('/accounts?'))return respond([ledgerAccount]);
      if(p.endsWith('/backtests/strategies'))return respond([b4Strategy]);
      if(p.endsWith('/capabilities'))return respond({aiOptimizationEnabled:false,riskApplicationsEnabled:true,providers:[]});
      if(p.endsWith('/risk-applications/preview'))return respond(b4Preview);
      if(init?.method==='POST')writes.push(JSON.parse(String(init.body)));return respond([]);
    }));
    await mount(<StrategyRiskCreateScreen/>);await click(button(ledgerAccount.name));await click(button('预览策略风险计划'));
    expect(button('确认保存策略风险应用').disabled).toBe(false);
    expect(button('保存为停用').getAttribute('aria-pressed')).toBe('true');expect(button('关闭通知').getAttribute('aria-pressed')).toBe('true');
    await input(field('风险应用标的'),'600000.SH');expect(button('确认保存策略风险应用').disabled).toBe(true);expect(writes).toHaveLength(0);
  });
  it('实验能力关闭时零准备/创建请求；风险详情不能跨当前模式修改',async()=>{
    const calls:string[]=[];const fetcher=vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
      const p=String(url);if(init?.method)calls.push(init.method);
      if(p.includes('/accounts?'))return respond([ledgerAccount]);
      if(p.endsWith('/backtests/strategies'))return respond([b4Strategy]);
      if(p.includes('/risk-applications/'))return respond({...b4Risk,accountId:b4VersionId});
      if(p.endsWith('/capabilities'))return respond({aiOptimizationEnabled:false,riskApplicationsEnabled:false,providers:[]});
      return respond([]);
    });setApi(fetcher);
    await mount(<OptimizationSetupScreen/>);expect(button('准备实验价格与执行配置').disabled).toBe(true);expect(button('确认创建优化实验').disabled).toBe(true);
    view.params={id:b4RunId};await mount(<StrategyRiskEditorScreen/>);expect(document.body.textContent).toContain('不属于当前账户模式');expect(calls).toEqual([]);
  });
  it('待确认风险申请在能力关闭时保留原凭据并禁止再次创建',async()=>{
    const key=JSON.stringify(['mobile-strategy-risk-create-v1',view.runtime.baseUrl,view.runtime.mode]);
    const pending={strategyVersionId:b4VersionId,accountId:ledgerAccount.id,symbol:b4Risk.symbol,
      cycleMode:b4Risk.cycleMode,enabled:false,notification:b4Risk.notification,
      previewHash:b4Preview.previewHash,idempotencyKey:'b4-risk-pending'};
    storage.set(key,JSON.stringify(pending));const writes:string[]=[];
    setApi(vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
      const p=String(url);if(init?.method)writes.push(init.method);
      if(p.includes('/accounts?'))return respond([ledgerAccount]);
      if(p.endsWith('/backtests/strategies'))return respond([b4Strategy]);
      if(p.endsWith('/capabilities'))return respond({aiOptimizationEnabled:false,riskApplicationsEnabled:false,providers:[]});
      return respond([]);
    }));
    await mount(<StrategyRiskCreateScreen/>);
    expect(button('找回原风险应用申请').disabled).toBe(true);
    expect(JSON.parse(storage.get(key)!)).toEqual(pending);expect(writes).toEqual([]);
  });
  it('审核完成后修改草稿立即使旧审核失效；没有确认的需求不得生成',async()=>{
    const writes:string[]=[];
    setApi(vi.fn<typeof fetch>().mockImplementation(async(url,init)=>{
      const p=String(url);if(init?.method)writes.push(p);
      if(p.endsWith('/review'))return respond({revision:1,definition:b4Definition,definitionHash:'a'.repeat(64)});
      if(p.endsWith(`/drafts/${b4RunId}`))return respond(b4Draft);return respond([]);
    }));
    const api=view.runtime.api as ThesisLedgerApiClient;
    vi.spyOn(api.strategy.authoring,'models').mockResolvedValue([{key:'fixture-model',providerId:'controlled',model:'fixture',
      available:{analyze:true,generate:true,modify:true},costUnknown:false,pricingLabel:'受控费用'}]);
    await mount(<AuthoringDraftScreen id={b4RunId}/>);
    await click(button('controlled / fixture · 已验证'));await click(button('生成定义'));
    expect(button('确认提交模型操作').disabled).toBe(true);
    await click(button('审核完整策略定义'));await click(button('已核对定义并确认保存'));
    expect(button('确认保存正式版本').disabled).toBe(false);
    await input(field('策略需求'),'审核后修改');expect(button('确认保存正式版本').disabled).toBe(true);expect(writes).toEqual([]);
  });
});
