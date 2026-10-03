import {
  compareMarketPitEvidenceInstantStringsV1,
  type MarketDataBarSeriesResponseV3,
  type RunConfigV3,
} from '@thesis-ledger/schemas';

export type HistoryInputFailureV3 = {
  code: 'FUTURE_DATA' | 'DATA_UNAVAILABLE';
  missingFields: string[];
  message: string;
};

/** 输入已经过 wire/RunConfig 校验；只判断历史协议，不改写来源时间。 */
export const backtestHistoryInputFailureV3 = (
  response: MarketDataBarSeriesResponseV3,
  seriesVersion: string,
  runConfig: RunConfigV3,
): HistoryInputFailureV3 | null => {
  const strict = runConfig.executionPriceProtocol.history.basis === 'point-in-time';
  const asOf = runConfig.dataAsOf;
  const compare = compareMarketPitEvidenceInstantStringsV1;
  if (compare(asOf, asOf) !== 0) {
    return {
      code: 'DATA_UNAVAILABLE',
      missingFields: ['dataAsOf'],
      message: '历史执行缺少有效的冻结截点。',
    };
  }
  if (
    strict &&
    (!seriesVersion.startsWith('market-series-v1:identified:') ||
      response.sourcePriceBasis.revision.origin !== 'provider' ||
      /(^|[:/_-])unknown($|[:/_-])/i.test(response.sourcePriceBasis.revision.id))
  ) {
    return {
      code: 'DATA_UNAVAILABLE',
      missingFields: ['knownProviderSeriesRevision'],
      message: '严格 PIT 执行行情缺少可识别且有来源修订的序列身份。',
    };
  }
  const sourceOrder = compare(response.sourcePriceBasis.observedAt, asOf);
  if (sourceOrder === undefined || sourceOrder > 0) {
    return {
      code: 'FUTURE_DATA',
      missingFields: ['sourcePriceBasis.observedAt'],
      message: strict
        ? '严格 PIT 来源观察时间晚于 dataAsOf。'
        : '固定快照来源观察时间晚于 dataAsOf。',
    };
  }
  if (
    response.bars.some((bar) => {
      const marketOrder = compare(bar.timestamp, asOf);
      const availableOrder = compare(bar.availableAt, asOf);
      return (
        marketOrder === undefined ||
        marketOrder > 0 ||
        availableOrder === undefined ||
        availableOrder > 0
      );
    })
  ) {
    return {
      code: 'FUTURE_DATA',
      missingFields: ['bars.timestamp', 'bars.availableAt'],
      message: strict
        ? '严格 PIT 执行行情包含晚于 dataAsOf 的价格或可见时间。'
        : '固定快照执行行情包含晚于 dataAsOf 的价格或可见时间。',
    };
  }
  if (!strict || response.sourcePriceBasis.adjustment === 'none') return null;
  const anchor = response.sourcePriceBasis.anchor;
  let anchorTime: string | null = null;
  if (anchor) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
      anchorTime = `${anchor}T23:59:59.999Z`;
    } else {
      anchorTime = anchor;
    }
  }
  const anchorOrder = anchorTime === null ? undefined : compare(anchorTime, asOf);
  if (anchorOrder === undefined) {
    return {
      code: 'DATA_UNAVAILABLE',
      missingFields: ['sourcePriceBasis.anchor'],
      message: '严格 PIT 复权行情缺少可验证的价格基准日期。',
    };
  }
  if (anchorOrder > 0) {
    return {
      code: 'FUTURE_DATA',
      missingFields: ['sourcePriceBasis.anchor'],
      message: '严格 PIT 复权基准晚于 dataAsOf。',
    };
  }
  return null;
};
