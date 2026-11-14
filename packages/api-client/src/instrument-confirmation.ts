type InstrumentConfirmation = {
  confirmable: boolean;
  confirmed?: boolean | undefined;
  disabledReason?: string | null | undefined;
};

/** 确认能力与已保存身份分别投影，目录状态不能改变持仓选择资格。 */
export function instrumentConfirmationPresentation(instrument: InstrumentConfirmation) {
  if (!instrument.confirmable) {
    let description = '该标的暂不支持持仓关联。';
    if (instrument.disabledReason === 'unsupported_market') description = '当前市场暂不支持持仓关联。';
    else if (instrument.disabledReason === 'unsupported_instrument_type') description = '当前证券类型暂不支持持仓关联。';
    return { status: 'unsupported' as const, label: '不支持关联', description };
  }
  if (instrument.confirmed === true)
    return { status: 'confirmed' as const, label: '已确认', description: '证券身份已确认，可用于新增持仓。' };
  return { status: 'unconfirmed' as const, label: '确认标的', description: '确认证券身份后可用于新增持仓。' };
}
