import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ThesisLedgerApiError, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import { securityLotSymbolSchema } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { fetchSecurityLotSize } from '../market-data/security-lot-size.api.js';
import {
  hasShanghaiRuleReference,
  shanghaiRuleReference,
} from './execution-rule-reference.sources.js';

const referenceMaxAgeMs = 24 * 60 * 60 * 1000;
const providerLabels = { futu: '富途 OpenAPI', longbridge: '长桥 OpenAPI' };
class ReferenceTimeError extends Error {}

function referenceFailure(error: unknown) {
  if (error instanceof ReferenceTimeError) return '参考时间异常，无法确认本次参考。';
  if (error instanceof ThesisLedgerContractError) return '参考内容或标的不一致，无法确认本次参考。';
  if (error instanceof ThesisLedgerApiError) {
    const code = error.payload?.errorCode ?? error.payload?.error;
    if (code === 'timeout') return '每手参考查询超时，可稍后重试。';
    if (code === 'invalid-response') return '参考内容或标的不一致，无法确认本次参考。';
    if (code === 'unsupported-capability') return '当前来源不支持这项每手参考。';
    if (code === 'unauthorized') return '当前来源尚无可用的每手参考读取权限。';
  }
  return '每手参考暂不可用，请检查来源配置与连接。';
}

export function ExecutionRuleReference({ symbol }: { symbol: string }) {
  const canonical = symbol.trim().toUpperCase();
  return <CurrentRuleReference key={canonical} symbol={canonical} />;
}

function CurrentRuleReference({ symbol }: { symbol: string }) {
  const [requested, setRequested] = useState(false);
  const supported = securityLotSymbolSchema.safeParse(symbol).success;
  const hasDocument = hasShanghaiRuleReference(symbol);
  const reference = useQuery({
    queryKey: ['execution-rule-reference', symbol],
    queryFn: async ({ signal }) => {
      const value = await fetchSecurityLotSize(symbol, signal);
      if (
        Date.parse(value.source.observedAt) > Date.now() ||
        Date.parse(value.fetchedAt) > Date.now()
      )
        throw new ReferenceTimeError();
      return value;
    },
    enabled: supported && requested,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const value = requested && reference.isSuccess && !reference.isFetching ? reference.data : null;
  const stale = value && Date.now() - Date.parse(value.source.observedAt) > referenceMaxAgeMs;

  return (
    <Alert variant="subtle">
      <AlertTitle>交易规则未验证</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <div>数量和价格须为正数，可保留高精度小数。每手参考不限制成交数量或均价。</div>
        {!symbol && <div>选择标的后显示已有规则参考；港股每手资料需主动查询。</div>}
        {hasDocument && <ShanghaiRuleReference />}
        {symbol && !supported && !hasDocument && (
          <div>当前市场暂无已核对的规则参考，可继续录入。</div>
        )}
        {supported && (
          <>
            <div>仅提供当前港股每手观察；历史变更及成交日期适用性未验证。</div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              disabled={reference.isFetching}
              onClick={() => {
                if (requested) void reference.refetch();
                else setRequested(true);
              }}
            >
              {reference.isFetching ? '正在查询每手参考…' : '查询当前每手参考'}
            </Button>
            <div role="status" aria-live="polite">
              {!requested && '参考尚未查询，可直接继续录入。'}
              {reference.isFetching && '参考查询中，可继续录入成交。'}
              {requested && reference.isError && !reference.isFetching && (
                <>{referenceFailure(reference.error)}仍可继续录入成交。</>
              )}
              {value && (
                <div className="flex flex-col gap-1">
                  <div>
                    {value.symbol}：当前每手 {value.sharesPerLot} 股，仅供参考。
                  </div>
                  {stale && <div>参考陈旧：来源观察已超过 24 小时，请核对最新资料。</div>}
                  <div>
                    来源：
                    <a href={value.source.sourceUrl} target="_blank" rel="noreferrer">
                      {providerLabels[value.routeTarget.providerId]}
                    </a>
                  </div>
                  <div>
                    来源观察：
                    <time dateTime={value.source.observedAt}>{value.source.observedAt}</time>
                  </div>
                  <div>
                    本次获取：<time dateTime={value.fetchedAt}>{value.fetchedAt}</time>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

function ShanghaiRuleReference() {
  return (
    <div className="flex flex-col gap-1">
      <div>
        公开文件参考：
        <a href={shanghaiRuleReference.sourceUrl} target="_blank" rel="noreferrer">
          {shanghaiRuleReference.title}
        </a>
      </div>
      <div>
        {shanghaiRuleReference.version}；发布：
        <time dateTime={shanghaiRuleReference.publishedOn}>
          {shanghaiRuleReference.publishedOn}
        </time>
      </div>
      <div>
        资料核对：
        <time dateTime={shanghaiRuleReference.reviewedOn}>{shanghaiRuleReference.reviewedOn}</time>
        ，之后变更请查看原文。
      </div>
      <div>
        仅为上交所公开文件参考。基金分类页时效标记有差异；品种、方式、成交日期及暂缓条款的完整适用性未验证。
      </div>
    </div>
  );
}
