import type * as React from 'react';
import type { Input } from '@/components/ui/input';

export type DateInputType = 'date' | 'datetime-local' | 'month';
export type DateInputProps = Omit<React.ComponentPropsWithoutRef<typeof Input>, 'type'> & {
  type: DateInputType;
};
