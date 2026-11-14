import { pinyin } from 'pinyin-pro';
import type { CatalogItem } from '@thesis-ledger/schemas';

export const CONFIRMABLE_INSTRUMENT_TYPES = new Set(['STOCK', 'ETF', 'MUTUAL_FUND']);
export const SUPPORTED_PORTFOLIO_MARKETS = new Set(['SH', 'SZ', 'BJ', 'OF', 'HK', 'US']);

export const symbolForInstrument = (item: Pick<CatalogItem, 'canonicalCode' | 'market'>) =>
  `${item.canonicalCode}.${item.market}`;

export const assetTypeForInstrument = (instrumentType: string) => {
  switch (instrumentType) {
    case 'ETF':
      return 'etf';
    case 'MUTUAL_FUND':
      return 'fund';
    default:
      return 'stock';
  }
};

export const disabledReasonForInstrument = (instrumentType: string, market: string) => {
  if (!CONFIRMABLE_INSTRUMENT_TYPES.has(instrumentType)) return 'unsupported_instrument_type';
  if (!SUPPORTED_PORTFOLIO_MARKETS.has(market)) return 'unsupported_market';
  if ((market === 'HK' || market === 'US') && instrumentType !== 'STOCK') return 'unsupported_instrument_type';
  return null;
};

export const isConfirmableInstrument = (instrumentType: string, market: string) =>
  disabledReasonForInstrument(instrumentType, market) === null;

const normalizedQuery = (value: string) => value.trim().toLocaleLowerCase('zh-CN');

export const searchFieldsForInstrument = (
  item: Pick<CatalogItem, 'canonicalCode' | 'market' | 'displayName'>,
) => {
  const fullPinyin = pinyin(item.displayName, { toneType: 'none' }).replace(/\s+/g, '');
  const pinyinSyllables = pinyin(item.displayName, {
    toneType: 'none',
    type: 'array',
  }).join(' ');
  const initials = pinyin(item.displayName, {
    toneType: 'none',
    type: 'array',
  })
    .map((syllable) => syllable.slice(0, 1))
    .join('');
  const searchAliases = [
    item.displayName,
    fullPinyin,
    pinyinSyllables,
    initials,
    item.canonicalCode,
    `${item.canonicalCode}.${item.market}`,
  ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
  return { pinyin: fullPinyin, pinyinInitials: initials, searchAliases };
};

export const instrumentMatchRank = (
  instrument: {
    canonicalCode: string;
    market?: string;
    displayName: string;
    pinyin?: string | null;
    pinyinInitials?: string | null;
    searchAliases?: unknown;
  },
  query: string,
) => {
  const needle = normalizedQuery(query);
  const code = normalizedQuery(instrument.canonicalCode);
  const name = normalizedQuery(instrument.displayName);
  const pinyinValue = normalizedQuery(instrument.pinyin ?? '');
  const initials = normalizedQuery(instrument.pinyinInitials ?? '');
  const aliases = Array.isArray(instrument.searchAliases)
    ? instrument.searchAliases.map((value) => normalizedQuery(String(value)))
    : [];
  if (code === needle || (instrument.market && `${code}.${normalizedQuery(instrument.market)}` === needle)) return 0;
  if (code.startsWith(needle)) return 1;
  if (name === needle || name.startsWith(needle)) return 2;
  if (
    pinyinValue === needle ||
    pinyinValue.startsWith(needle) ||
    initials === needle ||
    initials.startsWith(needle)
  )
    return 3;
  if (
    code.includes(needle) ||
    name.includes(needle) ||
    pinyinValue.includes(needle) ||
    initials.includes(needle) ||
    aliases.some((alias) => alias.includes(needle))
  )
    return 4;
  return 99;
};
