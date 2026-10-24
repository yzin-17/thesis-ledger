import { useState } from 'react';
import {
  confirmationDraft,
  parseConfirmationDraft,
  type AuthoringContent,
  type AuthoringConfirmationDraft,
} from '@thesis-ledger/schemas';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import { InstrumentPicker } from '../market/InstrumentPicker';
export function AuthoringConfirmationFields({
  content,
  onChange,
  disabled,
}: {
  content: AuthoringContent;
  onChange: (v: AuthoringContent) => void;
  disabled: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const draft = confirmationDraft(content);
  const patch = (part: Partial<AuthoringConfirmationDraft>) =>
    onChange({ ...content, confirmation: null, confirmationDraft: { ...draft, ...part } });
  const toggle = (key: 'periodsAreBarsConfirmed' | 'noExtraRiskConfirmed', label: string) => (
    <Choices
      label={label}
      value={draft[key] ? 'yes' : 'no'}
      disabled={disabled}
      onChange={(v) => patch({ [key]: v === 'yes' })}
      options={[
        { value: 'no', label: '尚未确认' },
        { value: 'yes', label: '我已确认' },
      ]}
    />
  );
  return (
    <Section title="交易约束确认">
      <Copy>
        {content.confirmation ? '当前约束已确认；修改后需重新确认。' : '请逐项确认后生成。'}
      </Copy>
      <Copy>目录标的 {draft.instrument?.symbol ?? '未选择'}</Copy>
      {!disabled ? (
        <InstrumentPicker
          onConfirmed={(v) => {
            const market = ['SH', 'SZ', 'BJ', 'OF'].includes(v.market) ? 'CN' : v.market;
            if (
              !['CN', 'HK', 'US'].includes(market) ||
              !['STOCK', 'ETF', 'MUTUAL_FUND'].includes(v.instrumentType)
            ) {
              setMessage('当前编写仅支持境内、香港、美国的股票、场内基金与净值基金。');
              return;
            }
            let assetType: 'stock' | 'etf' | 'fund' = 'stock';
            if (v.instrumentType === 'ETF') assetType = 'etf';
            else if (v.instrumentType === 'MUTUAL_FUND') assetType = 'fund';
            patch({
              instrumentId: v.id,
              instrument: { symbol: v.symbol, market: market as 'CN' | 'HK' | 'US', assetType },
            });
          }}
        />
      ) : null}
      <Field
        label="信号周期"
        value={draft.timeframe}
        editable={!disabled}
        onChange={(timeframe) => patch({ timeframe })}
      />
      <Field
        label="入场条件确认"
        value={draft.entrySummary}
        editable={!disabled}
        multiline
        onChange={(entrySummary) => patch({ entrySummary })}
      />
      <Field
        label="退出条件确认"
        value={draft.exitSummary}
        editable={!disabled}
        multiline
        onChange={(exitSummary) => patch({ exitSummary })}
      />
      <Choices
        label="仓位方式"
        value={draft.sizingType}
        disabled={disabled}
        onChange={(sizingType) => patch({ sizingType })}
        options={[
          { value: 'fixedAmount', label: '固定金额' },
          { value: 'fixedQuantity', label: '固定数量' },
          { value: 'percentOfEquity', label: '权益比例' },
          { value: 'targetWeight', label: '目标权重' },
        ]}
      />
      <Field
        label="仓位数值（比例为 0～1）"
        value={draft.sizingValue}
        editable={!disabled}
        onChange={(sizingValue) => patch({ sizingValue })}
      />
      <Choices
        label="风险规则"
        value={draft.riskMode}
        disabled={disabled}
        onChange={(riskMode) => patch({ riskMode })}
        options={[
          { value: 'none', label: '无额外规则' },
          { value: 'fixedStop', label: '固定止损' },
          { value: 'custom', label: '完整风险规则' },
        ]}
      />
      {draft.riskMode === 'fixedStop' ? (
        <Field
          label="止损比例（0～1）"
          value={draft.riskPercent}
          editable={!disabled}
          onChange={(riskPercent) => patch({ riskPercent })}
        />
      ) : null}
      {draft.riskMode === 'custom' ? (
        <Field
          label="风险规则 JSON"
          value={draft.riskText}
          multiline
          editable={!disabled}
          onChange={(riskText) => patch({ riskText })}
        />
      ) : null}
      {draft.riskMode === 'none' ? toggle('noExtraRiskConfirmed', '不设置额外风险规则') : null}
      <Choices
        label="成交时机"
        value={draft.executionMode}
        disabled={disabled}
        onChange={(executionMode) => patch({ executionMode })}
        options={[
          { value: 'exchange', label: '下一可交易开盘市价' },
          { value: 'nav', label: '下一可用净值申购赎回' },
        ]}
      />
      <Field
        label="佣金比例"
        value={draft.commissionRate}
        editable={!disabled}
        onChange={(commissionRate) => patch({ commissionRate })}
      />
      <Field
        label="滑点比例"
        value={draft.slippageRate}
        editable={!disabled}
        onChange={(slippageRate) => patch({ slippageRate })}
      />
      {toggle('periodsAreBarsConfirmed', '周期按 K 线根数计算')}
      <Action
        label="确认交易约束"
        disabled={disabled}
        onPress={() => {
          try {
            onChange({ ...content, confirmation: parseConfirmationDraft(draft, content) });
            setMessage('交易约束已确认，请保存草稿。');
          } catch (e) {
            setMessage(failureMessage(e));
          }
        }}
      />
      <Feedback message={message} />
    </Section>
  );
}
