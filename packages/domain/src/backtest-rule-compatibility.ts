import { DecimalValue } from './decimal.js';
import {
  hasVerifiedExecutionModelConversion,
  type FrozenExecutionModel,
  type FrozenExecutionModelFees,
  type ExecutionModelPriceBasisFacts,
  type ExecutionModelRuleUnitFacts,
  type ExecutionModelUnitConversion,
} from './backtest-execution-model.js';

type RuleCurrency = 'CNY' | 'HKD' | 'USD';

export type RuleScaleTransform =
  | { kind: 'identity' }
  | { kind: 'uniform-multiplicative'; factor: string; evidenceRef: string }
  | { kind: 'non-proportional'; evidenceRef?: string | null }
  | { kind: 'unknown' };

/** A source's frozen coordinate facts; strategy AST values remain untouched. */
export interface RulePriceCoordinateFacts {
  coordinateId: string;
  currency: RuleCurrency;
  priceBasis: ExecutionModelPriceBasisFacts & {
    dividendMeaning?: 'explicit-cash' | 'embedded-verified' | 'provider-defined';
  };
  scaleTransform?: RuleScaleTransform;
  volumeToQuantityConversion?: ExecutionModelUnitConversion;
}

/**
 * These fields intentionally leave AST nodes as unknown. Domain must not import
 * the schemas package; the consumer passes its existing V2 typed strategy and
 * the runtime visitor recognizes that contract without creating a second AST.
 */
export interface StrategyRuleCompatibilityInput {
  signalSources: readonly { id: string; series: readonly string[] }[];
  executionInstrument?: { symbol: string; market: string; assetType: string };
  entry: unknown;
  exit: unknown;
  sizing: unknown;
  risk: readonly unknown[];
  execution?: unknown;
  cost?: unknown;
}

export interface RuleCompatibilityProtocol {
  protocolVersion: 'execution-price-v1';
  accountingBasis: 'raw-events' | 'normalized-series';
  priceBasis: ExecutionModelPriceBasisFacts & {
    dividendMeaning?: 'explicit-cash' | 'embedded-verified' | 'provider-defined';
  };
  history?: { basis: 'point-in-time' | 'fixed-provider-snapshot' };
}

export interface StrategyRuleCompatibilityContext {
  protocol: RuleCompatibilityProtocol;
  executionModel: FrozenExecutionModel;
  executionUnits: ExecutionModelRuleUnitFacts;
  executionCoordinate: RulePriceCoordinateFacts;
  sourceCoordinates: Readonly<Record<string, RulePriceCoordinateFacts>>;
}

export type RuleCompatibilityIssueCode =
  | 'PROTOCOL_BASIS_MISMATCH'
  | 'EXECUTION_MODE_UNSUPPORTED'
  | 'REAL_LOT_SIZE_UNAVAILABLE'
  | 'REAL_TICK_SIZE_UNAVAILABLE'
  | 'RAW_PRICE_CONVERSION_REQUIRED'
  | 'ACTUAL_QUANTITY_CONVERSION_REQUIRED'
  | 'ACTUAL_UNIT_FEE_UNSUPPORTED'
  | 'FEE_BASIS_UNSUPPORTED'
  | 'ABSOLUTE_PRICE_THRESHOLD_UNCONVERTIBLE'
  | 'CROSS_SEQUENCE_PRICE_COORDINATE_MISMATCH'
  | 'RULE_UNIT_MISMATCH'
  | 'VOLUME_UNIT_MISMATCH'
  | 'VWAP_UNITS_INCOMPATIBLE'
  | 'VOLUME_PARTICIPATION_UNSUPPORTED'
  | 'UNSUPPORTED_RULE_NODE';

export interface RuleCompatibilityIssue {
  severity: 'block' | 'warning';
  code: RuleCompatibilityIssueCode | 'SCALE_INVARIANCE_UNPROVEN';
  path: readonly (string | number)[];
  message: string;
}

export type RuleScaleInvariance = 'proven' | 'coordinate-dependent' | 'not-applicable';

export interface RequiredRuleConversion {
  kind: 'price-to-raw' | 'quantity-to-actual' | 'volume-to-strategy-units';
  sourceId: string;
  evidenceRef: string;
}

export interface RuleCompatibilityReport<TStrategy extends StrategyRuleCompatibilityInput> {
  compatible: boolean;
  sourceStrategy: TStrategy;
  issues: readonly RuleCompatibilityIssue[];
  requiredConversions: readonly RequiredRuleConversion[];
  scaleInvariance: RuleScaleInvariance;
}

type NumericUnitKind = 'constant' | 'price' | 'quantity' | 'volume' | 'ratio' | 'periods';
interface NumericUnit {
  kind: NumericUnitKind;
  sourceId?: string;
  coordinate?: RulePriceCoordinateFacts;
  scaleInvariant: boolean;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asScaleTransform = (coordinate: RulePriceCoordinateFacts): RuleScaleTransform => {
  if (coordinate.scaleTransform) return coordinate.scaleTransform;
  if (coordinate.priceBasis.adjustment === 'none') return { kind: 'identity' };
  return { kind: 'unknown' };
};

const isProvenUniformTransform = (coordinate: RulePriceCoordinateFacts) => {
  const transform = asScaleTransform(coordinate);
  if (transform.kind === 'identity') return true;
  if (transform.kind !== 'uniform-multiplicative' || !transform.evidenceRef.trim()) return false;
  try {
    return DecimalValue.from(transform.factor).isPositive();
  } catch {
    return false;
  }
};

const transformsShareFactor = (left: RulePriceCoordinateFacts, right: RulePriceCoordinateFacts) => {
  const leftTransform = asScaleTransform(left);
  const rightTransform = asScaleTransform(right);
  if (leftTransform.kind === 'identity' && rightTransform.kind === 'identity') return true;
  if (
    leftTransform.kind !== 'uniform-multiplicative' ||
    rightTransform.kind !== 'uniform-multiplicative' ||
    !leftTransform.evidenceRef.trim() ||
    !rightTransform.evidenceRef.trim()
  ) {
    return false;
  }
  try {
    return (
      DecimalValue.from(leftTransform.factor).isPositive() &&
      DecimalValue.from(rightTransform.factor).isPositive() &&
      DecimalValue.from(leftTransform.factor).compareTo(rightTransform.factor) === 0
    );
  } catch {
    return false;
  }
};

const volumeBasisMatchesQuantity = (coordinate: RulePriceCoordinateFacts) => {
  if (coordinate.priceBasis.quantityBasis === 'actual-units') {
    return coordinate.priceBasis.volumeBasis === 'original';
  }
  return coordinate.priceBasis.volumeBasis === 'split-adjusted';
};

const hasPriceConversion = (basis: ExecutionModelPriceBasisFacts) =>
  hasVerifiedExecutionModelConversion({
    available: basis.conversionAvailable,
    evidenceRef: basis.conversionEvidenceRef,
  });

const makeUnit = (
  kind: NumericUnitKind,
  sourceId?: string,
  coordinate?: RulePriceCoordinateFacts,
  scaleInvariant = true,
): NumericUnit => {
  const unit: NumericUnit = { kind, scaleInvariant };
  if (sourceId !== undefined) unit.sourceId = sourceId;
  if (coordinate !== undefined) unit.coordinate = coordinate;
  return unit;
};

/**
 * Checks an existing strategy against frozen execution and unit facts. It never
 * rewrites, removes, or normalizes a strategy rule; the original object is
 * returned in the report so the caller can present a precise preflight result.
 */
class RuleCompatibilityAnalyzer<TStrategy extends StrategyRuleCompatibilityInput> {
  private readonly issues: RuleCompatibilityIssue[] = [];
  private readonly requiredConversions: RequiredRuleConversion[] = [];
  private readonly sourceById: Map<string, StrategyRuleCompatibilityInput['signalSources'][number]>;
  private readonly normalized: boolean;
  private sawScaleSensitiveRule = false;
  private sawScaleInvariantRule = false;

  constructor(
    private readonly strategy: TStrategy,
    private readonly context: StrategyRuleCompatibilityContext,
  ) {
    this.normalized = context.protocol.accountingBasis === 'normalized-series';
    this.sourceById = new Map(strategy.signalSources.map((source) => [source.id, source]));
  }

  run(): RuleCompatibilityReport<TStrategy> {
    this.checkProtocol();
    this.checkExecutionModel();
    this.readBooleanRule(this.strategy.entry, ['entry']);
    this.readBooleanRule(this.strategy.exit, ['exit']);
    this.checkSizingAndRisk();
    return this.makeReport();
  }

  private addIssue(
    code: RuleCompatibilityIssue['code'],
    path: readonly (string | number)[],
    message: string,
    severity: RuleCompatibilityIssue['severity'] = 'block',
  ) {
    this.issues.push({ code, path, message, severity });
  }

  private addConversion(
    kind: RequiredRuleConversion['kind'],
    sourceId: string,
    evidenceRef: string,
  ) {
    const exists = this.requiredConversions.some(
      (item) =>
        item.kind === kind && item.sourceId === sourceId && item.evidenceRef === evidenceRef,
    );
    if (!exists) this.requiredConversions.push({ kind, sourceId, evidenceRef });
  }

  private markScale(invariant: boolean, path: readonly (string | number)[]) {
    if (invariant) {
      this.sawScaleInvariantRule = true;
      return;
    }
    this.sawScaleSensitiveRule = true;
    this.addIssue(
      'SCALE_INVARIANCE_UNPROVEN',
      path,
      '此规则在当前冻结价格坐标内可计算，但无法证明对非比例复权或坐标变更保持不变',
      'warning',
    );
  }

  private checkProtocol() {
    const { protocol, executionCoordinate } = this.context;
    const coordinateBasis = executionCoordinate.priceBasis;
    if (
      coordinateBasis.adjustment !== protocol.priceBasis.adjustment ||
      coordinateBasis.quantityBasis !== protocol.priceBasis.quantityBasis ||
      coordinateBasis.volumeBasis !== protocol.priceBasis.volumeBasis ||
      coordinateBasis.conversionAvailable !== protocol.priceBasis.conversionAvailable ||
      coordinateBasis.conversionEvidenceRef !== protocol.priceBasis.conversionEvidenceRef
    ) {
      this.addIssue(
        'PROTOCOL_BASIS_MISMATCH',
        ['executionCoordinate'],
        '执行价格坐标与冻结协议不一致',
      );
    }
    if (
      protocol.accountingBasis === 'raw-events' &&
      (protocol.priceBasis.adjustment !== 'none' ||
        protocol.priceBasis.quantityBasis !== 'actual-units')
    ) {
      this.addIssue(
        'PROTOCOL_BASIS_MISMATCH',
        ['protocol'],
        '原始份额记账必须使用原始价格和实际数量',
      );
    }
    if (
      this.normalized &&
      (protocol.priceBasis.adjustment === 'none' ||
        protocol.priceBasis.quantityBasis !== 'normalized-units' ||
        protocol.priceBasis.dividendMeaning === 'explicit-cash')
    ) {
      this.addIssue(
        'PROTOCOL_BASIS_MISMATCH',
        ['protocol'],
        '归一化记账需要复权价格、归一化数量且不得重复注入现金分红',
      );
    }
  }

  private checkExecutionModel() {
    for (const [index, segment] of this.context.executionModel.segments.entries()) {
      if (segment.execution.mode !== 'exchange') {
        this.addIssue(
          'EXECUTION_MODE_UNSUPPORTED',
          ['executionModel', 'segments', index, 'execution', 'mode'],
          '本规则检查仅支持交易所日线执行模型',
        );
        continue;
      }
      if (this.normalized && segment.execution.price.kind === 'dailyLimit') {
        this.checkDailyLimit(index);
      }
      if (this.normalized && segment.fees) this.checkFees(segment.fees, index);
    }
  }

  private checkDailyLimit(index: number) {
    const basis = this.context.protocol.priceBasis;
    if (!hasPriceConversion(basis)) {
      this.addIssue(
        'RAW_PRICE_CONVERSION_REQUIRED',
        ['executionModel', 'segments', index, 'execution', 'price'],
        '真实涨跌停和 tick 舍入需要有证据的复权价到原始价转换',
      );
    } else {
      this.addConversion(
        'price-to-raw',
        this.context.executionCoordinate.coordinateId,
        basis.conversionEvidenceRef!,
      );
    }
    if (!this.context.executionUnits.realTickSize) {
      this.addIssue(
        'REAL_TICK_SIZE_UNAVAILABLE',
        ['executionModel', 'segments', index, 'execution', 'price'],
        '执行规则要求真实 tick，但冻结模型没有 tick 事实',
      );
    }
  }

  private checkFees(fees: FrozenExecutionModelFees, index: number) {
    for (const feeCode of [
      'commission',
      'stampDuty',
      'transferFee',
      'regulatoryFee',
      'handlingFee',
    ] as const) {
      const fee = fees[feeCode];
      if (fee.treatment !== 'charged' || fee.basis === 'turnover') continue;
      const hasQuantityConversion = hasVerifiedExecutionModelConversion(
        this.context.executionUnits.actualQuantityConversion,
      );
      this.addIssue(
        hasQuantityConversion ? 'FEE_BASIS_UNSUPPORTED' : 'ACTUAL_UNIT_FEE_UNSUPPORTED',
        ['executionModel', 'segments', index, 'fees', feeCode, 'basis'],
        hasQuantityConversion
          ? '费用基数 ' + fee.basis + ' 需要当前执行模型尚未实现的逐单位计费'
          : '费用基数 ' + fee.basis + ' 依赖真实份额，缺少有证据的数量转换',
      );
    }
  }

  private coordinateForSource(sourceId: string, path: readonly (string | number)[]) {
    const source = this.sourceById.get(sourceId);
    if (!source) {
      this.addIssue(
        'UNSUPPORTED_RULE_NODE',
        [...path, 'sourceId'],
        '未知 SignalSource: ' + sourceId,
      );
      return undefined;
    }
    const coordinate = this.context.sourceCoordinates[sourceId];
    if (!coordinate) {
      this.addIssue(
        'UNSUPPORTED_RULE_NODE',
        [...path, 'sourceId'],
        '缺少 SignalSource 单位事实: ' + sourceId,
      );
      return undefined;
    }
    return { source, coordinate };
  }

  private checkAbsolutePrice(
    coordinate: RulePriceCoordinateFacts,
    sourceId: string,
    path: readonly (string | number)[],
  ): boolean {
    if (!this.normalized || coordinate.priceBasis.adjustment === 'none') return true;
    const basis = coordinate.priceBasis;
    if (!hasPriceConversion(basis)) {
      this.addIssue(
        'ABSOLUTE_PRICE_THRESHOLD_UNCONVERTIBLE',
        path,
        '绝对价格规则依赖真实价格，来源 ' + sourceId + ' 没有可核验的转换证据',
      );
      return false;
    }
    this.addConversion('price-to-raw', sourceId, basis.conversionEvidenceRef!);
    return true;
  }

  private checkActualQuantity(sourceId: string, path: readonly (string | number)[]) {
    if (!this.normalized) return;
    const conversion = this.context.executionUnits.actualQuantityConversion;
    if (!hasVerifiedExecutionModelConversion(conversion)) {
      this.addIssue(
        'ACTUAL_QUANTITY_CONVERSION_REQUIRED',
        path,
        '固定真实股／份数量规则缺少到归一化数量的可核验转换',
      );
      return;
    }
    if (this.context.executionUnits.realLotSize === null) {
      this.addIssue('REAL_LOT_SIZE_UNAVAILABLE', path, '固定真实股／份数量规则缺少真实整手事实');
      return;
    }
    this.addConversion('quantity-to-actual', sourceId, conversion.evidenceRef!);
  }

  private compatibleVolume(
    sourceId: string,
    coordinate: RulePriceCoordinateFacts,
    path: readonly (string | number)[],
    purpose: 'vwap' | 'threshold',
  ) {
    const source = this.sourceById.get(sourceId);
    if (!source?.series.includes('volume') || coordinate.priceBasis.volumeBasis === 'unknown') {
      const code = purpose === 'vwap' ? 'VWAP_UNITS_INCOMPATIBLE' : 'VOLUME_UNIT_MISMATCH';
      this.addIssue(code, path, '来源 ' + sourceId + ' 没有可用且单位明确的成交量');
      return false;
    }
    if (volumeBasisMatchesQuantity(coordinate)) return true;
    const conversion = coordinate.volumeToQuantityConversion;
    if (!conversion || !hasVerifiedExecutionModelConversion(conversion)) {
      const code = purpose === 'vwap' ? 'VWAP_UNITS_INCOMPATIBLE' : 'VOLUME_UNIT_MISMATCH';
      this.addIssue(code, path, '来源 ' + sourceId + ' 的成交量单位与价格协议数量单位不兼容');
      return false;
    }
    this.addConversion('volume-to-strategy-units', sourceId, conversion.evidenceRef!);
    return true;
  }

  private readSeriesUnit(value: UnknownRecord, path: readonly (string | number)[]): NumericUnit {
    if (typeof value.sourceId !== 'string') {
      this.addIssue('UNSUPPORTED_RULE_NODE', [...path, 'sourceId'], 'Series 必须关联 SignalSource');
      return makeUnit('price', undefined, undefined, false);
    }
    const sourceRef = this.coordinateForSource(value.sourceId, path);
    if (!sourceRef) return makeUnit('price', value.sourceId, undefined, false);
    if (typeof value.field !== 'string' || !sourceRef.source.series.includes(value.field)) {
      this.addIssue(
        'UNSUPPORTED_RULE_NODE',
        [...path, 'field'],
        'Series 未声明字段: ' + String(value.field),
      );
      return makeUnit('price', value.sourceId, sourceRef.coordinate, false);
    }
    if (value.field === 'volume') {
      return makeUnit('volume', value.sourceId, sourceRef.coordinate);
    }
    return makeUnit(
      'price',
      value.sourceId,
      sourceRef.coordinate,
      isProvenUniformTransform(sourceRef.coordinate),
    );
  }

  private readPositionUnit(value: UnknownRecord): NumericUnit | undefined {
    if (typeof value.field !== 'string') return undefined;
    if (value.field === 'averageCost') {
      return makeUnit(
        'price',
        '__execution__',
        this.context.executionCoordinate,
        isProvenUniformTransform(this.context.executionCoordinate),
      );
    }
    if (value.field === 'quantity') return makeUnit('quantity', '__execution__');
    if (value.field === 'holdingPeriods') return makeUnit('periods', '__execution__');
    return undefined;
  }

  private readIndicatorUnit(value: UnknownRecord, path: readonly (string | number)[]): NumericUnit {
    if (typeof value.name !== 'string') {
      this.addIssue('UNSUPPORTED_RULE_NODE', [...path, 'name'], 'Indicator 必须声明名称');
      return makeUnit('constant', undefined, undefined, false);
    }
    const child = this.readNumericUnit(value.input, [...path, 'input']);
    if (value.name === 'VWAP') {
      if (!child.sourceId || !child.coordinate) {
        this.addIssue(
          'VWAP_UNITS_INCOMPATIBLE',
          path,
          'VWAP 必须关联一个具有价格和成交量单位的来源',
        );
        return makeUnit('price', child.sourceId, child.coordinate, false);
      }
      const volumeIsCompatible = this.compatibleVolume(
        child.sourceId,
        child.coordinate,
        path,
        'vwap',
      );
      return makeUnit(
        'price',
        child.sourceId,
        child.coordinate,
        child.scaleInvariant && volumeIsCompatible,
      );
    }
    if (value.name === 'RSI') {
      return makeUnit('ratio', child.sourceId, child.coordinate, child.scaleInvariant);
    }
    if (['MA', 'EMA', 'MACD', 'ATR', 'Highest', 'Lowest'].includes(value.name)) {
      return makeUnit(child.kind, child.sourceId, child.coordinate, child.scaleInvariant);
    }
    this.addIssue('UNSUPPORTED_RULE_NODE', [...path, 'name'], '不支持的 Indicator: ' + value.name);
    return makeUnit('constant', undefined, undefined, false);
  }

  private readNumericUnit(value: unknown, path: readonly (string | number)[]): NumericUnit {
    if (!isRecord(value) || typeof value.type !== 'string') {
      this.addIssue('UNSUPPORTED_RULE_NODE', path, '无法识别的数值 AST 节点');
      return makeUnit('constant', undefined, undefined, false);
    }
    if (value.type === 'constant') return makeUnit('constant');
    if (value.type === 'series') return this.readSeriesUnit(value, path);
    if (value.type === 'positionState') {
      const positionUnit = this.readPositionUnit(value);
      if (positionUnit) return positionUnit;
    }
    if (value.type === 'indicator') return this.readIndicatorUnit(value, path);
    if (value.type === 'volumeParticipation' || value.type === 'participationRate') {
      this.addIssue(
        'VOLUME_PARTICIPATION_UNSUPPORTED',
        path,
        '量参与率规则没有可靠的成交量／执行数量转换或本次执行能力',
      );
      return makeUnit('constant', undefined, undefined, false);
    }
    this.addIssue('UNSUPPORTED_RULE_NODE', path, '不支持的数值 AST 节点: ' + value.type);
    return makeUnit('constant', undefined, undefined, false);
  }

  private markNumericScale(unit: NumericUnit, path: readonly (string | number)[]) {
    if (unit.coordinate) this.markScale(unit.scaleInvariant, path);
  }

  private comparePriceCoordinates(
    left: NumericUnit,
    right: NumericUnit,
    path: readonly (string | number)[],
  ) {
    const leftCoordinate = left.coordinate;
    const rightCoordinate = right.coordinate;
    if (!leftCoordinate || !rightCoordinate) {
      this.addIssue(
        'CROSS_SEQUENCE_PRICE_COORDINATE_MISMATCH',
        path,
        '价格比较缺少冻结坐标单位事实',
      );
      return;
    }
    if (leftCoordinate.currency !== rightCoordinate.currency) {
      this.addIssue('CROSS_SEQUENCE_PRICE_COORDINATE_MISMATCH', path, '跨币种绝对价格不能直接比较');
      return;
    }
    if (leftCoordinate.coordinateId !== rightCoordinate.coordinateId) {
      if (!transformsShareFactor(leftCoordinate, rightCoordinate)) {
        this.addIssue(
          'CROSS_SEQUENCE_PRICE_COORDINATE_MISMATCH',
          path,
          '跨序列价格没有相同基准或已证明相同的统一乘法缩放',
        );
        return;
      }
      this.markScale(true, path);
      return;
    }
    this.markScale(left.scaleInvariant && right.scaleInvariant, path);
  }

  private compareWithConstant(unit: NumericUnit, path: readonly (string | number)[]) {
    if (unit.kind === 'price') {
      if (!unit.coordinate || !unit.sourceId) {
        this.addIssue(
          'ABSOLUTE_PRICE_THRESHOLD_UNCONVERTIBLE',
          path,
          '绝对价格规则缺少价格单位事实',
        );
        return;
      }
      const conversionProven = this.checkAbsolutePrice(unit.coordinate, unit.sourceId, path);
      this.markScale(conversionProven && unit.scaleInvariant, path);
      return;
    }
    if (unit.kind === 'quantity') {
      this.checkActualQuantity(unit.sourceId ?? '__execution__', path);
      return;
    }
    if (unit.kind === 'volume') {
      if (!unit.sourceId || !unit.coordinate) {
        this.addIssue('VOLUME_UNIT_MISMATCH', path, '成交量阈值缺少来源单位事实');
        return;
      }
      this.compatibleVolume(unit.sourceId, unit.coordinate, path, 'threshold');
      return;
    }
    if (unit.kind === 'ratio' || unit.kind === 'periods') {
      this.markNumericScale(unit, path);
      return;
    }
    this.addIssue('RULE_UNIT_MISMATCH', path, '数值常量没有可匹配的规则单位');
  }

  private compareNumericUnits(
    left: NumericUnit,
    right: NumericUnit,
    path: readonly (string | number)[],
  ) {
    if (left.kind === 'constant') {
      this.compareWithConstant(right, path);
      return;
    }
    if (right.kind === 'constant') {
      this.compareWithConstant(left, path);
      return;
    }
    if (left.kind !== right.kind) {
      this.addIssue('RULE_UNIT_MISMATCH', path, '不能比较 ' + left.kind + ' 与 ' + right.kind);
      return;
    }
    if (left.kind === 'price') {
      this.comparePriceCoordinates(left, right, path);
      return;
    }
    if (left.kind === 'volume') {
      if (left.sourceId && left.coordinate) {
        this.compatibleVolume(left.sourceId, left.coordinate, path, 'threshold');
      }
      if (right.sourceId && right.coordinate) {
        this.compatibleVolume(right.sourceId, right.coordinate, path, 'threshold');
      }
      return;
    }
    if (left.kind === 'quantity' && this.normalized) {
      this.checkActualQuantity(left.sourceId ?? '__execution__', path);
      return;
    }
    this.markScale(left.scaleInvariant && right.scaleInvariant, path);
  }

  private readBooleanRule(value: unknown, path: readonly (string | number)[]) {
    if (!isRecord(value) || typeof value.type !== 'string') {
      this.addIssue('UNSUPPORTED_RULE_NODE', path, '无法识别的布尔 AST 节点');
      return;
    }
    if (value.type === 'all' || value.type === 'any') {
      if (!Array.isArray(value.conditions) || value.conditions.length === 0) {
        this.addIssue(
          'UNSUPPORTED_RULE_NODE',
          [...path, 'conditions'],
          '条件组合必须包含 AST 子节点',
        );
        return;
      }
      value.conditions.forEach((condition, index) =>
        this.readBooleanRule(condition, [...path, 'conditions', index]),
      );
      return;
    }
    if (value.type === 'not') {
      this.readBooleanRule(value.expression, [...path, 'expression']);
      return;
    }
    if (value.type === 'positionState' && value.field === 'isOpen') return;
    if (value.type === 'compare' || value.type === 'cross') {
      const left = this.readNumericUnit(value.left, [...path, 'left']);
      const right = this.readNumericUnit(value.right, [...path, 'right']);
      this.compareNumericUnits(left, right, path);
      return;
    }
    if (value.type === 'volumeParticipation' || value.type === 'participationRate') {
      this.addIssue(
        'VOLUME_PARTICIPATION_UNSUPPORTED',
        path,
        '量参与率规则没有可靠的成交量／执行数量转换或本次执行能力',
      );
      return;
    }
    this.addIssue('UNSUPPORTED_RULE_NODE', path, '不支持的布尔 AST 节点: ' + value.type);
  }

  private checkSizingAndRisk() {
    const sizing = this.strategy.sizing;
    if (isRecord(sizing) && typeof sizing.type === 'string') {
      if (!['percentOfEquity', 'targetWeight', 'fixedAmount'].includes(sizing.type)) {
        if (sizing.type === 'fixedQuantity') {
          this.checkActualQuantity('__execution__', ['sizing', 'quantity']);
        } else {
          this.addIssue(
            'UNSUPPORTED_RULE_NODE',
            ['sizing', 'type'],
            '不支持的定仓规则: ' + sizing.type,
          );
        }
      }
    } else {
      this.addIssue('UNSUPPORTED_RULE_NODE', ['sizing'], '无法识别的定仓规则');
    }

    this.strategy.risk.forEach((rule, index) => {
      if (!isRecord(rule) || typeof rule.type !== 'string') {
        this.addIssue('UNSUPPORTED_RULE_NODE', ['risk', index], '无法识别的风险规则');
        return;
      }
      if (rule.type === 'fixedStop' || rule.type === 'fixedTakeProfit') {
        this.markScale(true, ['risk', index]);
        return;
      }
      if (rule.type === 'maxHoldingPeriod') return;
      this.addIssue(
        'UNSUPPORTED_RULE_NODE',
        ['risk', index, 'type'],
        '不支持的风险规则: ' + rule.type,
      );
    });
  }

  private makeReport(): RuleCompatibilityReport<TStrategy> {
    let scaleInvariance: RuleScaleInvariance = 'not-applicable';
    if (this.sawScaleSensitiveRule) scaleInvariance = 'coordinate-dependent';
    else if (this.sawScaleInvariantRule) scaleInvariance = 'proven';
    return {
      compatible: this.issues.every((issue) => issue.severity !== 'block'),
      sourceStrategy: this.strategy,
      issues: this.issues,
      requiredConversions: this.requiredConversions,
      scaleInvariance,
    };
  }
}

/**
 * Checks an existing strategy against frozen execution and unit facts. It never
 * rewrites, removes, or normalizes a strategy rule; the original object is
 * returned in the report so the caller can present a precise preflight result.
 */
export const checkBacktestRuleCompatibility = <TStrategy extends StrategyRuleCompatibilityInput>(
  strategy: TStrategy,
  context: StrategyRuleCompatibilityContext,
): RuleCompatibilityReport<TStrategy> => new RuleCompatibilityAnalyzer(strategy, context).run();
