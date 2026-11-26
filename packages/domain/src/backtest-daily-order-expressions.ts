import type { NumericExpression } from './backtest-strategy.js';

/** 正式策略已校验；旧执行结构没有委托价格依赖。 */
export function dailyOrderPriceExpressions(execution: unknown) {
  if (
    !execution ||
    typeof execution !== 'object' ||
    !('timing' in execution) ||
    execution.timing !== 'dailyBarOrders' ||
    !('orders' in execution) ||
    !Array.isArray(execution.orders)
  )
    return [];
  return execution.orders.flatMap(
    (template: { order: { kind: string; price?: NumericExpression } }, index: number) =>
      template.order.kind === 'market'
        ? []
        : [
            {
              expression: template.order.price!,
              path: ['execution', 'orders', index, 'order', 'price'] satisfies Array<
                string | number
              >,
            },
          ],
  );
}
