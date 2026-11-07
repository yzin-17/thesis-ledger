import {
  Component,
  Suspense,
  lazy,
  type ComponentType,
  type ComponentProps,
  type ElementType,
  type ReactNode,
} from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/spinner';

class PageFailure extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert variant="destructive">
        <AlertTitle>页面暂时无法打开</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>请重新加载页面，或从导航切换到其他页面。</p>
          <Button
            className="w-fit"
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            重新加载页面
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
}

type PageComponent = Exclude<ElementType, string>;
type PageProps<Page extends PageComponent> =
  ComponentProps<Page> extends object ? ComponentProps<Page> : Record<string, never>;

/** 应用页面的稳定加载合同；在 Module 顶层声明以保留缓存与组件身份。 */
export function createDeferredPage<Page extends PageComponent>(
  load: () => Promise<{ default: Page }>,
): ComponentType<PageProps<Page>> {
  const Content = lazy(load) as ComponentType<PageProps<Page>>;
  return function DeferredPage(props: PageProps<Page>) {
    return (
      <PageFailure>
        <Suspense fallback={<LoadingState label="正在打开页面" />}>
          <Content {...props} />
        </Suspense>
      </PageFailure>
    );
  };
}
