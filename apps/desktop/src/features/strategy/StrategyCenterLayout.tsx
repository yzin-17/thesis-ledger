import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '../shared/PageHeader.js';
import type { StrategyCenterTab } from './strategy-center.navigation.js';

const entries = [
  { value: 'library', to: '/strategy/library', label: '策略库' },
  { value: 'jobs', to: '/strategy/jobs', label: '回测任务' },
  { value: 'experiments', to: '/strategy/experiments', label: 'AI 实验' },
] as const;

export function StrategyCenterLayout({
  children,
  actions,
  value,
  onValueChange,
}: {
  children: ReactNode;
  actions?: ReactNode;
  value: StrategyCenterTab;
  onValueChange: (value: StrategyCenterTab) => void;
}) {
  return (
    <section className="module-page">
      <PageHeader
        eyebrow="STRATEGY CENTER"
        title="策略中心"
        description="管理策略版本、回测任务与 AI 优化实验。"
        actions={actions}
      />
      <Tabs
        value={value}
        onValueChange={(nextValue) => onValueChange(nextValue as StrategyCenterTab)}
      >
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto"
          aria-label="策略中心"
        >
          {entries.map(({ value, to, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              nativeButton={false}
              render={<NavLink to={to} onClick={() => onValueChange(value)} />}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="pt-3">{children}</div>
    </section>
  );
}
