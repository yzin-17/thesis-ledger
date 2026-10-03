import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { BacktestExecutionModelV3 } from '@thesis-ledger/schemas';
import {
  createNavPreparationRequest,
  domesticNavResearchDecisionRaw,
  type NavResearchRuleRange,
  type NavPreparationIntentInput,
} from './strategy.nav.intent.js';
import {
  useCreateNavBacktestMutation,
  usePrepareNavBacktestMutation,
} from './strategy.nav.queries.js';
import {
  findStrategyVersion,
  navFundSymbolForStrategyVersion,
  strategyCenterPath,
} from './strategy-center.navigation.js';
import { strategyVersionSummary } from './strategy-version-summary.model.js';
import type { StrategyRecord } from './strategy.types.js';
import {
  errorText,
  ExecutionModelCard,
  InvalidNavStrategy,
  LoadingStrategyVersion,
  MissingStrategyVersion,
  NavSetupActions,
  NavSetupFeedback,
  NavSetupHeader,
  PreparedNavReview,
  ResearchDecisionCard,
  ResearchVisibilityNotice,
  RunScopeCard,
  type FundType,
} from './NavBacktestSetupSections.js';

type PreparationBase = Pick<
  NavPreparationIntentInput,
  | 'requestId'
  | 'strategyVersionId'
  | 'runConfig'
  | 'calendarDecisionRaw'
  | 'calendarDecisionConfirmed'
>;

const valuationPolicy = {
  baseTimezone: 'Asia/Shanghai',
  dailyValuationTime: '16:00',
  pricePolicy: 'latestAvailable',
  fxPolicy: 'latestAvailable',
} as const;

export function NavBacktestSetupPage({
  strategies,
  strategiesLoading,
}: {
  strategies: StrategyRecord[];
  strategiesLoading: boolean;
}) {
  const { strategyId, versionId } = useParams();
  const navigate = useNavigate();
  const selection = findStrategyVersion(strategies, strategyId, versionId);
  const version = selection?.version ?? null;
  const symbol = version ? navFundSymbolForStrategyVersion(version) : null;
  const setup = useNavBacktestSetupState({ versionId: version?.id ?? null, symbol, navigate });

  if (strategiesLoading) return <LoadingStrategyVersion />;
  if (!selection) return <MissingStrategyVersion />;
  if (!symbol || strategyVersionSummary(selection.version).kind !== 'ready') {
    return <InvalidNavStrategy selection={selection} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <NavSetupHeader selection={selection} symbol={symbol} />
      <ResearchVisibilityNotice />
      <RunScopeCard
        fundType={setup.fundType}
        startDate={setup.startDate}
        endDate={setup.endDate}
        initialCash={setup.initialCash}
        onFundTypeChange={setup.changeFundType}
        onStartDateChange={setup.changeStartDate}
        onEndDateChange={setup.changeEndDate}
        onInitialCashChange={setup.changeInitialCash}
      />
      <ResearchDecisionCard
        fundType={setup.fundType}
        calendarDecision={setup.calendarDecision}
        calendarDecisionConfirmed={setup.calendarDecisionConfirmed}
        domesticRuleDecision={setup.domesticRuleDecision}
        domesticRuleDecisionConfirmed={setup.domesticRuleDecisionConfirmed}
        domesticRuleRange={setup.domesticRuleRange}
        onCalendarDecisionChange={setup.changeCalendarDecision}
        onCalendarDecisionConfirmation={setup.changeCalendarDecisionConfirmation}
        onDomesticRuleDecisionChange={setup.changeDomesticRuleDecision}
        onDomesticRuleDecisionConfirmation={setup.changeDomesticRuleDecisionConfirmation}
        onDomesticRuleRangeChange={setup.changeDomesticRuleRange}
      />
      <ExecutionModelCard
        text={setup.modelText}
        symbol={symbol}
        startDate={setup.startDate}
        endDate={setup.endDate}
        confirmed={Boolean(setup.model)}
        onChange={setup.changeModelText}
        onConfirm={setup.confirmModel}
      />
      <NavSetupActions
        canPrepare={setup.canPrepare}
        preparing={setup.prepareMutation.isPending}
        canCreate={Boolean(
          setup.prepared && setup.receipt && !setup.receiptExpired && setup.reviewed,
        )}
        creating={setup.createMutation.isPending}
        onPrepare={() => void setup.prepare()}
        onCreate={() => void setup.createRun()}
      />
      <NavSetupFeedback
        formError={setup.formError}
        prepareError={setup.prepareMutation.error}
        createError={setup.createMutation.error}
        blocked={setup.blocked}
      />
      {setup.prepared ? (
        <PreparedNavReview
          prepared={setup.prepared}
          receiptExpired={setup.receiptExpired}
          reviewed={setup.reviewed}
          onReviewedChange={setup.changeReview}
        />
      ) : null}
    </div>
  );
}

function useNavBacktestSetupState({
  versionId,
  symbol,
  navigate,
}: {
  versionId: string | null;
  symbol: string | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const prepareMutation = usePrepareNavBacktestMutation();
  const createMutation = useCreateNavBacktestMutation();
  const [fundType, setFundType] = useState<FundType | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [initialCash, setInitialCash] = useState('');
  const [calendarDecision, setCalendarDecision] = useState('');
  const [calendarDecisionConfirmed, setCalendarDecisionConfirmed] = useState(false);
  const [domesticRuleDecision, setDomesticRuleDecision] = useState('');
  const [domesticRuleRange, setDomesticRuleRange] = useState<NavResearchRuleRange>({
    startDate: '',
    endDate: '',
  });
  const [domesticRuleDecisionConfirmed, setDomesticRuleDecisionConfirmed] = useState(false);
  const [modelText, setModelText] = useState('');
  const [confirmedModel, setConfirmedModel] = useState<BacktestExecutionModelV3 | null>(null);
  const [modelConfirmationKey, setModelConfirmationKey] = useState('');
  const [preparedForKey, setPreparedForKey] = useState<string | null>(null);
  const [reviewedForKey, setReviewedForKey] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const modelKey = JSON.stringify({ symbol, startDate, endDate, modelText });
  const model = modelConfirmationKey === modelKey ? confirmedModel : null;
  const setupKey = JSON.stringify({
    symbol,
    versionId,
    fundType,
    startDate,
    endDate,
    initialCash,
    calendarDecision,
    calendarDecisionConfirmed,
    domesticRuleDecision,
    domesticRuleDecisionConfirmed,
    domesticRuleRange,
    model,
  });
  const currentPreparation = preparedForKey === setupKey ? prepareMutation.data : undefined;
  const prepared = currentPreparation?.status === 'prepared' ? currentPreparation : null;
  const blocked = currentPreparation?.status === 'blocked' ? currentPreparation : null;
  const receipt = prepared?.receipt;
  const receiptExpired = receipt ? Date.parse(receipt.expiresAt) <= Date.now() : false;
  const reviewed = reviewedForKey === setupKey;
  const canPrepare = Boolean(
    symbol &&
    versionId &&
    fundType &&
    startDate &&
    endDate &&
    initialCash.trim() &&
    calendarDecision.trim() &&
    calendarDecisionConfirmed &&
    model &&
    (fundType !== 'domestic' ||
      (domesticRuleDecision.trim() &&
        domesticRuleDecisionConfirmed &&
        domesticRuleRange.startDate &&
        domesticRuleRange.endDate)),
  );

  const invalidatePreparation = () => {
    setPreparedForKey(null);
    setReviewedForKey(null);
    setFormError(null);
    prepareMutation.reset();
    createMutation.reset();
  };
  const changeFundType = (values: string[]) => {
    const value = values[0];
    invalidatePreparation();
    setFundType(value === 'domestic' || value === 'qdii' ? value : null);
    setDomesticRuleDecisionConfirmed(false);
  };
  const update = <T,>(setter: (value: T) => void, value: T) => {
    invalidatePreparation();
    setter(value);
  };
  const prepare = async () => {
    if (!symbol || !versionId || !fundType || !model) return;
    const validationError = validatePreparationInput({
      fundType,
      startDate,
      endDate,
      initialCash,
      calendarDecision,
      calendarDecisionConfirmed,
      domesticRuleDecision,
      domesticRuleDecisionConfirmed,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setReviewedForKey(null);
    setPreparedForKey(setupKey);
    prepareMutation.reset();
    createMutation.reset();
    try {
      await prepareMutation.mutateAsync(
        createNavPreparationRequest(
          buildNavPreparationIntent({
            versionId,
            symbol,
            fundType,
            startDate,
            endDate,
            initialCash,
            calendarDecision,
            domesticRuleDecision,
            domesticRuleRange,
            model,
          }),
        ),
      );
    } catch (error) {
      setFormError(errorText(error, 'NAV 配置准备失败，请检查输入后重试。'));
    }
  };
  const createRun = async () => {
    if (!prepared || !receipt || receiptExpired || !reviewed) {
      setFormError('请确认当前准备结果，并在凭证有效期内创建 NAV 运行。');
      return;
    }
    setFormError(null);
    try {
      const run = await createMutation.mutateAsync({
        contractVersion: 3,
        preparationId: receipt.preparationId,
        preparationHash: receipt.preparationHash,
        idempotencyKey: `nav-${receipt.preparationId}`,
      });
      void navigate(strategyCenterPath.navBacktestRun(run.id));
    } catch (error) {
      setFormError(errorText(error, 'NAV 运行创建失败，请重试。'));
    }
  };

  return {
    fundType,
    startDate,
    endDate,
    initialCash,
    calendarDecision,
    calendarDecisionConfirmed,
    domesticRuleDecision,
    domesticRuleDecisionConfirmed,
    domesticRuleRange,
    modelText,
    model,
    prepared,
    blocked,
    receipt,
    receiptExpired,
    reviewed,
    canPrepare,
    formError,
    prepareMutation,
    createMutation,
    prepare,
    createRun,
    changeFundType,
    changeStartDate: (value: string) => update(setStartDate, value),
    changeEndDate: (value: string) => update(setEndDate, value),
    changeInitialCash: (value: string) => update(setInitialCash, value),
    changeCalendarDecision: (value: string) => update(setCalendarDecision, value),
    changeCalendarDecisionConfirmation: (value: boolean) =>
      update(setCalendarDecisionConfirmed, value),
    changeDomesticRuleDecision: (value: string) => update(setDomesticRuleDecision, value),
    changeDomesticRuleDecisionConfirmation: (value: boolean) =>
      update(setDomesticRuleDecisionConfirmed, value),
    changeDomesticRuleRange: (value: NavResearchRuleRange) => update(setDomesticRuleRange, value),
    changeModelText: (value: string) => update(setModelText, value),
    confirmModel: (value: BacktestExecutionModelV3) => {
      invalidatePreparation();
      setConfirmedModel(value);
      setModelConfirmationKey(modelKey);
    },
    changeReview: (checked: boolean) => setReviewedForKey(checked ? setupKey : null),
  };
}

function validatePreparationInput(input: {
  fundType: FundType;
  startDate: string;
  endDate: string;
  initialCash: string;
  calendarDecision: string;
  calendarDecisionConfirmed: boolean;
  domesticRuleDecision: string;
  domesticRuleDecisionConfirmed: boolean;
}) {
  if (input.startDate > input.endDate) return '回测开始日期不能晚于结束日期。';
  const capital = Number(input.initialCash);
  if (!Number.isFinite(capital) || capital <= 0) return '初始资金必须是大于零的 CNY 金额。';
  if (!input.calendarDecision.trim() || !input.calendarDecisionConfirmed) {
    return '请填写并确认净值日历与日期研究决策。';
  }
  if (
    input.fundType === 'domestic' &&
    (!input.domesticRuleDecision.trim() || !input.domesticRuleDecisionConfirmed)
  ) {
    return '请填写并确认国内基金 T+1 研究假设。';
  }
  return null;
}

function buildNavPreparationIntent(input: {
  versionId: string;
  symbol: string;
  fundType: FundType;
  startDate: string;
  endDate: string;
  initialCash: string;
  calendarDecision: string;
  domesticRuleDecision: string;
  model: BacktestExecutionModelV3;
  domesticRuleRange: NavResearchRuleRange;
}): NavPreparationIntentInput {
  const configuredAt = new Date().toISOString();
  const base: PreparationBase = {
    requestId: crypto.randomUUID(),
    strategyVersionId: input.versionId,
    runConfig: {
      schemaVersion: '3',
      startDate: input.startDate,
      endDate: input.endDate,
      baseCurrency: 'CNY',
      initialCash: { CNY: input.initialCash.trim() },
      valuationPolicy,
      executionModel: input.model,
      navInput: { kind: 'nav', symbol: input.symbol },
    },
    calendarDecisionRaw: JSON.stringify({
      schemaVersion: 'nav-research-calendar-decision-v1',
      symbol: input.symbol,
      basis: 'nav-dates-xshg-intersection-v1',
      configuredAt,
      decision: input.calendarDecision.trim(),
    }),
    calendarDecisionConfirmed: true,
  };
  if (input.fundType === 'domestic') {
    return {
      ...base,
      fundType: input.fundType,
      domesticRuleDecisionRaw: domesticNavResearchDecisionRaw({
        symbol: input.symbol,
        applicableRange: input.domesticRuleRange,
        runWindow: { startDate: input.startDate, endDate: input.endDate },
        configuredAt,
        decision: input.domesticRuleDecision.trim(),
      }),
      domesticRuleDecisionConfirmed: true,
    };
  }
  return { ...base, fundType: input.fundType, domesticRuleDecisionRaw: null };
}
