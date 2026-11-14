import { Choices, Copy, Field, Section } from '../../components/MobilePrimitives';
import type { BacktestForm } from './backtest-intent';
export function BacktestInputFields({
  value,
  onChange,
  kind,
  disabled,
  instrumentLabel,
  priceResearch = false,
}: {
  value: BacktestForm;
  onChange: (v: BacktestForm) => void;
  kind: 'ordinary' | 'nav';
  disabled: boolean;
  instrumentLabel?: string | undefined;
  priceResearch?: boolean;
}) {
  const patch = (part: Partial<BacktestForm>) => onChange({ ...value, ...part });
  const toggle = (field: 'calendarConfirmed' | 'domesticConfirmed', label: string) => (
    <Choices
      label={label}
      value={value[field] ? 'yes' : 'no'}
      disabled={disabled}
      onChange={(v) => patch({ [field]: v === 'yes' })}
      options={[
        { value: 'no', label: '尚未确认' },
        { value: 'yes', label: '明确确认' },
      ]}
    />
  );
  return (
    <>
      <Field
        label="回测开始日期"
        value={value.start}
        editable={!disabled}
        onChange={(start) => patch({ start })}
      />
      <Field
        label="回测结束日期"
        value={value.end}
        editable={!disabled}
        onChange={(end) => patch({ end })}
      />
      <Field
        label="初始资金"
        value={value.cash}
        editable={!disabled}
        keyboardType="decimal-pad"
        onChange={(cash) => patch({ cash })}
      />
      <Choices
        label="回测币种"
        value={value.currency}
        disabled={disabled || kind === 'nav'}
        onChange={(currency) => patch({ currency })}
        options={[
          { value: 'CNY', label: '人民币' },
          { value: 'HKD', label: '港币' },
          { value: 'USD', label: '美元' },
        ]}
      />
      {!priceResearch && <Field
        label="执行模型配置 JSON"
        value={value.model}
        multiline
        editable={!disabled}
        onChange={(model) => patch({ model })}
      />}
      {!priceResearch && <Copy muted>填写与价格、数量、成本和交易时序匹配的完整执行模型。准备前请核对全部假设。</Copy>}
      {kind === 'ordinary' ? (
        <>
          {priceResearch ? <>
            <Copy>策略收益研究：后复权计算指标和模型收益，具体价格条件采用不复权行情。</Copy>
            <Copy muted>研究资金、研究单位和所用价格版本随本次输入冻结。</Copy>
          </> : <>
            <Choices label="价格复权口径" value={value.adjustment} disabled={disabled}
              onChange={(adjustment) => patch({ adjustment })}
              options={[{ value: 'qfq', label: '前复权' }, { value: 'hfq', label: '后复权' }]} />
            <Choices label="历史输入性质" value={value.history} disabled={disabled}
              onChange={(history) => patch({ history })}
              options={[{ value: 'fixed-provider-snapshot', label: '固定供应商快照' }, { value: 'point-in-time', label: '严格历史时点' }]} />
            {value.history === 'point-in-time' && <Field label="历史重建证据引用" value={value.evidence}
              editable={!disabled} onChange={(evidence) => patch({ evidence })} />}
            <Field label="可选研究决策 JSON" value={value.extras} multiline editable={!disabled}
              onChange={(extras) => patch({ extras })} />
          </>}
        </>
      ) : (
        <Section title="净值研究决策">
          <Copy>基金 {instrumentLabel ?? value.symbol} · 净值来源与冻结时点由服务端返回。</Copy>
          <Choices
            label="基金类别"
            value={value.fundType}
            disabled={disabled}
            onChange={(fundType) =>
              patch({ fundType, calendarConfirmed: false, domesticConfirmed: false })
            }
            options={[
              { value: 'domestic', label: '境内普通基金' },
              { value: 'qdii', label: 'QDII 基金' },
            ]}
          />
          <Field
            label="净值研究日历决策 JSON"
            value={value.calendar}
            multiline
            editable={!disabled}
            onChange={(calendar) => patch({ calendar, calendarConfirmed: false })}
          />
          {toggle('calendarConfirmed', '净值研究日历确认')}
          {value.fundType === 'domestic' ? (
            <>
              <Field
                label="境内基金 T+1 研究决策 JSON"
                value={value.domestic}
                multiline
                editable={!disabled}
                onChange={(domestic) => patch({ domestic, domesticConfirmed: false })}
              />
              {toggle('domesticConfirmed', '境内基金研究假设确认')}
            </>
          ) : null}
        </Section>
      )}
    </>
  );
}
