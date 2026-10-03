import {
  backtestNavPreparationRequestV3Schema,
  type BacktestNavPreparationIntentV3,
  type BacktestNavPreparationRequestV3,
} from '@thesis-ledger/schemas';

type NavPreparationIntentBase = Pick<
  BacktestNavPreparationIntentV3,
  'requestId' | 'runConfig' | 'calendarDecisionRaw'
> & {
  strategyVersionId: string;
  calendarDecisionConfirmed: boolean;
};

export type NavResearchRuleRange = { startDate: string; endDate: string };

export function domesticNavResearchDecisionRaw(input: {
  symbol: string;
  applicableRange: NavResearchRuleRange;
  runWindow: NavResearchRuleRange;
  configuredAt: string;
  decision: string;
}): string {
  const { applicableRange, runWindow } = input;
  if (
    !applicableRange.startDate ||
    !applicableRange.endDate ||
    applicableRange.startDate >= runWindow.startDate ||
    applicableRange.endDate < runWindow.endDate
  ) {
    throw new Error('国内基金研究规则必须包含运行开始前的预热日期，并覆盖整个运行区间。');
  }
  return JSON.stringify({
    schemaVersion: 'nav-research-default-v1',
    symbol: input.symbol,
    fundType: 'domestic',
    delayWorkdays: 1,
    applicableRange,
    configuredAt: input.configuredAt,
    decision: input.decision.trim(),
  });
}

export type NavPreparationIntentInput = NavPreparationIntentBase &
  (
    | {
        fundType: 'domestic';
        domesticRuleDecisionRaw: string;
        domesticRuleDecisionConfirmed: boolean;
      }
    | {
        fundType: 'qdii';
        domesticRuleDecisionRaw: null;
      }
  );

export function createNavPreparationRequest(
  input: NavPreparationIntentInput,
): BacktestNavPreparationRequestV3 {
  if (input.fundType !== 'domestic' && input.fundType !== 'qdii') {
    throw new Error('请明确选择基金类别。');
  }
  if (input.calendarDecisionConfirmed !== true) {
    throw new Error('请先确认净值研究日历决策。');
  }
  if (input.fundType === 'domestic' && input.domesticRuleDecisionConfirmed !== true) {
    throw new Error('请先确认国内基金 T+1 研究假设。');
  }

  return backtestNavPreparationRequestV3Schema.parse({
    contractVersion: 3,
    requestId: input.requestId,
    strategyVersionId: input.strategyVersionId,
    runConfig: input.runConfig,
    fundType: input.fundType,
    visibilityMode: 'research-assumption',
    freezeTimePolicy: 'after-acquisition',
    calendarDecisionRaw: input.calendarDecisionRaw,
    domesticRuleDecisionRaw: input.domesticRuleDecisionRaw,
  });
}
