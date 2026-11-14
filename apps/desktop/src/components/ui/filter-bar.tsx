import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 筛选条容器。
 *
 * 只统一三件事：栅格对齐（末行对齐输入框底边）、间距、条件回显位。
 * 需要几列由调用方通过 className 指定，因为各页字段数与优先级不同。
 */
function FilterBar({
  className,
  summary,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  /** 生效条件回显（chip、计数摘要等），自动占满整行。 */
  summary?: ReactNode;
}) {
  return (
    <div
      data-slot="filter-bar"
      className={cn('grid min-w-0 items-end gap-3', className)}
      {...props}
    >
      {children}
      {summary ? <div className="col-span-full min-w-0">{summary}</div> : null}
    </div>
  );
}

/**
 * 清空筛选。
 *
 * 全站唯一的清空入口：文案固定「清空筛选」，变体固定 `outline`。
 * 常驻渲染、无任何条件时禁用 —— 不做「有条件才显示」这种会让按钮忽隐忽现的处理。
 * `size` 可调是因为密集面板与常规筛选条密度不同，属于布局而非语义。
 */
function FilterReset({
  onReset,
  hasConditions = true,
  size,
  className,
}: {
  onReset: () => void;
  hasConditions?: boolean;
  size?: 'default' | 'xs' | 'sm' | 'lg';
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      onClick={onReset}
      disabled={!hasConditions}
    >
      清空筛选
    </Button>
  );
}

/**
 * 复合查询的「提交 + 清空」。
 *
 * 提交按钮是该区域唯一主操作（`default` 变体），一个筛选区只允许一个。
 * `applyLabel` 可按作用域区分（如「查询历史」「分析周期」），但同页不同作用域不得重名。
 * `applyType="submit"` 供仍用 `<form>` 承载回车提交的页面使用。
 */
function FilterActions({
  applyLabel = '搜索',
  applyType = 'button',
  onApply,
  onReset,
  hasConditions = true,
  busy = false,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
  applyLabel?: string;
  applyType?: 'button' | 'submit';
  onApply: () => void;
  onReset: () => void;
  /** 草稿或已生效条件任一非空即视为有条件，决定「清空筛选」是否可用。 */
  hasConditions?: boolean;
  busy?: boolean;
}) {
  return (
    <div
      data-slot="filter-actions"
      className={cn('flex flex-wrap gap-2', className)}
      {...props}
    >
      <Button type={applyType} onClick={onApply} aria-busy={busy || undefined} disabled={busy}>
        {applyLabel}
      </Button>
      <FilterReset onReset={onReset} hasConditions={hasConditions} />
    </div>
  );
}

export { FilterActions, FilterBar, FilterReset };
