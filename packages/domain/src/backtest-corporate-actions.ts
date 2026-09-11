import { DecimalValue } from './decimal.js';
import type {
  SimulationLedger,
  SimulationExecutionInstrument,
  SimulationLedgerEvent,
  LedgerMutationResult,
} from './simulation-ledger.js';
import type { BacktestAssetType, BacktestCurrency } from './backtest-v2.js';

/** Runtime shape kept identical to schemas' corporateActionFactSchema. */
export interface BacktestCorporateActionFact {
  symbol: string;
  market: 'CN' | 'HK' | 'US';
  instrumentType: 'STOCK' | 'ETF' | 'NAV_FUND';
  type: 'CASH_DIVIDEND' | 'SPLIT' | 'REVERSE_SPLIT';
  ratio?: string;
  cashAmount?: string;
  currency?: BacktestCurrency;
  occurredAt: string;
  availableAt: string;
  provider: string;
  providerRevision: string;
}

export type CorporateActionRejectCode =
  | 'DUPLICATE_EVENT'
  | 'FUTURE_DATA'
  | 'INVALID_TIME'
  | 'INVALID_AMOUNT'
  | 'INSTRUMENT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'UNSUPPORTED_CORPORATE_ACTION'
  | 'RULE_REJECTED';

export interface CorporateActionMutation {
  eventId: string;
  fact: BacktestCorporateActionFact;
  ledgerEvent: SimulationLedgerEvent;
}

export interface CorporateActionApplied {
  applied: true;
  published: true;
  eventId: string;
  mutation: CorporateActionMutation;
  ledger: LedgerMutationResult;
}

export interface CorporateActionRejected {
  applied: false;
  published: false;
  eventId: string;
  code: CorporateActionRejectCode;
  reason: string;
}

export type CorporateActionResult = CorporateActionApplied | CorporateActionRejected;

export interface CorporateActionPort {
  apply: (fact: BacktestCorporateActionFact, evaluationAt: string) => CorporateActionResult;
}

const assetTypeFor = (
  instrumentType: BacktestCorporateActionFact['instrumentType'],
): BacktestAssetType => {
  if (instrumentType === 'STOCK') return 'stock';
  if (instrumentType === 'ETF') return 'etf';
  return 'fund';
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
};

/** The fact identity, not array position, is the retry/deduplication key. */
export const corporateActionEventId = (fact: BacktestCorporateActionFact, runId: string) =>
  `corporate-action:${runId}:${stableSerialize({
    symbol: fact.symbol,
    market: fact.market,
    instrumentType: fact.instrumentType,
    type: fact.type,
    ratio: fact.ratio,
    cashAmount: fact.cashAmount,
    currency: fact.currency,
    occurredAt: fact.occurredAt,
    availableAt: fact.availableAt,
    provider: fact.provider,
    providerRevision: fact.providerRevision,
  })}`;

const parseTime = (value: string) => Date.parse(value);

const reject = (
  eventId: string,
  code: CorporateActionRejectCode,
  reason: string,
): CorporateActionRejected => ({ applied: false, published: false, eventId, code, reason });

const identityMatches = (
  fact: BacktestCorporateActionFact,
  instrument: SimulationExecutionInstrument,
) =>
  fact.symbol === instrument.symbol &&
  fact.market === instrument.market &&
  assetTypeFor(fact.instrumentType) === instrument.assetType;

const validateTimes = (
  fact: BacktestCorporateActionFact,
  evaluationAt: string,
  runId: string,
): CorporateActionRejected | undefined => {
  const occurredAt = parseTime(fact.occurredAt);
  const availableAt = parseTime(fact.availableAt);
  const evaluation = parseTime(evaluationAt);
  const eventId = corporateActionEventId(fact, runId);
  if (![occurredAt, availableAt, evaluation].every(Number.isFinite)) {
    return reject(eventId, 'INVALID_TIME', '公司行动时间无效');
  }
  if (availableAt > evaluation || occurredAt > evaluation) {
    return reject(eventId, 'FUTURE_DATA', '公司行动 fact 尚未达到 evaluationAt');
  }
  return undefined;
};

const toLedgerEvent = (
  fact: BacktestCorporateActionFact,
  instrument: SimulationExecutionInstrument,
  runId: string,
): { eventId: string; ledgerEvent: SimulationLedgerEvent } | CorporateActionRejected => {
  const eventId = corporateActionEventId(fact, runId);
  if (!identityMatches(fact, instrument)) {
    return reject(eventId, 'INSTRUMENT_MISMATCH', '公司行动 fact 身份不是唯一执行标的');
  }
  if (!fact.provider || !fact.providerRevision) {
    return reject(eventId, 'RULE_REJECTED', '公司行动 fact 必须包含 provider 和 revision');
  }
  if (fact.instrumentType === 'NAV_FUND') {
    return reject(eventId, 'UNSUPPORTED_CORPORATE_ACTION', 'NAV Fund 不支持该公司行动执行路径');
  }
  try {
    if (fact.type === 'CASH_DIVIDEND') {
      if (fact.cashAmount === undefined || fact.currency === undefined) {
        return reject(eventId, 'RULE_REJECTED', '现金分红必须包含 cashAmount 和 currency');
      }
      if (fact.ratio !== undefined) {
        return reject(eventId, 'RULE_REJECTED', '现金分红不接受 ratio');
      }
      const amount = DecimalValue.from(fact.cashAmount);
      if (amount.isNegative()) return reject(eventId, 'INVALID_AMOUNT', '现金分红金额不能为负数');
      if (fact.currency !== instrument.currency) {
        return reject(eventId, 'CURRENCY_MISMATCH', '现金分红币种必须与执行标的一致');
      }
      return {
        eventId,
        ledgerEvent: {
          type: 'cashDividend',
          payload: {
            eventId,
            executionSymbol: instrument.symbol,
            amountPerShare: amount.toString(),
            currency: fact.currency,
            occurredAt: fact.occurredAt,
            availableAt: fact.availableAt,
          },
        },
      };
    }
    if (fact.type !== 'SPLIT' && fact.type !== 'REVERSE_SPLIT') {
      return reject(eventId, 'UNSUPPORTED_CORPORATE_ACTION', '不支持的公司行动类型');
    }
    if (fact.ratio === undefined) {
      return reject(eventId, 'RULE_REJECTED', '拆并股必须包含 ratio');
    }
    if (fact.cashAmount !== undefined || fact.currency !== undefined) {
      return reject(eventId, 'RULE_REJECTED', '拆并股不接受 cashAmount 或 currency');
    }
    const sourceRatio = DecimalValue.from(fact.ratio);
    if (!sourceRatio.isPositive())
      return reject(eventId, 'INVALID_AMOUNT', '拆并股 ratio 必须为正数');
    // T2/T4 ratio is always the post-action share count divided by the
    // pre-action share count. A reverse split therefore supplies 0.5 for
    // a 1-for-2 action, matching both adjusted-series and ledger semantics.
    const multiplier = sourceRatio;
    return {
      eventId,
      ledgerEvent: {
        type: 'split',
        payload: {
          eventId,
          executionSymbol: instrument.symbol,
          ratio: multiplier.toString(),
          occurredAt: fact.occurredAt,
          availableAt: fact.availableAt,
        },
      },
    };
  } catch {
    return reject(eventId, 'INVALID_AMOUNT', '公司行动金额或 ratio 不是规范十进制值');
  }
};

export const createCorporateActionPort = (
  ledger: SimulationLedger,
  executionInstrument: SimulationExecutionInstrument,
  runId: string,
): CorporateActionPort => {
  const applied = new Set<string>();
  return {
    apply(fact, evaluationAt) {
      const eventId = corporateActionEventId(fact, runId);
      if (applied.has(eventId)) return reject(eventId, 'DUPLICATE_EVENT', '公司行动已应用');
      const timeIssue = validateTimes(fact, evaluationAt, runId);
      if (timeIssue) return timeIssue;
      const mutation = toLedgerEvent(fact, executionInstrument, runId);
      if ('applied' in mutation) return mutation;
      const ledgerResult = ledger.applyEvent(mutation.ledgerEvent, evaluationAt);
      if (!ledgerResult.applied) {
        let code: CorporateActionRejectCode = 'RULE_REJECTED';
        if (ledgerResult.code === 'DUPLICATE_EVENT') code = 'DUPLICATE_EVENT';
        else if (ledgerResult.code === 'FUTURE_DATA') code = 'FUTURE_DATA';
        else if (
          ledgerResult.code === 'INVALID_TIME' ||
          ledgerResult.code === 'INVALID_AMOUNT' ||
          ledgerResult.code === 'INSTRUMENT_MISMATCH' ||
          ledgerResult.code === 'CURRENCY_MISMATCH'
        ) {
          code = ledgerResult.code;
        }
        return reject(eventId, code, ledgerResult.reason);
      }
      applied.add(eventId);
      return {
        applied: true,
        published: true,
        eventId,
        mutation: { eventId, fact, ledgerEvent: mutation.ledgerEvent },
        ledger: ledgerResult,
      };
    },
  };
};
