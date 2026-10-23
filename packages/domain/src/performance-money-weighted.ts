export interface CashFlow {
  date: string;
  amount: number;
}
type DatedFlow = { years: number; amount: number };
const yearMs = 31_557_600_000;
const minLogRate = Math.log(Number.EPSILON);
const maxLogRate = 36;
const failure = (reason: string): never => {
  throw new Error(`资金加权收益率${reason}`);
};

const prepare = (flows: readonly CashFlow[]): DatedFlow[] => {
  if (
    flows.length < 2 ||
    flows.some((flow) => !Number.isFinite(flow.amount) || !Number.isFinite(Date.parse(flow.date)))
  )
    return failure('输入金额或日期无效');
  const scale = flows.reduce((maximum, flow) => Math.max(maximum, Math.abs(flow.amount)), 0);
  if (scale === 0) return failure('至少需要一笔流入和一笔流出');
  const grouped = new Map<number, { sum: number; compensation: number }>();
  for (const flow of flows) {
    const time = Date.parse(flow.date);
    const current = grouped.get(time) ?? { sum: 0, compensation: 0 };
    const value = flow.amount / scale;
    const next = current.sum + value;
    current.compensation +=
      Math.abs(current.sum) >= Math.abs(value)
        ? current.sum - next + value
        : value - next + current.sum;
    current.sum = next;
    grouped.set(time, current);
  }
  const ordered = [...grouped]
    .map(([time, value]) => ({ time, amount: value.sum + value.compensation }))
    .filter((flow) => flow.amount !== 0)
    .sort((left, right) => left.time - right.time);
  if (
    ordered.length < 2 ||
    !ordered.some((flow) => flow.amount < 0) ||
    !ordered.some((flow) => flow.amount > 0)
  )
    return failure('至少需要不同时间的一笔流入和一笔流出');
  const renormalize = ordered.reduce(
    (maximum, flow) => Math.max(maximum, Math.abs(flow.amount)),
    0,
  );
  const start = ordered[0]!.time;
  return ordered.map((flow) => ({
    years: (flow.time - start) / yearMs,
    amount: flow.amount / renormalize,
  }));
};

const scaledNpv = (flows: readonly DatedFlow[], logRate: number) => {
  const maximum = flows.reduce((value, flow) => Math.max(value, -flow.years * logRate), 0);
  return flows.reduce(
    (total, flow) => total + flow.amount * Math.exp(-flow.years * logRate - maximum),
    0,
  );
};

const verifiedRate = (flows: readonly DatedFlow[], logRate: number) => {
  const rate = Math.expm1(logRate);
  if (!Number.isFinite(rate) || rate <= -1) return undefined;
  const contributions = flows.map((flow) => flow.amount * Math.exp(-flow.years * Math.log1p(rate)));
  const residual = contributions.reduce((total, value) => total + value, 0);
  const scale = flows.reduce((total, flow) => total + Math.abs(flow.amount), 0);
  return contributions.every(Number.isFinite) && Math.abs(residual) <= scale * 1e-12
    ? rate
    : undefined;
};

const bracketRoot = (flows: readonly DatedFlow[], left: number, right: number) => {
  let lower = left;
  let upper = right;
  let lowerValue = scaledNpv(flows, lower);
  const upperValue = scaledNpv(flows, upper);
  for (const bound of [lower, upper]) {
    const root = verifiedRate(flows, bound);
    if (root !== undefined) return root;
  }
  if (
    !Number.isFinite(lowerValue) ||
    !Number.isFinite(upperValue) ||
    Math.sign(lowerValue) === Math.sign(upperValue)
  )
    return undefined;
  for (let iteration = 0; iteration < 192; iteration += 1) {
    const middle = lower + (upper - lower) / 2;
    const root = verifiedRate(flows, middle);
    if (root !== undefined) return root;
    if (middle === lower || middle === upper) return undefined;
    const value = scaledNpv(flows, middle);
    if (!Number.isFinite(value)) return undefined;
    if (Math.sign(value) === Math.sign(lowerValue)) {
      lower = middle;
      lowerValue = value;
    } else upper = middle;
  }
  return undefined;
};

export const xirr = (flows: readonly CashFlow[], guess = 0.1): number => {
  if (!Number.isFinite(guess) || guess <= -1) return failure('初值必须是大于 −1 的有限数');
  const ordered = prepare(flows);
  const changes = ordered
    .slice(1)
    .filter((flow, index) => Math.sign(flow.amount) !== Math.sign(ordered[index]!.amount)).length;
  if (changes === 1) {
    const root = bracketRoot(ordered, minLogRate, maxLogRate);
    return root === undefined
      ? failure('在有界范围内未找到通过残差校验的解，不能据此认定无解')
      : root;
  }
  const grid = [
    minLogRate,
    -24,
    -16,
    -12,
    -8,
    -6,
    -4,
    -3,
    -2,
    ...Array.from({ length: 401 }, (_, index) => -1 + index / 200),
    2,
    3,
    4,
    6,
    8,
    12,
    16,
    24,
    maxLogRate,
  ];
  const roots: number[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const root = bracketRoot(ordered, grid[index - 1]!, grid[index]!);
    if (
      root === undefined ||
      roots.some((previous) => Math.abs(previous - root) <= 1e-7 * Math.max(1, Math.abs(root)))
    )
      continue;
    roots.push(root);
    if (roots.length > 1) return failure('检测到多个有效根，结果不可用');
  }
  if (roots.length === 0) return failure('在有界范围内未找到通过残差校验的解，不能据此认定无解');
  return failure('现金流符号多次变化，无法确认候选根唯一，结果不可用');
};
