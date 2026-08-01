export const assertNever = (value: never): never => {
  throw new Error(`未处理的值: ${String(value)}`);
};

export const roundMoney = (value: number, precision = 4): number => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export const groupBy = <T, K extends PropertyKey>(items: readonly T[], key: (item: T) => K) => {
  const result = new Map<K, T[]>();
  for (const item of items) {
    const group = result.get(key(item)) ?? [];
    group.push(item);
    result.set(key(item), group);
  }
  return result;
};
