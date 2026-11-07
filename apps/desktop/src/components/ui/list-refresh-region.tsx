import { useLayoutEffect, useRef, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { readableRefreshTop } from './list-refresh-placement';
import { Spinner } from './spinner';

function ListRefreshIndicator({ label, avoidText }: { label: string; avoidText: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const indicator = indicatorRef.current;
    if (!frame || !indicator || typeof IntersectionObserver === 'undefined') return;
    // 抽屉、滚动容器和长列表都按当前可见的交集居中。
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      const { boundingClientRect: bounds, intersectionRect: visible } = entry;
      indicator.style.left = `${visible.left - bounds.left + visible.width / 2}px`;
      const top =
        avoidText && frame.parentElement
          ? readableRefreshTop(frame.parentElement, visible)
          : visible.top + visible.height / 2;
      indicator.style.top = `${top - bounds.top}px`;
    });
    const measure = () => {
      observer.unobserve(frame);
      observer.observe(frame);
    };
    observer.observe(frame);
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    resize?.observe(frame);
    window.addEventListener('scroll', measure, { capture: true, passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      resize?.disconnect();
      observer.disconnect();
    };
  }, [avoidText]);

  return (
    <div
      ref={frameRef}
      data-slot="list-refresh"
      role="status"
      aria-label={label}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[inherit]"
    >
      <span
        ref={indicatorRef}
        className="absolute left-1/2 top-1/2 flex size-8 -translate-1/2 items-center justify-center rounded-full bg-background/95 text-foreground shadow-sm ring-1 ring-border"
      >
        <Spinner className="size-5" aria-hidden="true" />
      </span>
    </div>
  );
}

export function ListRefreshRegion({
  refreshing,
  label = '正在刷新列表',
  avoidText = false,
  className,
  children,
  ...props
}: ComponentProps<'div'> & {
  refreshing: boolean;
  label?: string | undefined;
  avoidText?: boolean | undefined;
}) {
  return (
    <div
      {...props}
      data-slot="list-refresh-region"
      aria-busy={refreshing}
      className={cn('relative isolate min-w-0 empty:hidden', className)}
    >
      {children}
      {refreshing && <ListRefreshIndicator label={label} avoidText={avoidText} />}
    </div>
  );
}
