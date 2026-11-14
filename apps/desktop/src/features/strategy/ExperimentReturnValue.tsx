import { cn } from '@/lib/utils';
import { marketToneClass, type MarketTone } from '@/ui/market-color';
import { metricValue } from './strategy-experiment-detail.model.js';

export function ExperimentReturnValue({ metrics, keys = ['totalReturn', 'return'] }: {
  metrics: Record<string, unknown>;
  keys?: string[];
}) {
  const value = metricValue(metrics, keys, 'percent');
  let tone: MarketTone | undefined;
  // 共享比例格式化会保留极小非零值；按其规范化符号着色，避免浮点下溢。
  if (value !== '不可用' && value !== '0.00%') {
    tone = value.startsWith('-') ? 'down' : 'up';
  }
  return <span className={cn('mt-0 inline text-[length:inherit] text-inherit', marketToneClass(tone))}>{value}</span>;
}
