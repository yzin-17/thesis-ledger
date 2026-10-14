import type { BacktestKnownCashResearchPolicyV3 } from '@thesis-ledger/schemas';
import { useState } from 'react';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export const knownCashResearchPolicy: BacktestKnownCashResearchPolicyV3 = {
  version: 'known-announced-cash-events-v1',
  entitlement: 'cn-etf-record-close-holdings-v2',
  receivable: 'ex-date',
  settlement: 'assume-scheduled-payment-date',
  missingEvents: 'excluded-with-unknown-coverage',
  usage: 'accounting-only',
  splitEvents: 'not-modelled',
  historicalAvailability: 'notVerified',
  uncertainRecords: 'exclude',
};

/** 现金选择、假设和请求参数由同一责任组件拥有。 */
export function useKnownCashResearchChoice() {
  const [selected, onChange] = useState(true);
  const [assumeUnknown, onAssumeUnknown] = useState(false);
  const policy = { ...knownCashResearchPolicy };
  if (assumeUnknown) policy.uncertainRecords = 'assume-scheduled';
  return {
    controls: { selected, onChange, assumeUnknown, onAssumeUnknown },
    policy,
    fingerprint: JSON.stringify([selected, assumeUnknown]),
  };
}
const choices = { complete: '要求完整事件覆盖', known: '按来源记录研究' } as const;
const uncertaintyChoices = {
  exclude: '仅采用明确或已核对记录',
  assume: '假设采用未知状态记录',
} as const;
export function BacktestKnownCashResearchChoice({
  selected,
  onChange,
  assumeUnknown,
  onAssumeUnknown,
}: {
  selected: boolean;
  onChange: (value: boolean) => void;
  assumeUnknown: boolean;
  onAssumeUnknown: (value: boolean) => void;
}) {
  return (
    <Field>
      <FieldLabel>现金事件研究范围</FieldLabel>
      <ToggleGroup
        aria-label="现金事件研究范围"
        value={[selected ? 'known' : 'complete']}
        onValueChange={(values) => {
          if (values[0] === 'known' || values[0] === 'complete') onChange(values[0] === 'known');
        }}
      >
        {Object.entries(choices).map(([value, label]) => (
          <ToggleGroupItem key={value} value={value}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {selected && (
        <ToggleGroup
          aria-label="未知分红记录处理"
          value={[assumeUnknown ? 'assume' : 'exclude']}
          onValueChange={(values) => {
            if (values[0] === 'assume' || values[0] === 'exclude')
              onAssumeUnknown(values[0] === 'assume');
          }}
        >
          {Object.entries(uncertaintyChoices).map(([value, label]) => (
            <ToggleGroupItem key={value} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <FieldDescription>
        按来源记录／假设模拟：登记日交易结束后成交持有份额获得资格，包含当日买入、扣除当日卖出，T+1可卖限制保持，除息日确认税前应收，按记录发放日开盘模拟结算。未知状态原样保留；选择假设才采用未经具体核对的有效记录。覆盖未知，遗漏事件不纳入，结果不代表完整历史总收益或真实到账。未采用及坏记录继续披露。税费、拆分及历史首次可见未验证。价格使用原价，取得完成时冻结各自来源；不作为历史公告交易信号。
      </FieldDescription>
    </Field>
  );
}
