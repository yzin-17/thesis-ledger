import { backtestPublicFeesDisclosureV3Schema } from '@thesis-ledger/schemas';
import { DecimalValue } from '@thesis-ledger/domain';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateOnly } from '@/lib/date-display';

const chargeLabel = {
  stampDuty: '印花税',
  handlingFee: '经手费',
  regulatoryFee: '监管费',
  transferFee: '过户费',
  afrcLevy: '会财局交易征费',
  tradingActivityFee: 'FINRA交易活动费',
} as const;
const sideLabel = { buy: '买入', sell: '卖出', both: '买卖双向' } as const;

export function BacktestPublicFeesDisclosure({ disclosure }: { disclosure: unknown }) {
  const parsed = backtestPublicFeesDisclosureV3Schema.safeParse(disclosure);
  if (!parsed.success) return null;
  const fees = parsed.data;
  if (fees.status === 'executionModel') {
    return (
      <Alert>
        <AlertTitle>公共收费：使用已选执行模型</AlertTitle>
        <AlertDescription>{fees.reason}</AlertDescription>
      </Alert>
    );
  }
  const { response } = fees;
  return (
    <Alert>
      <AlertTitle>历史公共收费：已使用冻结费率</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        {fees.fallbackReason && <div>{fees.fallbackReason}</div>}
        <div>
          {response.symbol} · {formatDateOnly(response.range.start)} 至{' '}
          {formatDateOnly(response.range.end)}
        </div>
        <div>
          公共费率覆盖模型中单独计费的对应项目；佣金、规费包含关系、最低额及取整沿用已选模型。
        </div>
        {response.provenance.coverageDescription && (
          <div>{response.provenance.coverageDescription}</div>
        )}
        {response.provenance.chargeDatePolicy && (
          <div>
            交易所结算日收费口径 · T+{response.provenance.chargeDatePolicy.settlementLagSessions} ·
            结算生效日 {formatDateOnly(response.provenance.chargeDatePolicy.rateChangeChargeDate)} ·
            对应成交日 {formatDateOnly(response.provenance.chargeDatePolicy.effectiveTradeDate)}
          </div>
        )}
        {response.segments.map((segment) => (
          <div key={segment.range.start} className="flex flex-col gap-1">
            <div>
              {formatDateOnly(segment.range.start)} 起，{formatDateOnly(segment.range.endExclusive)}{' '}
              前
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {segment.charges.map((charge) => (
                <li key={charge.code}>
                  {response.routeKey.market === 'HK' && charge.code === 'handlingFee'
                    ? '港交所交易费'
                    : chargeLabel[charge.code]}（{sideLabel[charge.side]}）：
                  {charge.basis === 'actualShares'
                    ? <>{charge.rate} 美元／股 · 每笔上限 {charge.maximumAmount} 美元 · 成交价低于每股费率时豁免</>
                    : <>{DecimalValue.from(charge.rate).times('100').toString()}%</>}
                  {charge.amountRounding?.mode === 'ceil' && <> · 每笔进位至整港元</>}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <ul className="flex flex-col gap-1">
          {response.sourceDocuments.map((document) => (
            <li key={document.id}>
              <a href={document.url} target="_blank" rel="noopener noreferrer">
                {document.title}
              </a>
              {' · '}
              {document.kind === 'governmentNewsRepublication' ? '政府公开转载' : '官方发布'}
              {' · '}
              {document.publishedDate ? formatDateOnly(document.publishedDate) : '发布日期未知'}
              {document.sha256 && <span className="break-all"> · 原件摘要 {document.sha256}</span>}
              {document.observedAt && <> · 实际核验 {document.observedAt}</>}
            </li>
          ))}
        </ul>
        <div className="break-all">规则内容版本：{response.provenance.providerRevision}</div>
        <div>历史首次可见时间尚未核验；本次按已取得公开资料用于本地研究。</div>
      </AlertDescription>
    </Alert>
  );
}
