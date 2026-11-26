// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { journalAiExplanationSchema, researchResultV2Schema } from '@thesis-ledger/schemas';
import { button, click, mount, setApi, view } from './mobile-view-harness';
import { JournalAiPanel } from '../../src/features/journal-ai/JournalAiPanel';
import { JournalEvidenceScreen } from '../../src/features/journal-ai/JournalEvidenceScreen';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));
const sample = JSON.parse(
  readFileSync(
    new NodeURL('../../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
    'utf8',
  ),
) as { result: unknown };
const result = researchResultV2Schema.parse(sample.result);
const binding = result.evidenceBindings[0]!;
const accountId = '00000000-0000-4000-8000-000000000010';
const runId = '00000000-0000-4000-8000-000000000011';
const run = journalAiExplanationSchema.parse({
  id: runId,
  accountId,
  mode: 'shadow',
  reviewObjectId: 'TRADE_CYCLE:controlled',
  evidenceFingerprint: 'controlled',
  analysisDraft: null,
  provider: 'controlled',
  model: 'fixture',
  promptVersion: 'v2',
  status: 'succeeded',
  errorCode: null,
  errorSummary: null,
  algorithmVersion: 'fixture',
  result,
  createdAt: result.createdAt,
});
const readRun = () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation((url, init) => {
    expect(init?.method ?? 'GET').toBe('GET');
    expect(new URL(String(url)).pathname).toBe('/api/v1/journal/explanations/' + runId);
    return Promise.resolve(Response.json(run));
  });
  setApi(fetcher);
  return fetcher;
};
beforeEach(() => {
  view.params = {
    accountId,
    mode: 'shadow',
    kind: 'object',
    runId,
    toolCallId: binding.toolCallId,
  };
});

describe('手机复盘解读版本与冻结引用', () => {
  it('V2 展示真实推断和材料，引用定位使用绑定的调用身份', async () => {
    const fetcher = readRun();
    await mount(
      <JournalAiPanel accountId={accountId} mode="shadow" kind="object" existingRunId={runId} />,
    );
    expect(document.body.textContent).toContain(result.inference.conclusion);
    expect(document.body.textContent).toContain(result.inference.claims[0]!.description);
    expect(document.body.textContent).toContain(result.inference.disclaimer);
    await click(button('查看引用 ' + binding.audit.evidenceId));
    expect(view.navigate).toHaveBeenCalledWith(
      'JournalEvidence',
      expect.objectContaining({ accountId, mode: 'shadow', runId, toolCallId: binding.toolCallId }),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('V2 只显示当前任务已绑定的冻结事实，不把抓取时间伪装为观察时间', async () => {
    const fetcher = readRun();
    await mount(<JournalEvidenceScreen />);
    expect(document.body.textContent).toContain(binding.audit.fingerprint);
    expect(document.body.textContent).toContain(binding.audit.sourceIds.join('、'));
    expect(document.body.textContent).toContain('发布 未记录');
    expect(document.body.textContent).toContain('可见 ' + binding.audit.availableAt);
    expect(document.body.textContent).not.toContain('观察 ');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('V2 不存在的引用保持空状态，不读取其他工具审计', async () => {
    view.params.toolCallId = accountId;
    const fetcher = readRun();
    await mount(<JournalEvidenceScreen />);
    expect(document.body.textContent).toContain('本任务没有该调用的引用');
    expect(document.body.textContent).not.toContain(binding.audit.fingerprint);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('拒绝已退役的非具名复盘解读结果，不展示其中正文或引用', async () => {
    const legacy = {
      ...run,
      result: {
        version: 1,
        provider: 'legacy',
        conclusion: '历史复盘结论',
        createdAt: run.createdAt,
        evidence: [
          {
            claim: '历史依据',
            citations: [
              {
                tool: 'read_journal',
                sourceId: 'legacy-source',
                provider: 'legacy',
                observedAt: run.createdAt,
                toolCallId: binding.toolCallId,
              },
            ],
          },
        ],
        risks: ['历史风险'],
        unknowns: ['历史未知'],
        disclaimer: '历史说明',
        signals: [],
      },
    };
    setApi(vi.fn<typeof fetch>().mockResolvedValue(Response.json(legacy)));
    await mount(
      <JournalAiPanel accountId={accountId} mode="shadow" kind="object" existingRunId={runId} />,
    );
    expect(document.body.textContent).toContain('ThesisLedger API 响应契约不匹配');
    expect(document.body.textContent).not.toContain('历史复盘结论');
    expect(document.body.textContent).not.toContain('历史风险');
    expect(view.navigate).not.toHaveBeenCalled();
  });
});
