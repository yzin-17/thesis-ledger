import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authoringStrategySchema, type AuthoringContent } from '@thesis-ledger/schemas';
import { AuthoringDefinition } from '../src/features/strategy-authoring/AuthoringDefinition.js';
import { editAuthoringDefinition } from '../src/features/strategy-authoring/authoring-definition-edit.model.js';
import { AuthoringOperation } from '../src/features/strategy-authoring/AuthoringOperation.js';
import { AuthoringSelect } from '../src/features/strategy-authoring/AuthoringSelect.js';
import { AuthoringClarification } from '../src/features/strategy-authoring/AuthoringClarification.js';
import { AuthoringSaveReview } from '../src/features/strategy-authoring/AuthoringSaveReview.js';
import {
  confirmationDraft,
  parseConfirmationDraft,
} from '../src/features/strategy-authoring/authoring-confirmation.model.js';
import { emptyAuthoringContent } from '../src/features/strategy-authoring/use-authoring-draft.js';
import {
  currentIdentitySession,
  setIdentitySession,
  withIdentitySession,
} from '../src/shared/api/identity-session.js';

const definition = authoringStrategySchema.parse(
  readFileSync(
    new URL('../../../packages/schemas/fixtures/strategy-authoring.exchange.json', import.meta.url),
    'utf8',
  ),
);
afterEach(() => setIdentitySession(null));
describe('编写客户端合同与实际预览', () => {
  it.each([
    ['discarded', '已放弃'],
    ['expired', '已过期'],
    ['applied', '已应用'],
  ])('修改建议 %s 显示明确中文状态', (status, label) => {
    const html = renderToStaticMarkup(
      <AuthoringOperation
        operation={{
          id: 'op',
          revision: 1,
          status: 'succeeded',
          disposition: 'unapplied',
          input: { selection: { kind: 'modify', providerId: 'local', model: 'selected' } as never },
          outcome: null,
        }}
        proposal={{
          id: 'proposal',
          revision: 1,
          status,
          payload: { intent: '止损改为5%', differences: [] } as never,
        }}
        busy={false}
        stale={false}
        onAction={vi.fn()}
        onProposal={vi.fn()}
      />,
    );
    expect(html).toContain(`建议${label}`);
    expect(html).not.toContain('处理或过期');
  });
  it('最终审核说明不依赖表单 Field 上下文，展示实际定义和修订', () => {
    const html = renderToStaticMarkup(
      <AuthoringSaveReview definition={definition} revision={11} />,
    );
    expect(html).toContain('审核修订 11');
    expect(html).toContain('510300.SH');
    expect(html).toContain('入场逻辑');
    expect(html).toContain('成本：佣金');
  });
  it('分析应用后的需求路径和不支持说明可在真实 Field 上下文中渲染', () => {
    const html = renderToStaticMarkup(
      <AuthoringClarification
        content={{
          ...emptyAuthoringContent,
          requirements: [
            {
              id: 'r',
              quote: '做空',
              interpretation: '当前不可执行',
              state: 'unsupported',
              definitionPaths: ['entry'],
            },
          ],
          questions: [
            {
              id: 'q',
              basedOnRevision: 1,
              quote: '仓位',
              reason: '确认仓位',
              options: ['50%'],
              dependsOn: [],
              answer: null,
              answerState: 'unanswered',
            },
          ],
        }}
        onChange={vi.fn()}
        disabled={false}
      />,
    );
    expect(html).toContain('定义位置：entry');
    expect(html).toContain('当前不支持');
    expect(html).toContain('确认这个答案');
  });
  it('长模型名称允许控件收缩，当前回显保持完整中文标签', () => {
    const label = 'lmstudio / qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m · 配置估算';
    const html = renderToStaticMarkup(
      <AuthoringSelect
        value="selected"
        onChange={vi.fn()}
        options={[{ value: 'selected', label }]}
        label="编写模型"
      />,
    );
    expect(html).toContain('w-full min-w-0');
    expect(html).toContain('min-w-0 truncate');
    expect(html).toContain(label);
  });
  it('仅 JSON 格式调整保留审核，实际语义编辑或无效文本要求重新确认', () => {
    const content: AuthoringContent = {
      ...emptyAuthoringContent,
      definitionText: JSON.stringify(definition),
      requirements: [
        {
          id: 'r',
          quote: '原始需求',
          interpretation: '规则',
          state: 'understood',
          definitionPaths: ['entry'],
        },
      ],
    };
    expect(editAuthoringDefinition(content, JSON.stringify(definition, null, 2))).toEqual({
      ...content,
      definitionText: JSON.stringify(definition, null, 2),
    });
    const changed = editAuthoringDefinition(
      content,
      JSON.stringify({ ...definition, risk: [{ type: 'fixedStop', percent: '0.06' }] }),
    );
    expect(changed.confirmation).toBeNull();
    expect(changed.requirements[0]!.state).toBe('unresolved');
    expect(changed.manualChanges).toContain('用户手动编辑策略定义');
    expect(editAuthoringDefinition(content, '{unfinished').definitionText).toBe('{unfinished');
    expect(editAuthoringDefinition(content, '{unfinished').requirements[0]!.state).toBe(
      'unresolved',
    );
  });
  it('未填写确认表单没有仓位、风险、费用或时机默认值', () => {
    const draft = confirmationDraft(emptyAuthoringContent);
    expect(draft).toMatchObject({
      instrument: null,
      timeframe: '',
      sizingType: '',
      sizingValue: '',
      riskMode: '',
      commissionRate: '',
      slippageRate: '',
      executionMode: '',
      periodsAreBarsConfirmed: false,
    });
    expect(() => parseConfirmationDraft(draft, emptyAuthoringContent)).toThrow();
  });
  it('部分条件可恢复，但不成为已确认交易条件', () => {
    const partial = { ...confirmationDraft(emptyAuthoringContent), entrySummary: '上穿 20 根均线' };
    expect(confirmationDraft({ ...emptyAuthoringContent, confirmationDraft: partial })).toEqual(
      partial,
    );
    expect(() => parseConfirmationDraft(partial, emptyAuthoringContent)).toThrow();
  });
  it('读回正式确认数值并保持佣金、风险及周期', () => {
    const content: AuthoringContent = {
      ...emptyAuthoringContent,
      confirmation: {
        instrumentId: 'catalog',
        instrument: definition.executionInstrument,
        timeframe: definition.primaryTimeframe,
        entrySummary: '上穿入场',
        exitSummary: '下穿退出',
        sizing: definition.sizing,
        risk: definition.risk,
        noExtraRiskConfirmed: false,
        execution: definition.execution,
        cost: definition.cost,
        periodsAreBarsConfirmed: true,
      },
    };
    expect(parseConfirmationDraft(confirmationDraft(content), content)).toEqual(
      content.confirmation,
    );
  });
  it('可读预览来自当前定义；无效 JSON 保持文本且提示修正', () => {
    const html = renderToStaticMarkup(
      <AuthoringDefinition
        content={{ ...emptyAuthoringContent, definitionText: JSON.stringify(definition) }}
        onChange={vi.fn()}
        disabled={false}
      />,
    );
    expect(html).toContain('510300.SH');
    expect(html).toContain('入场逻辑');
    expect(html).toContain('20');
    expect(html).toContain('0.0003');
    const invalid = renderToStaticMarkup(
      <AuthoringDefinition
        content={{ ...emptyAuthoringContent, definitionText: '{broken' }}
        onChange={vi.fn()}
        disabled={false}
      />,
    );
    expect(invalid).toContain('定义需要修正');
    expect(invalid).toContain('{broken');
  });
  it('会话仅在内存，头与网关凭据并存，退出移除个人凭据', () => {
    const session = {
      token: 'A'.repeat(43),
      expiresAt: '2026-10-07T00:00:00Z',
      principal: {
        id: '11111111-1111-4111-8111-111111111111',
        username: 'alice',
        displayName: '甲',
      },
    };
    setIdentitySession(session);
    const init = withIdentitySession({ headers: { authorization: 'Bearer gateway' } });
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer gateway');
    expect(new Headers(init.headers).get('x-thesis-ledger-session')).toBe(session.token);
    setIdentitySession(null);
    expect(currentIdentitySession()).toBeNull();
    expect(new Headers(withIdentitySession().headers).has('x-thesis-ledger-session')).toBe(false);
  });
  it('结果未知保留费用说明，旧修订结果没有应用按钮', () => {
    const html = renderToStaticMarkup(
      <AuthoringOperation
        operation={{
          id: 'op',
          revision: 1,
          status: 'succeeded',
          disposition: 'unapplied',
          input: {
            selection: { kind: 'generate', providerId: 'local', model: 'selected' } as never,
          },
          outcome: {
            externalResult: 'unknown',
            outputText: '{}',
            errorCode: null,
            cost: { status: 'unknown', amount: null, currency: null } as never,
            usage: null,
          },
        }}
        busy={false}
        stale
        onAction={vi.fn()}
        onProposal={vi.fn()}
      />,
    );
    expect(html).toContain('费用未知');
    expect(html).toContain('结果未知');
    expect(html).toContain('新修订');
    expect(html).not.toContain('确认应用生成结果');
  });
  it('失败卡片提供中文操作说明，技术码仅在折叠诊断内', () => {
    const html = renderToStaticMarkup(
      <AuthoringOperation
        operation={{
          id: 'op',
          revision: 1,
          status: 'failed',
          disposition: 'unapplied',
          input: {
            selection: { kind: 'generate', providerId: 'local', model: 'selected' } as never,
          },
          outcome: {
            externalResult: 'unknown',
            outputText: null,
            errorCode: 'AUTHORING_RESULT_UNKNOWN',
            cost: { status: 'unknown', amount: null, currency: null } as never,
            usage: null,
          },
        }}
        busy={false}
        stale={false}
        onAction={vi.fn()}
        onProposal={vi.fn()}
      />,
    );
    expect(html).toContain('先核对原操作和费用');
    expect(html).toContain('AUTHORING_RESULT_UNKNOWN');
    expect(html).toContain('<details>');
    expect(html).not.toContain('<details open');
    const alert = html.match(/<p role="alert">([^<]+)<\/p>/)?.[1];
    expect(alert).toContain('外部执行结果无法确认');
    expect(alert).not.toContain('AUTHORING_RESULT_UNKNOWN');
  });
});
