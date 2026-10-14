import { describe, expect, it } from 'vitest';
import type { AuthoringContent } from '@thesis-ledger/schemas';
import { currentAuthoringAnalysisContent } from '../../src/strategy-authoring/authoring-source-text.js';
import {
  mergeAuthoringAnalysis,
  validateAuthoringAnalysis,
} from '../../src/strategy-authoring/authoring-analysis.js';

const question = (id = 'timeframe'): AuthoringContent['questions'][number] => ({
  id,
  basedOnRevision: 3,
  quote: '按日线',
  reason: '确认信号周期',
  options: ['日线'],
  dependsOn: [],
  answer: '日线',
  answerState: 'confirmed',
});
const requirement = (id = 'entry'): AuthoringContent['requirements'][number] => ({
  id,
  quote: '按日线',
  interpretation: '日线信号',
  state: 'understood',
  definitionPaths: [],
});
const fixture = (): AuthoringContent => ({
  title: '原始策略',
  description: '按日线，收盘价突破时入场',
  questions: [question()],
  requirements: [requirement()],
  runtimeIntents: ['用户选择回测区间'],
  removedRequirements: ['不使用基准'],
  definitionText: '{"用户":"编辑的内容"}',
  manualChanges: ['保留原有编辑'],
});
const output = () => ({
  requirements: [requirement()],
  questions: [{ ...question(), answer: null, answerState: 'unanswered' }],
  runtimeIntents: [],
});

describe('编写分析的引用和用户确认边界', () => {
  it('模型将明确并行交易多个代码误标已理解时，应用结果仍标为不支持并保留原文', () => {
    const content = fixture();
    content.description = '同时交易159516.SZ和510300.SH。';
    content.questions = [];
    content.requirements = [];
    const item = { ...requirement(), quote: content.description };
    const merged = mergeAuthoringAnalysis(content, 3, {
      requirements: [item],
      questions: [],
      runtimeIntents: [],
    });
    expect(merged.requirements[0]).toEqual({ ...item, state: 'unsupported' });
    expect(item.state).toBe('understood');
  });
  it('描述变更后重新分析移出过期问题及需求，保留历史输入和明确移除项', () => {
    const content = fixture();
    content.description = '每分钟交易';
    content.questions[0]!.answerState = 'needs_review';
    content.questions.push({
      ...question('dependent'),
      quote: '每分钟',
      dependsOn: ['timeframe'],
      answerState: 'needs_review',
    });
    content.requirements.push({ ...requirement('removed'), state: 'removed' });
    const proposed = {
      requirements: [{ ...requirement(), quote: '每分钟交易' }],
      questions: [],
      runtimeIntents: [],
    };
    const merged = mergeAuthoringAnalysis(content, 3, proposed);
    expect(merged.questions).toEqual([]);
    expect(merged.requirements).toEqual([
      { ...requirement('removed'), state: 'removed' },
      { ...requirement(), quote: '每分钟交易' },
    ]);
    expect(content.questions).toHaveLength(2);
    expect(content.requirements[0]!.quote).toBe('按日线');
    expect(merged.definitionText).toBe(content.definitionText);
    expect(currentAuthoringAnalysisContent(content).questions).toEqual([]);
    expect(currentAuthoringAnalysisContent(content).requirements).toEqual([
      { ...requirement('removed'), state: 'removed' },
    ]);
  });
  it('只接受原始描述或已确认答案中的需求引用，拒绝模型虚构原文', () => {
    const content = fixture();
    const proposed = output();
    proposed.requirements[0]!.quote = '模型虚构的百分比';
    expect(() => validateAuthoringAnalysis(content, 3, proposed)).toThrow(
      'AUTHORING_ANALYSIS_INVALID',
    );
    proposed.requirements[0]!.id = 'answer';
    proposed.requirements[0]!.quote = '日线';
    proposed.questions[0]!.quote = '';
    content.description = '使用已确认周期';
    expect(validateAuthoringAnalysis(content, 3, proposed).requirements[0]!.quote).toBe('日线');
    content.questions[0]!.answerState = 'needs_review';
    expect(() => validateAuthoringAnalysis(content, 3, proposed)).toThrow(
      'AUTHORING_ANALYSIS_INVALID',
    );
  });
  it('拒绝错修订、未知依赖和循环依赖', () => {
    for (const mode of ['revision', 'missing', 'self', 'cycle']) {
      const proposed = output();
      if (mode === 'revision') proposed.questions[0]!.basedOnRevision = 2;
      if (mode === 'missing') proposed.questions[0]!.dependsOn = ['unknown'];
      if (mode === 'self') proposed.questions[0]!.dependsOn = ['timeframe'];
      if (mode === 'cycle') {
        proposed.questions[0]!.dependsOn = ['execution'];
        proposed.questions.push({
          ...proposed.questions[0]!,
          id: 'execution',
          dependsOn: ['timeframe'],
        });
      }
      expect(() => validateAuthoringAnalysis(fixture(), 3, proposed)).toThrow(
        'AUTHORING_ANALYSIS_INVALID',
      );
    }
  });
  it('模型不能确认用户答案、移除需求或用旧 ID 替换原文', () => {
    const proposed = { ...output(), questions: [{ ...question(), answer: '代替用户回答' }] };
    expect(() => validateAuthoringAnalysis(fixture(), 3, proposed)).toThrow();
    const replaced = output();
    replaced.requirements[0]!.quote = '收盘价突破时入场';
    expect(() => validateAuthoringAnalysis(fixture(), 3, replaced)).toThrow(
      'AUTHORING_ANALYSIS_INVALID',
    );
    const removed = { ...output(), requirements: [{ ...requirement(), state: 'removed' }] };
    expect(() => validateAuthoringAnalysis(fixture(), 3, removed)).toThrow();
  });
  it('相同问题保留确认，遗漏的原需求及手动定义保持完整', () => {
    const content = fixture();
    content.requirements.push(requirement('omitted'));
    const merged = mergeAuthoringAnalysis(content, 3, output());
    expect(merged.questions[0]).toMatchObject({
      answer: '日线',
      answerState: 'confirmed',
      basedOnRevision: 4,
    });
    expect(merged.requirements.map((item) => item.id)).toEqual(['entry', 'omitted']);
    expect(merged.definitionText).toBe(content.definitionText);
    expect(merged.manualChanges).toEqual(content.manualChanges);
    expect(merged.removedRequirements).toEqual(content.removedRequirements);
    expect(merged.runtimeIntents).toEqual(content.runtimeIntents);
    expect(content.questions[0]!.basedOnRevision).toBe(3);
  });
  it('问题变化后答案待审核，所有依赖答案失效而不自动确认', () => {
    const content = fixture();
    content.questions.push(
      { ...question('execution'), dependsOn: ['timeframe'] },
      { ...question('cost'), dependsOn: ['execution'] },
    );
    const proposed = output();
    proposed.questions[0]!.options = ['日线', '周线'];
    const merged = mergeAuthoringAnalysis(content, 3, proposed);
    expect(merged.questions.map((item) => item.answerState)).toEqual([
      'needs_review',
      'needs_review',
      'needs_review',
    ]);
    expect(merged.questions.map((item) => item.answer)).toEqual(['日线', '日线', '日线']);
    expect(content.questions.map((item) => item.answerState)).toEqual([
      'confirmed',
      'confirmed',
      'confirmed',
    ]);
  });
  it('明确移除的需求不能被模型恢复，新增内容超过上限时拒绝而不截断', () => {
    const content = fixture();
    content.requirements[0]!.state = 'removed';
    expect(mergeAuthoringAnalysis(content, 3, output()).requirements[0]!.state).toBe('removed');
    content.runtimeIntents = Array.from({ length: 64 }, (_, index) => `原始运行意图 ${index}`);
    expect(() =>
      mergeAuthoringAnalysis(content, 3, { ...output(), runtimeIntents: ['超额的新意图'] }),
    ).toThrow();
    expect(content.runtimeIntents).toHaveLength(64);
  });
});
