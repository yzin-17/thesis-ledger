import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { aiGenerationContracts, AUTHORING_LIMITS } from '@thesis-ledger/schemas';
import { authoringMessages } from '../../src/strategy-authoring/authoring-prompt.js';
import type { AuthoringOperation } from '../../src/strategy-authoring/authoring-operation.repository.js';
import { validateAuthoringAnalysis } from '../../src/strategy-authoring/authoring-analysis.js';
import { tradePlanProvider } from './trade-plan-provider.fixture.js';
import { volatilityContent } from './volatility-target.fixture.js';
import { monthlyContent } from './monthly-rebalance.fixture.js';

const output = process.env.BACKTEST_PLAN_ACCEPTANCE_DIR;
it.skipIf(!output)(
  '实际分析入口区分指定调仓节奏与当前能力边界',
  async () => {
    const directory = resolve(output!);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const write = (name: string, value: unknown) =>
      writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2), {
        mode: 0o600,
        flag: 'wx',
      });
    const row = JSON.parse(readFileSync(resolve(directory, 'provider.json'), 'utf8'));
    const qualified = await tradePlanProvider(row, write, 'authoring-analysis');
    const monthly = process.env.BACKTEST_PLAN_SCENARIO === 'monthly-rebalance';
    const content = monthly ? monthlyContent : volatilityContent;
    const cases = [
      {
        id: monthly ? 'month-end-rebalance' : 'daily-volatility',
        content: content(true),
        unsupported: false,
      },
      {
        id: monthly ? 'daily-fixed-target' : 'entry-only',
        content: content(true),
        unsupported: true,
      },
    ];
    cases[1]!.content.description = monthly
      ? '单标的日线，空仓即允许买入，普通退出始终不触发。每天收盘都把仓位主动调回权益30%，绝对偏离不足3个百分点跳过；不是只在月末调仓，也不按波动率变化计算目标。随后首个可交易开盘执行，不添加其他风控。'
      : '单标的日线，空仓即允许买入，普通退出始终不触发。仅在首次开仓前，用最近20个简单日收益的样本标准差乘根号252计算年化波动率，将首次权益投入设为10%除以该波动率、上限50%，需21个有效收盘。持仓期间绝不因波动变化主动增减仓。样本不足或零波动不新增投入，不强制清仓；随后可交易开盘成交，不添加其他风控。';
    for (const sample of cases) {
      sample.content.description =
        '仅交易159516.SZ，佣金0.03%、滑点0.1%，无独立风控。' + sample.content.description;
      sample.content.requirements = [];
      sample.content.confirmation = null;
    }
    const results = [];
    for (const sample of cases) {
      const operation = {
        revision: 1,
        input: {
          content: sample.content,
          selection: { kind: 'analyze', intent: sample.content.description },
        },
      } as AuthoringOperation;
      const messages = authoringMessages(operation),
        runtime = qualified.resolved.provider.sdkRuntime!();
      let phase = 'generation';
      let generation;
      try {
        generation = await qualified.adapter.generate({
          requestId: randomUUID(),
          adapter: qualified.resolved.execution.adapter,
          providerId: row.name,
          baseURL: runtime.baseURL,
          authMode: 'none',
          apiKey: runtime.apiKey,
          model: qualified.model,
          messages,
          contract: aiGenerationContracts.authoringAnalysis.ref,
          schema: aiGenerationContracts.authoringAnalysis.schema,
          mode: qualified.resolved.execution.mode,
          transport: 'stream',
          maxOutputTokens: AUTHORING_LIMITS.outputTokens,
          ...(qualified.resolved.execution.requestOptions
            ? { requestOptions: qualified.resolved.execution.requestOptions }
            : {}),
          timeout: { totalMs: AUTHORING_LIMITS.deadlineMs, firstChunkMs: 90000, chunkMs: 45000 },
          signal: AbortSignal.timeout(AUTHORING_LIMITS.deadlineMs),
        });
        phase = 'analysis';
        const analysis = validateAuthoringAnalysis(sample.content, 1, generation.output);
        expect(analysis.requirements.length).toBeGreaterThan(0);
        expect(analysis.questions).toEqual([]);
        expect(analysis.runtimeIntents).toEqual([]);
        if (!sample.unsupported)
          expect(analysis.requirements.every((item) => item.state === 'understood')).toBe(true);
        const identified = analysis.requirements.some(
          (item) =>
            item.state === 'unsupported' &&
            (monthly ? /每日|每天|调仓/.test(item.quote) : /开仓|入场|波动/.test(item.quote)),
        );
        const category =
          identified === sample.unsupported ? 'passed' : 'model_capability_not_identified';
        const receipt = {
          id: sample.id,
          category,
          intent: sample.content.description,
          messages,
          generation,
          analysis,
          configuration: null,
          orders: [],
          reason: sample.unsupported
            ? '当前 Schema 不支持该更新节奏，应保留未支持需求，不替换为另一种计划'
            : '分析支持该调仓节奏；实际生成和执行由独立批次验收',
        };
        write(sample.id + '.json', receipt);
        results.push(receipt);
      } catch (error) {
        const receipt = {
          id: sample.id,
          category: phase === 'analysis' ? 'model_analysis_rejected' : 'generation_failed',
          phase,
          message: String(error),
          generation,
          intent: sample.content.description,
          messages,
          configuration: null,
          orders: [],
        };
        write(sample.id + '.json', receipt);
        results.push(receipt);
      }
    }
    write('receipt.json', { calls: 3, providerWrites: 0, historicalWrites: 0, results });
    expect(results.every((sample) => sample.category === 'passed')).toBe(true);
  },
  600000,
);
