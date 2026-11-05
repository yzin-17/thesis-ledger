import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { Account, PortfolioMode } from './portfolio.types.js';

export function AccountModeLinkNotice({
  accounts,
  mode,
}: {
  accounts: Account[];
  mode: PortfolioMode;
}) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const requestedId = params.get('accountId');
  const requestedMode = params.get('mode');
  const accountMode = accounts.find((account) => account.id === requestedId)?.mode;
  const conflict =
    accountMode ??
    (requestedMode === 'actual' || requestedMode === 'shadow' ? requestedMode : undefined);
  const [notice, setNotice] = useState<{
    pathname: string;
    mode: PortfolioMode;
    source: PortfolioMode;
  } | null>(null);
  useEffect(() => {
    if (conflict && conflict !== mode)
      setNotice({ pathname: location.pathname, mode, source: conflict });
  }, [conflict, mode, location.pathname, requestedId]);
  if (!notice || notice.pathname !== location.pathname || notice.mode !== mode) return null;
  return (
    <Alert className="mb-4">
      <AlertTitle>链接与当前账户范围不同</AlertTitle>
      <AlertDescription>
        <p>
          链接属于{notice.source === 'shadow' ? '模拟' : '实际'}范围；当前仍为
          {mode === 'shadow' ? '模拟' : '实际'}
          。如需查看原对象，请使用全局开关切换范围，历史对象归属不变。
        </p>
        <Button variant="outline" size="sm" onClick={() => setNotice(null)}>
          知道了
        </Button>
      </AlertDescription>
    </Alert>
  );
}
