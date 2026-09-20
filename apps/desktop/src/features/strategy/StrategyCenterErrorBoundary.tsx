import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { strategyCenterPath } from './strategy-center.navigation.js';

type BoundaryProps = {
  children: ReactNode;
  locationKey: string;
  onSafeReturn: () => void;
};

type BoundaryState = {
  error: Error | null;
  retryKey: number;
};

class StrategyCenterBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('策略中心页面渲染失败', error, info);
  }

  componentDidUpdate(previousProps: BoundaryProps) {
    if (previousProps.locationKey !== this.props.locationKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  retry = () => {
    this.setState((current) => ({ error: null, retryKey: current.retryKey + 1 }));
  };

  render() {
    if (!this.state.error) {
      return <div key={this.state.retryKey}>{this.props.children}</div>;
    }

    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>策略中心页面暂时无法显示</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>页面渲染遇到异常。你的数据没有因此被当作空数据处理。</p>
          <p className="text-xs">{this.state.error.message || '未知渲染错误'}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={this.retry}>
              重试
            </Button>
            <Button size="sm" variant="outline" onClick={this.props.onSafeReturn}>
              返回策略库
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
}

export function StrategyCenterErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <StrategyCenterBoundary
      locationKey={`${location.pathname}${location.search}`}
      onSafeReturn={() => void navigate(strategyCenterPath.library)}
    >
      {children}
    </StrategyCenterBoundary>
  );
}
