/** news-search-v1 的时间和引用身份；保持微秒精度与原始显示值分离。 */
export function newsTimeMicrosV3(value: string): bigint | null {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return null;
  const utc = `${match[1]}T${match[2]}Z`;
  const millis = Date.parse(utc);
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0, 19) !== utc.slice(0, 19))
    return null;
  const hours = Number(match[6] ?? 0);
  const minutes = Number(match[7] ?? 0);
  if (hours > 23 || minutes > 59 || match[1]?.startsWith('0000')) return null;
  const offset = (hours * 60 + minutes) * (match[5] === '-' ? -1 : 1);
  return (
    BigInt(millis) * 1000n + BigInt((match[3] ?? '').padEnd(6, '0')) - BigInt(offset) * 60_000_000n
  );
}

const quoteQuery = (value: string) =>
  encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');

const compareText = (left: string, right: string) => {
  const a = Array.from(left, (char) => char.codePointAt(0) ?? 0);
  const b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return a.length - b.length;
};

/** 与 DSA N1 相同：去跟踪参数和 fragment，保留路径、端口及条目原始 URL。 */
export function canonicalNewsUrlV3(value: string): string {
  const match = /^(https?):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i.exec(value);
  if (
    !match ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new Error('新闻 URL 无效');
  const parsed = new URL(value);
  if (!parsed.hostname || parsed.username || parsed.password)
    throw new Error('新闻 URL 不能包含凭据');
  const entries = [...new URLSearchParams(match[4] ?? '')]
    .filter(([key]) => !key.toLowerCase().startsWith('utm_') && key.toLowerCase() !== 'spm')
    .sort(([ak, av], [bk, bv]) => compareText(ak, bk) || compareText(av, bv));
  const query = entries.map(([key, val]) => `${quoteQuery(key)}=${quoteQuery(val)}`).join('&');
  const base = `${match[1]?.toLowerCase()}://${match[2]?.toLowerCase()}${match[3]}`;
  return query ? `${base}?${query}` : base;
}

export function isNewsInstrumentV3(value: { market: string; assetType: string; symbol: string }) {
  if (value.assetType === 'MUTUAL_FUND')
    return value.market === 'CN' && /^\d{6}\.OF$/.test(value.symbol);
  if (value.market === 'CN') return /^\d{6}\.(SH|SZ|BJ)$/.test(value.symbol);
  if (value.market === 'HK' && value.assetType === 'INDEX')
    return /^[A-Z0-9^.-]+\.HK$/.test(value.symbol);
  if (value.market === 'HK') return /^\d{5}\.HK$/.test(value.symbol);
  return /^[A-Z^][A-Z0-9.-]*\.US$/.test(value.symbol);
}
