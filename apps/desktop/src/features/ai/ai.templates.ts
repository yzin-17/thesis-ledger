import type { StartResearchInput } from './ai.types.js';

export const researchQuestionTemplates = [
  {
    id: 'primary-risks',
    label: '主要风险',
    question: '请说明当前最主要的风险，并列出支持证据、反例和数据缺口。',
  },
  {
    id: 'recent-changes',
    label: '近期变化',
    question: '请比较最近一个观察窗口与此前状态，说明发生了哪些重要变化。',
  },
  {
    id: 'counter-evidence',
    label: '反方证据',
    question: '请主动寻找不支持当前投资假设的证据，并说明假设最脆弱的部分。',
  },
  {
    id: 'stress-scenario',
    label: '情景压力',
    question: '请在明确假设下分析不利情景，并说明哪些结论无法由现有数据支持。',
  },
] as const satisfies ReadonlyArray<{
  id: NonNullable<StartResearchInput['templateId']>;
  label: string;
  question: string;
}>;
