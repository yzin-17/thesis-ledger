export interface ValuationPoint {
  date: string;
  value: number;
  externalFlow?: number;
  externalFlowCount?: number;
  flowBoundary?: { before: number; after: number };
}

const validateValuation = (current: ValuationPoint) => {
  const flow = current.externalFlow ?? 0;
  if (
    !Number.isFinite(Date.parse(current.date)) ||
    !Number.isFinite(current.value) ||
    current.value < 0 ||
    !Number.isFinite(flow)
  )
    throw new Error('时间加权收益率估值或日期无效');
  if (
    current.externalFlowCount !== undefined &&
    (!Number.isInteger(current.externalFlowCount) || current.externalFlowCount < 0)
  )
    throw new Error('时间加权收益率现金流计数无效');
};

const valueBeforeFlow = (current: ValuationPoint) => {
  const flow = current.externalFlow ?? 0;
  const hasFlow = flow !== 0 || (current.externalFlowCount ?? 0) > 0;
  if (!hasFlow) return current.value;
  const boundary = current.flowBoundary;
  if (!boundary || (current.externalFlowCount ?? 1) > 1)
    throw new Error('缺少现金流发生时点的流前/流后估值边界，无法计算精确时间加权收益率');
  const tolerance = Math.max(1, Math.abs(flow), current.value) * 1e-10;
  if (
    ![boundary.before, boundary.after].every((value) => Number.isFinite(value) && value >= 0) ||
    Math.abs(boundary.after - current.value) > tolerance ||
    Math.abs(boundary.after - boundary.before - flow) > tolerance
  )
    throw new Error('现金流估值边界与金额或流后估值不一致');
  return boundary.before;
};

export const ttwror = (points: readonly ValuationPoint[]): number => {
  if (points.length < 2) throw new Error('时间加权收益率至少需要两个完整估值');
  let factor = 1;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    validateValuation(current);
    if (index === 0) continue;
    const previous = points[index - 1]!;
    if (Date.parse(current.date) <= Date.parse(previous.date))
      throw new Error('时间加权收益率估值时间必须递增');
    if (previous.value <= 0) throw new Error('时间加权收益率估值分母不为正数');
    factor *= valueBeforeFlow(current) / previous.value;
    if (!Number.isFinite(factor)) throw new Error('时间加权收益率计算超出有限数值范围');
  }
  return factor - 1;
};
