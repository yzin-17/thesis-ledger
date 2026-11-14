import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';

export function ArenaSections({ children }: { children: ReactNode }) {
  return <div className="grid min-w-0 gap-6">
    {Children.toArray(children).map((child, index) => <Fragment key={isValidElement(child) ? child.key : index}>
      {index > 0 && <Separator />}
      {child}
    </Fragment>)}
  </div>;
}
