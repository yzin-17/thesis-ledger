export interface ExecutionConstraint {
  tPlusOne: boolean;
  lotSize: number;
  commissionRate: number;
  minimumCommission: number;
  stampDutyRate: number;
  slippageRate: number;
}

export interface OrderCandidate {
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  previousClose: number;
  suspended?: boolean;
  boughtAt?: string;
  tradingDate: string;
}

export interface ExecutionDecision {
  accepted: boolean;
  quantity: number;
  fillPrice: number;
  fees: number;
  commission?: number;
  stampDuty?: number;
  slippageCost?: number;
  reason?: string;
}

export const simulateAStockExecution = (
  order: OrderCandidate,
  constraint: ExecutionConstraint,
): ExecutionDecision => {
  if (order.suspended)
    return { accepted: false, quantity: 0, fillPrice: order.price, fees: 0, reason: '停牌' };
  if (constraint.tPlusOne && order.side === 'sell' && order.boughtAt === order.tradingDate) {
    return { accepted: false, quantity: 0, fillPrice: order.price, fees: 0, reason: 'T+1 限制' };
  }
  const limitRatio = 0.1;
  if (Math.abs(order.price / order.previousClose - 1) > limitRatio + 1e-8) {
    return {
      accepted: false,
      quantity: 0,
      fillPrice: order.price,
      fees: 0,
      reason: '超出涨跌停价格',
    };
  }
  const quantity = Math.floor(order.quantity / constraint.lotSize) * constraint.lotSize;
  if (quantity <= 0)
    return {
      accepted: false,
      quantity: 0,
      fillPrice: order.price,
      fees: 0,
      reason: '不足最小交易单位',
    };
  const fillPrice = order.price * (1 + (order.side === 'buy' ? 1 : -1) * constraint.slippageRate);
  const turnover = quantity * fillPrice;
  const commission = Math.max(constraint.minimumCommission, turnover * constraint.commissionRate);
  const stampDuty = order.side === 'sell' ? turnover * constraint.stampDutyRate : 0;
  return {
    accepted: true,
    quantity,
    fillPrice,
    fees: commission + stampDuty,
    commission,
    stampDuty,
    slippageCost: Math.abs(fillPrice - order.price) * quantity,
  };
};
