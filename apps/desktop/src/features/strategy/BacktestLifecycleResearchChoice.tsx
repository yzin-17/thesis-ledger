import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function BacktestLifecycleResearchChoice({
  selected,
  onChange,
}: {
  selected: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Field>
      <FieldLabel>上市边界与预热</FieldLabel>
      <ToggleGroup
        aria-label="上市边界与预热"
        value={[selected ? 'listed-bars' : 'original-start']}
        onValueChange={(values) => {
          if (values[0] === 'listed-bars') onChange(true);
          else if (values[0] === 'original-start') onChange(false);
        }}
      >
        <ToggleGroupItem value="original-start">保持起点前预热</ToggleGroupItem>
        <ToggleGroupItem value="listed-bars">上市后积累真实预热</ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription>
        上市后积累模式保留请求区间和原预热数量；取得上市日期并积累足够真实行情后才开始信号。窗口内始终不足时明确拒绝；上市日未知时不推迟起点，原起点前预热不足则拒绝。来源与实际信号起点随本次研究冻结。
      </FieldDescription>
    </Field>
  );
}
