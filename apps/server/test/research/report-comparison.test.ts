import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  researchReportComparisonSchema,
  type ResearchScopeSnapshotV2,
} from '@thesis-ledger/schemas';
import { compareResearchReports } from '../../src/research/research-report-comparison.js';
import { comparisonReport } from './research-comparison.fixture.js';

const compare = (before = comparisonReport(), after = comparisonReport()) =>
  compareResearchReports({
    previous: before.source,
    current: after.source,
    selection: 'explicit',
    searchStatus: 'complete',
  });
afterEach(() => vi.unstubAllGlobals());

describe('冻结研究报告的字段与资料比较', () => {
  it('临时引用编号变化不会冒充观点或内容指纹变化，保留两端证据入口', () => {
    const before = comparisonReport(),
      after = comparisonReport();
    const snapshot = JSON.stringify([before, after]);
    const fetch = vi.fn(() => {
      throw new Error('比较不得请求外部服务');
    });
    vi.stubGlobal('fetch', fetch);
    const result = compare(before, after);
    expect(result.status).toBe('compared');
    expect(result.groups.find((group) => group.key === 'opinion')?.status).toBe('unchanged');
    expect(result.groups.find((group) => group.key === 'evidence')?.status).toBe('unchanged');
    expect(result.groups.every((group) => group.status === 'unchanged')).toBe(true);
    expect(result.frozenFingerprints.before).not.toBe(result.frozenFingerprints.after);
    expect(result.evidence[0]).toMatchObject({ status: 'unchanged' });
    expect(result.evidence[0]!.before[0]!.evidenceId).not.toBe(
      result.evidence[0]!.after[0]!.evidenceId,
    );
    expect(JSON.stringify([before, after])).toBe(snapshot);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('文字变化逐字报告，输入和模型修订分别列出', () => {
    const after = comparisonReport({
      frozen: (value) => {
        value.prompt.version = 'research-v2-next';
      },
      result: (value) => {
        value.inference.conclusion += ' 新的文字。';
        value.model.modelId = 'new-model';
      },
    });
    const value = compare(comparisonReport(), after);
    const opinion = value.groups.find((group) => group.key === 'opinion')!;
    expect(opinion.fields.find((field) => field.key === 'conclusion')).toMatchObject({
      status: 'text_changed',
    });
    expect(value.groups.find((group) => group.key === 'model')?.status).toBe('changed');
    expect(value.groups.find((group) => group.key === 'conditions')?.status).toBe('unchanged');
  });

  it('指纹更替保留来源及前后引用，不把未知路由补成已知', () => {
    const after = comparisonReport({
      frozen: (value) => {
        value.evidence[0]!.audit.routeRevision = 'route-next';
      },
    });
    const value = compare(comparisonReport(), after);
    expect(value.evidence.map((entry) => entry.status).sort()).toEqual(['added', 'removed']);
    const routes = value.groups
      .find((group) => group.key === 'inputs')!
      .fields.find((field) => field.key === 'routes')!;
    expect(routes.status).toBe('value_changed');
    expect(JSON.stringify(routes.before)).not.toContain('route-next');
    expect(JSON.stringify(routes.after)).toContain('route-next');
  });

  it('Prompt 字节改变单列模型变化，不伪造资料变化', () => {
    const after = comparisonReport({
      frozen: (value) => {
        value.prompt.template += '\n受控版本变化';
      },
    });
    const value = compare(comparisonReport(), after);
    const model = value.groups.find((group) => group.key === 'model')!;
    expect(model.fields.find((field) => field.key === 'promptFingerprint')?.status).toBe(
      'value_changed',
    );
    expect(model.fields.find((field) => field.key === 'promptVersion')?.status).toBe('unchanged');
    expect(value.groups.find((group) => group.key === 'inputs')?.status).toBe('unchanged');
  });

  it('权限确认时钟更新单列包摘要，不冒充资料更新', () => {
    const after = comparisonReport({
      frozen: (value) => {
        value.scopeSnapshot.confirmedAt = new Date(
          Date.parse(value.scopeSnapshot.confirmedAt) + 1000,
        ).toISOString();
      },
    });
    const value = compare(comparisonReport(), after);
    expect(value.groups.find((group) => group.key === 'inputs')?.status).toBe('unchanged');
    expect(value.frozenFingerprints.before).not.toBe(value.frozenFingerprints.after);
  });

  it('失效条件和交易日期限分别保留前后字段', () => {
    const after = comparisonReport({
      result: (value) => {
        for (const claim of value.inference.claims) {
          if (claim.kind === 'price-direction')
            claim.tradingDays = claim.tradingDays === 5 ? 20 : 5;
        }
        for (const condition of value.inference.invalidationConditions) {
          if (condition.kind === 'price-threshold')
            condition.tradingDays = condition.tradingDays === 5 ? 20 : 5;
        }
      },
    });
    const value = compare(comparisonReport(), after);
    expect(
      value.groups
        .find((group) => group.key === 'conditions')!
        .fields.every((field) => field.status === 'value_changed'),
    ).toBe(true);
  });

});

describe('冻结比较的范围与可用性', () => {
  it.each(['mode', 'object', 'template'] as const)(
    '拒绝把不同 %s 静默当作前后版本',
    (dimension) => {
      const after = comparisonReport({
        frozen: (value) => {
          if (dimension === 'mode') {
            value.scopeSnapshot.mode = value.scopeSnapshot.mode === 'actual' ? 'shadow' : 'actual';
            value.request.mode = value.scopeSnapshot.mode;
          } else if (dimension === 'template') {
            value.request.templateId =
              value.request.templateId === 'counter-evidence'
                ? 'primary-risks'
                : 'counter-evidence';
          } else if (value.scopeSnapshot.scope === 'instrument')
            value.scopeSnapshot.instrument.symbol = '000001.SZ';
        },
      });
      const value = compare(comparisonReport(), after);
      expect(value.status).toBe('incompatible');
      expect(value.issues.map((issue) => issue.code)).toContain(dimension);
      expect(value.groups.every((group) => group.status === 'unavailable')).toBe(true);
      expect(value.evidence).toEqual([]);
    },
  );

  it('自定义问题按原问题区分，命名模板允许具体问题文字更新', () => {
    const a = comparisonReport({
      frozen: (value) => {
        delete value.request.templateId;
      },
    });
    const b = comparisonReport({
      frozen: (value) => {
        delete value.request.templateId;
        value.request.question += ' 另一个问题';
      },
    });
    expect(compare(a, b).issues.map((issue) => issue.code)).toContain('template');
    const c = comparisonReport({
      frozen: (value) => {
        value.request.templateId = 'primary-risks';
      },
    });
    const d = comparisonReport({
      frozen: (value) => {
        value.request.templateId = 'primary-risks';
        value.request.question += ' 另一日';
      },
    });
    expect(compare(c, d).status).toBe('compared');
  });

  it('组合账户集合变化不可比，账户顺序不改变范围，持仓变化归入输入', () => {
    const first = '20000000-0000-4000-8000-000000000001';
    const second = '20000000-0000-4000-8000-000000000002';
    const portfolio = (accountIds: string[], holdings = true) =>
      comparisonReport({
        frozen: (value) => {
          const instrument =
            value.scopeSnapshot.scope === 'instrument' ? value.scopeSnapshot.instrument : null;
          value.request.scope = { scope: 'portfolio', portfolioId: 'all' };
          value.scopeSnapshot = {
            version: 'research-scope-v2',
            mode: value.request.mode,
            confirmedAt: value.scopeSnapshot.confirmedAt,
            scope: 'portfolio',
            portfolioId: 'all',
            accountIds,
            instruments: instrument ? [instrument] : [],
          } as ResearchScopeSnapshotV2;
          if (!holdings && value.scopeSnapshot.scope === 'portfolio')
            value.scopeSnapshot.instruments = [];
        },
        result: (value) => {
          value.inference.claims = [];
          value.inference.invalidationConditions = [];
          value.inference.nextSteps = [];
        },
      });
    expect(compare(portfolio([first, second]), portfolio([second, first])).status).toBe('compared');
    expect(
      compare(portfolio([first]), portfolio([second])).issues.map((issue) => issue.code),
    ).toContain('accounts');
    const changed = compare(portfolio([first]), portfolio([first], false));
    expect(changed.status).toBe('compared');
    expect(changed.groups.find((group) => group.key === 'inputs')?.status).toBe('changed');
  });

  it('旧 V1 缺少范围时不推断可比性', () => {
    const before = comparisonReport();
    const legacy = {
      ...before.source,
      frozen: null,
      detail: {
        ...before.source.detail,
        resultVersion: 1 as const,
        result: null,
        submission: null,
        availability: 'missing' as const,
        historicalScope: {
          status: 'unrecorded' as const,
          snapshot: null,
          label: '历史范围未记录' as const,
        },
      },
    };
    const value = compareResearchReports({
      current: comparisonReport().source,
      previous: legacy,
      selection: 'explicit',
      searchStatus: 'complete',
    });
    expect(value.status).toBe('unavailable');
    expect(value.issues[0]?.code).toBe('legacy_fields_missing');
  });

  it.each(['complete', 'truncated', 'completion_unrecorded'] as const)(
    '保留前序查找状态 %s',
    (searchStatus) => {
      const value = compareResearchReports({
        current: comparisonReport().source,
        previous: null,
        selection: 'default',
        searchStatus,
      });
      const expected = {
        complete: 'no_previous',
        truncated: 'search_incomplete',
        completion_unrecorded: 'unavailable',
      };
      expect(value.status).toBe(expected[searchStatus]);
      expect(researchReportComparisonSchema.safeParse(value).success).toBe(true);
    },
  );
});
