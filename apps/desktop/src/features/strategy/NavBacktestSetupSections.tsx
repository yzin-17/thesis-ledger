import type {
  BacktestExecutionModelV3,
  BacktestNavPreparationResultV3,
} from '@thesis-ledger/schemas';
import { Link } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/ui/date-input';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDateTime } from '@/lib/date-display';
import { NavBacktestModel } from './NavBacktestModel.js';
import { strategyCenterPath } from './strategy-center.navigation.js';
import type { findStrategyVersion } from './strategy-center.navigation.js';
import type { NavResearchRuleRange } from './strategy.nav.intent.js';

export type FundType = 'domestic' | 'qdii';

export function LoadingStrategyVersion() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-6" aria-label="正在读取基金策略版本">
      <p className="font-medium">正在读取基金策略版本…</p>
    </div>
  );
}

export function MissingStrategyVersion() {
  return (
    <Alert variant="destructive">
      <AlertTitle>无法定位基金策略版本</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>请从明确的策略版本重新进入基金净值回测。</p>
        <Button
          nativeButton={false}
          render={<Link to={strategyCenterPath.library}>返回策略库</Link>}
          variant="outline"
        />
      </AlertDescription>
    </Alert>
  );
}

export function InvalidNavStrategy({
  selection,
}: {
  selection: NonNullable<ReturnType<typeof findStrategyVersion>>;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>当前版本不满足基金净值回测条件</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>仅支持定义完整的 CN 基金 NAV 策略，且执行标的必须是明确的六位基金代码。</p>
        <Button
          nativeButton={false}
          render={
            <Link
              to={strategyCenterPath.strategyVersion(selection.strategy.id, selection.version.id)}
            >
              返回策略版本
            </Link>
          }
          variant="outline"
        />
      </AlertDescription>
    </Alert>
  );
}

export function NavSetupHeader({
  selection,
  symbol,
}: {
  selection: NonNullable<ReturnType<typeof findStrategyVersion>>;
  symbol: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">基金净值回测</h2>
        <p className="text-sm text-muted-foreground">
          {selection.strategy.name} · v{selection.version.version} · {symbol}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<Link to={strategyCenterPath.navBacktestJobs}>NAV 任务历史</Link>}
          variant="outline"
        />
        <Button
          nativeButton={false}
          render={
            <Link
              to={strategyCenterPath.strategyVersion(selection.strategy.id, selection.version.id)}
            >
              返回策略版本
            </Link>
          }
          variant="outline"
        />
      </div>
    </div>
  );
}

export function ResearchVisibilityNotice() {
  return (
    <Alert>
      <AlertTitle>研究假设可见性</AlertTitle>
      <AlertDescription>
        本次按研究假设确定净值可见时间，并按净值估值日与上交所交易日历交集处理日期。结果不代表严格历史时点；创建运行前请核对适用的数据来源和规则依据。
      </AlertDescription>
    </Alert>
  );
}

export function RunScopeCard({
  fundType,
  startDate,
  endDate,
  initialCash,
  onFundTypeChange,
  onStartDateChange,
  onEndDateChange,
  onInitialCashChange,
}: {
  fundType: FundType | null;
  startDate: string;
  endDate: string;
  initialCash: string;
  onFundTypeChange: (values: string[]) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onInitialCashChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>运行范围与基金类别</CardTitle>
        <CardDescription>
          基金类别不会根据代码或策略内容自动推断。日期和初始资金由本次运行明确给出。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel>基金类别</FieldLabel>
          <ToggleGroup
            value={fundType ? [fundType] : []}
            aria-label="选择基金类别"
            onValueChange={onFundTypeChange}
          >
            <ToggleGroupItem value="domestic">国内基金</ToggleGroupItem>
            <ToggleGroupItem value="qdii">QDII 基金</ToggleGroupItem>
          </ToggleGroup>
          {fundType === 'domestic' ? (
            <FieldDescription>
              本次采用明确确认的国内基金 T+1 净值披露研究假设；准备后可核对规则范围与证据。
            </FieldDescription>
          ) : null}
          {fundType === 'qdii' ? (
            <FieldDescription>
              净值披露可见性依据本基金已核验文档；申赎确认、份额和资金时序仍由你明确配置，并在准备后核对两者。
            </FieldDescription>
          ) : null}
        </Field>
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel>开始日期</FieldLabel>
            <DateInput
              aria-label="开始日期"
              type="date"
              required
              value={startDate}
              onChange={(event) => onStartDateChange(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>结束日期</FieldLabel>
            <DateInput
              aria-label="结束日期"
              type="date"
              required
              value={endDate}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>初始资金（CNY）</FieldLabel>
            <Input
              aria-label="初始资金（CNY）"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={initialCash}
              onChange={(event) => onInitialCashChange(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          权益估值口径：CNY、Asia/Shanghai、每日 16:00；采用本次固定输入中的最新可用净值。
        </div>
      </CardContent>
    </Card>
  );
}

export function ResearchDecisionCard({
  fundType,
  calendarDecision,
  calendarDecisionConfirmed,
  domesticRuleDecision,
  domesticRuleDecisionConfirmed,
  domesticRuleRange,
  onCalendarDecisionChange,
  onCalendarDecisionConfirmation,
  onDomesticRuleDecisionChange,
  onDomesticRuleDecisionConfirmation,
  onDomesticRuleRangeChange,
}: {
  fundType: FundType | null;
  calendarDecision: string;
  calendarDecisionConfirmed: boolean;
  domesticRuleDecision: string;
  domesticRuleDecisionConfirmed: boolean;
  domesticRuleRange: NavResearchRuleRange;
  onCalendarDecisionChange: (value: string) => void;
  onCalendarDecisionConfirmation: (value: boolean) => void;
  onDomesticRuleDecisionChange: (value: string) => void;
  onDomesticRuleDecisionConfirmation: (value: boolean) => void;
  onDomesticRuleRangeChange: (value: NavResearchRuleRange) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>净值日历与日期决策</CardTitle>
        <CardDescription>
          本次计划按净值估值日与上交所交易日历取交集。请说明对所选日期区间的研究判断并明确确认。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel>日期决策说明</FieldLabel>
          <Textarea
            aria-label="日期决策说明"
            value={calendarDecision}
            onChange={(event) => onCalendarDecisionChange(event.target.value)}
            placeholder="填写本次净值日历和日期区间的研究决策。"
          />
        </Field>
        <ConfirmationField
          id="nav-calendar-confirmation"
          checked={calendarDecisionConfirmed}
          onCheckedChange={onCalendarDecisionConfirmation}
        >
          我确认以上日期决策和运行区间，并理解本次采用研究假设可见性，不声明严格历史时点。
        </ConfirmationField>
        {fundType === 'domestic' ? (
          <div className="flex flex-col gap-4 rounded-md border p-4">
            <div>
              <p className="font-medium">国内基金 T+1 研究假设</p>
              <p className="mt-1 text-sm text-muted-foreground">
                该研究规则按 1
                个工作日延迟披露净值。申赎确认、费用、份额和现金时序由执行模型独立声明。
              </p>
            </div>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>研究规则开始日期（含预热）</FieldLabel>
                <DateInput
                  type="date"
                  aria-label="研究规则开始日期（含预热）"
                  value={domesticRuleRange.startDate}
                  onChange={(event) =>
                    onDomesticRuleRangeChange({
                      ...domesticRuleRange,
                      startDate: event.target.value,
                    })
                  }
                />
                <FieldDescription>
                  明确包含策略所需的运行前净值日期；准备时会核验实际覆盖。
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>研究规则结束日期</FieldLabel>
                <DateInput
                  type="date"
                  aria-label="研究规则结束日期"
                  value={domesticRuleRange.endDate}
                  onChange={(event) =>
                    onDomesticRuleRangeChange({ ...domesticRuleRange, endDate: event.target.value })
                  }
                />
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel>T+1 规则决策说明</FieldLabel>
              <Textarea
                aria-label="T+1 规则决策说明"
                value={domesticRuleDecision}
                onChange={(event) => onDomesticRuleDecisionChange(event.target.value)}
                placeholder="说明本次采用国内基金 T+1 研究规则的范围和判断。"
              />
            </Field>
            <ConfirmationField
              id="nav-domestic-rule-confirmation"
              checked={domesticRuleDecisionConfirmed}
              onCheckedChange={onDomesticRuleDecisionConfirmation}
            >
              我确认以上适用范围（含预热）采用 T+1
              净值披露延迟研究假设，不将它表述为严格历史发布时间或渠道结算事实。
            </ConfirmationField>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ExecutionModelCard({
  text,
  symbol,
  startDate,
  endDate,
  confirmed,
  onChange,
  onConfirm,
}: {
  text: string;
  symbol: string;
  startDate: string;
  endDate: string;
  confirmed: boolean;
  onChange: (value: string) => void;
  onConfirm: (value: BacktestExecutionModelV3) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>费用与确认结算模型</CardTitle>
        <CardDescription>
          运行前必须配置并确认当前基金和日期范围适用的 NAV 研究模型。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NavBacktestModel
          text={text}
          symbol={symbol}
          startDate={startDate}
          endDate={endDate}
          confirmed={confirmed}
          onChange={onChange}
          onConfirm={onConfirm}
        />
      </CardContent>
    </Card>
  );
}

export function NavSetupActions({
  canPrepare,
  preparing,
  canCreate,
  creating,
  onPrepare,
  onCreate,
}: {
  canPrepare: boolean;
  preparing: boolean;
  canCreate: boolean;
  creating: boolean;
  onPrepare: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={!canPrepare || preparing} onClick={onPrepare}>
        {preparing ? '正在准备净值输入…' : '准备并核对 NAV 输入'}
      </Button>
      <Button type="button" variant="outline" disabled={!canCreate || creating} onClick={onCreate}>
        {creating ? '正在创建运行…' : '确认并创建 NAV 运行'}
      </Button>
    </div>
  );
}

export function NavSetupFeedback({
  formError,
  prepareError,
  createError,
  blocked,
}: {
  formError: string | null;
  prepareError: unknown;
  createError: unknown;
  blocked: Extract<BacktestNavPreparationResultV3, { status: 'blocked' }> | null;
}) {
  return (
    <>
      {formError ? <ErrorAlert title="无法继续" message={formError} /> : null}
      {prepareError ? (
        <ErrorAlert
          title="NAV 输入准备失败"
          message={errorText(prepareError, '请调整配置后重新准备。')}
        />
      ) : null}
      {createError ? (
        <ErrorAlert
          title="NAV 运行创建失败"
          message={errorText(createError, '请在凭证有效期内重试。')}
        />
      ) : null}
      {blocked ? (
        <Alert variant="destructive">
          <AlertTitle>NAV 输入未通过准备检查</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            {blocked.diagnostics.map((diagnostic) => (
              <p key={`${diagnostic.code}:${diagnostic.message}`}>{diagnostic.message}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function ErrorAlert({ title, message }: { title: string; message: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function PreparedNavReview({
  prepared,
  receiptExpired,
  reviewed,
  onReviewedChange,
}: {
  prepared: Extract<BacktestNavPreparationResultV3, { status: 'prepared' }>;
  receiptExpired: boolean;
  reviewed: boolean;
  onReviewedChange: (checked: boolean) => void;
}) {
  const rule =
    prepared.runConfig.navVisibility.mode === 'research-assumption'
      ? prepared.runConfig.navVisibility.rule
      : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>准备结果与实际规则</CardTitle>
        <CardDescription>
          创建前请核对本次使用的数据计划、实际来源、规则依据与数据截止时间。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <PreparedValue label="研究可见性" value="研究假设，不是严格历史时点" />
          <PreparedValue label="数据截止时间" value={formatDateTime(prepared.runConfig.dataAsOf)} />
          <PreparedValue
            label="运行区间"
            value={`${prepared.inputPlanSummary.runWindow.startDate} 至 ${prepared.inputPlanSummary.runWindow.endDate}`}
          />
          <PreparedValue
            label="预期净值估值日"
            value={`${prepared.inputPlanSummary.expectedValuationDates.length} 个日期`}
          />
          <PreparedValue
            label="净值来源"
            value={
              prepared.actualSource.source.sourceRevision === 'eastmoney-fund-nav-raw-v1'
                ? '东方财富基金净值'
                : '已登记来源'
            }
          />
          <PreparedValue
            label="来源采集时间"
            value={formatDateTime(prepared.actualSource.source.capturedAt)}
          />
        </div>
        {rule ? (
          <Alert>
            <AlertTitle>
              {rule.fundType === 'domestic' ? '国内基金 T+1 规则' : 'QDII 已核验规则'}
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              <p>
                {rule.fundType === 'domestic' ? '研究假设延后' : '来源核验规则延后'}{' '}
                {rule.delayWorkdays} 个工作日；适用区间 {rule.applicableRange.startDate} 至{' '}
                {rule.applicableRange.endDate}。
              </p>
              <p>规则证据：{rule.evidenceRef}</p>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>准备结果没有研究可见性规则</AlertTitle>
            <AlertDescription>
              当前规则与本页面的研究假设入口不一致，不能创建运行。
            </AlertDescription>
          </Alert>
        )}
        {prepared.receipt ? (
          <PreparedValue
            label="准备结果可创建截止时间"
            value={formatDateTime(prepared.receipt.expiresAt)}
          />
        ) : (
          <Alert variant="destructive">
            <AlertTitle>准备结果暂时不能创建运行</AlertTitle>
            <AlertDescription>请重新准备后再创建运行。</AlertDescription>
          </Alert>
        )}
        {receiptExpired ? (
          <Alert variant="destructive">
            <AlertTitle>准备结果已过期</AlertTitle>
            <AlertDescription>请重新准备 NAV 输入后再创建运行。</AlertDescription>
          </Alert>
        ) : null}
        <ConfirmationField
          id="nav-prepared-review-confirmation"
          checked={reviewed}
          onCheckedChange={onReviewedChange}
          disabled={!prepared.receipt || receiptExpired || !rule}
        >
          我已核对本次实际来源、研究规则、日历范围和数据截止时间，确认按以上研究假设创建 NAV 运行。
        </ConfirmationField>
      </CardContent>
    </Card>
  );
}

function PreparedValue({ label, value }: { label: string; value: string }) {
  return (
    <dl>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium">{value}</dd>
    </dl>
  );
}

function ConfirmationField({
  id,
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: string;
}) {
  return (
    <Field className="flex-row items-start gap-3">
      <Checkbox
        aria-label={children}
        aria-labelledby={`${id}-label`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <div className="flex flex-col gap-1">
        <p id={`${id}-label`} className="text-sm leading-5">
          {children}
        </p>
      </div>
    </Field>
  );
}

export function errorText(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
