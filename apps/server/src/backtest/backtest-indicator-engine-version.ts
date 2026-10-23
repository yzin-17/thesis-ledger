export const indicatorEngineChanged = (previous: string | null, current?: string) =>
  /^thesis-ledger-v3-local-runner-v\d+$/.test(previous ?? '') &&
  /^thesis-ledger-v3-local-runner-v\d+$/.test(current ?? '') &&
  previous !== current;

export const indicatorEngineVersionMessage =
  '指标计算版本已更新；此 Run 保留原版本，请使用冻结输入创建新的 Run';
