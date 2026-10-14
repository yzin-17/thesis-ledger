import {
  authoringConfirmationSchema,
  type AuthoringContent,
  type AuthoringConfirmationDraft,
} from '@thesis-ledger/schemas';

export function confirmationDraft(content: AuthoringContent): AuthoringConfirmationDraft {
  if (content.confirmationDraft) return content.confirmationDraft;
  const confirmed = content.confirmation;
  if (!confirmed)
    return {
      instrumentId: '',
      instrument: null,
      timeframe: '',
      entrySummary: '',
      exitSummary: '',
      sizingType: '',
      sizingValue: '',
      riskMode: '',
      riskPercent: '',
      riskText: '',
      executionMode: '',
      commissionRate: '',
      slippageRate: '',
      periodsAreBarsConfirmed: false,
      noExtraRiskConfirmed: false,
    };
  let sizingValue = '';
  if (confirmed.sizing.type === 'fixedAmount') sizingValue = confirmed.sizing.amount;
  else if (confirmed.sizing.type === 'fixedQuantity') sizingValue = confirmed.sizing.quantity;
  else if (confirmed.sizing.type === 'percentOfEquity') sizingValue = confirmed.sizing.percent;
  else if (confirmed.sizing.type === 'targetWeight') sizingValue = confirmed.sizing.weight;
  return {
    instrumentId: confirmed.instrumentId,
    instrument: confirmed.instrument,
    timeframe: confirmed.timeframe,
    entrySummary: confirmed.entrySummary,
    exitSummary: confirmed.exitSummary,
    sizingType: confirmed.sizing.type,
    sizingValue,
    riskMode: 'custom',
    riskPercent: '',
    riskText: JSON.stringify(confirmed.risk, null, 2),
    executionMode: confirmed.execution.mode,
    commissionRate: confirmed.cost.commissionRate,
    slippageRate: confirmed.cost.slippageRate,
    periodsAreBarsConfirmed: confirmed.periodsAreBarsConfirmed,
    noExtraRiskConfirmed: confirmed.noExtraRiskConfirmed,
  };
}
export function parseConfirmationDraft(
  draft: AuthoringConfirmationDraft,
  content: AuthoringContent,
) {
  let sizing: unknown;
  if (draft.sizingType === 'fixedAmount')
    sizing = { type: draft.sizingType, amount: draft.sizingValue };
  else if (draft.sizingType === 'fixedQuantity')
    sizing = { type: draft.sizingType, quantity: draft.sizingValue };
  else if (draft.sizingType === 'targetWeight')
    sizing = { type: draft.sizingType, weight: draft.sizingValue };
  else sizing = { type: draft.sizingType, percent: draft.sizingValue };
  let risk: unknown;
  if (draft.riskMode === 'none') risk = [];
  else if (draft.riskMode === 'fixedStop')
    risk = [{ type: 'fixedStop', percent: draft.riskPercent }];
  else if (draft.riskMode === 'custom') risk = JSON.parse(draft.riskText);
  else throw new Error('请选择风险规则');
  let execution: unknown;
  if (draft.executionMode === 'nav')
    execution = { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' };
  else if (draft.executionMode === 'exchange')
    execution = {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    };
  else throw new Error('请选择成交时机');
  const result = authoringConfirmationSchema.parse({
    instrumentId: draft.instrumentId,
    instrument: draft.instrument,
    timeframe: draft.timeframe,
    entrySummary: draft.entrySummary,
    exitSummary: draft.exitSummary,
    sizing,
    risk,
    execution,
    cost: {
      ...content.confirmation?.cost,
      commissionRate: draft.commissionRate,
      slippageRate: draft.slippageRate,
    },
    periodsAreBarsConfirmed: draft.periodsAreBarsConfirmed,
    noExtraRiskConfirmed: draft.noExtraRiskConfirmed,
  });
  if (
    result.instrument.assetType === 'fund' &&
    (result.timeframe !== '1d' || result.execution.mode !== 'nav')
  )
    throw new Error('基金仅支持日线净值及下一可用净值申购赎回');
  if (result.instrument.assetType !== 'fund' && result.execution.mode !== 'exchange')
    throw new Error('股票及 ETF 使用下一可交易开盘市价成交');
  return result;
}
