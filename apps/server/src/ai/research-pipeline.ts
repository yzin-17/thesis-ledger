import type { AiTool, PortfolioMode, ToolPermission } from './contracts.js';
import { evidenceCitation } from './grounding.js';
import { executeToolSafely } from './tool-runtime.js';

export const buildPortfolioContext = (input: {
  symbol: string;
  quantity: number;
  marketValue: number;
  totalMarketValue: number;
  riskEvents: readonly unknown[];
}) => ({
  symbol: input.symbol,
  quantity: input.quantity,
  marketValue: input.marketValue,
  weight: input.totalMarketValue === 0 ? 0 : input.marketValue / input.totalMarketValue,
  riskEvents: [...input.riskEvents],
});

export const runResearchAgent = async (
  tools: readonly AiTool[],
  input: { symbol: string; accountId?: string; mode?: PortfolioMode },
  allowed: ReadonlySet<ToolPermission>,
) => {
  const evidence: Array<{ tool: string; data: unknown; status: string; error?: string }> = [];
  for (const tool of tools.filter((item) =>
    ['getFinancials', 'getNews', 'getAnnouncements'].includes(item.name),
  )) {
    const result = await executeToolSafely(tool, input, allowed);
    evidence.push({ tool: tool.name, ...result });
  }
  return {
    evidence,
    hypothesis: evidence.length === 0 ? '暂无足够证据' : '等待风险批评与组合上下文复核',
  };
};

export const runPortfolioAnalysis = async (
  tools: readonly AiTool[],
  input: unknown,
  allowed: ReadonlySet<ToolPermission>,
) => {
  const evidence = [];
  for (const name of ['getPortfolio', 'getPositions', 'getRisk']) {
    const tool = tools.find((item) => item.name === name);
    if (!tool) continue;
    const result = await executeToolSafely(tool, input, allowed);
    if (result.status === 'ok')
      evidence.push({
        claim: `${name} 返回确定性结果`,
        citations: [evidenceCitation(name, result.data)],
      });
  }
  return {
    conclusion: evidence.length ? '组合与风险数据已收集，等待用户复核。' : '组合数据不可用。',
    evidence,
    risks: [],
    unknowns: evidence.length ? [] : ['组合 Tool 不可用'],
    disclaimer: '仅供研究参考，不构成投资建议。',
  };
};

export const runRiskExplanation = async (
  tools: readonly AiTool[],
  input: { ruleId: string; threshold: number; triggerValue: number; symbol?: string },
  allowed: ReadonlySet<ToolPermission>,
) => {
  const tool = tools.find((item) => item.name === 'getRisk');
  const result = tool
    ? await executeToolSafely(tool, input, allowed)
    : { status: 'unavailable' as const, data: null };
  return {
    conclusion: `规则 ${input.ruleId} 在 ${input.symbol ?? '组合'} 触发：触发值 ${input.triggerValue}，阈值 ${input.threshold}。`,
    evidence: [
      {
        claim: `RiskEvent ${input.ruleId} 的触发值为 ${input.triggerValue}，阈值为 ${input.threshold}`,
        citations: [
          evidenceCitation('risk-event', {
            sourceId: input.ruleId,
            provider: 'thesis-ledger-risk',
            marketTime: new Date().toISOString(),
          }),
        ],
      },
      ...(result.status === 'ok'
        ? [
            {
              claim: 'getRisk 提供规则上下文',
              citations: [evidenceCitation('getRisk', result.data)],
            },
          ]
        : []),
    ],
    risks: [],
    unknowns: result.status === 'ok' ? [] : ['Risk 上下文 Tool 不可用'],
    disclaimer: '仅解释已触发的确定性规则，不构成交易指令。',
  };
};

export const runRiskCritic = (research: {
  evidence: ReadonlyArray<{ tool: string; data: unknown; status: string }>;
}) => ({
  objections: [
    ...(research.evidence.some((item) => item.status !== 'ok')
      ? ['存在不可用或失败的数据工具']
      : []),
    ...(research.evidence.length < 3 ? ['证据类别不足，不能形成完整结论'] : []),
    '需要核对数据时点与可用时间，避免把未来信息带入判断',
  ],
  evidence: research.evidence,
});

export const portfolioGate = (input: {
  analysis: unknown;
  hasMissingData: boolean;
  hasExecutionInstruction?: boolean;
}) => {
  if (input.hasMissingData) throw new Error('关键数据不足，研究报告拒绝生成');
  if (input.hasExecutionInstruction) throw new Error('研究报告不得生成执行指令');
  return input.analysis;
};

export const composeFinalAnalysis = (input: {
  research: { evidence: readonly unknown[]; hypothesis: string };
  critic: { objections: readonly string[] };
  context: unknown;
}) => ({
  conclusion: input.research.hypothesis,
  evidence: input.research.evidence,
  risks: [...input.critic.objections],
  context: input.context,
  disclaimer: '仅供研究参考，不构成投资建议或交易指令。',
});
