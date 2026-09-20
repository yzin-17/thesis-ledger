import { useEffect, useRef, type MutableRefObject } from 'react';

export type ActiveRequestToken = {
  id: symbol;
  session: symbol;
};

export const isActiveRequestToken = (
  activeIds: ReadonlySet<symbol>,
  currentSession: symbol,
  lifecycleActive: boolean,
  token: ActiveRequestToken,
) => lifecycleActive && token.session === currentSession && activeIds.has(token.id);

export type RequestLifecycle = {
  beginRequest: () => ActiveRequestToken;
  finishRequest: (token: ActiveRequestToken) => void;
  requestIsActive: (token: ActiveRequestToken) => boolean;
  requestIsCurrent: (
    token: ActiveRequestToken,
    generation: number,
    symbol: string,
  ) => boolean;
  activeRequestIdsRef: MutableRefObject<Set<symbol>>;
};

export const useMarketChartRefreshLifecycle = (
  symbol: string,
  requestGeneration: number,
): RequestLifecycle => {
  const activeRequestIdsRef = useRef(new Set<symbol>());
  const requestSessionRef = useRef(Symbol());
  const lifecycleActiveRef = useRef(true);
  const lifecycleRevisionRef = useRef(0);
  const requestContextRef = useRef({ symbol, requestGeneration: 0 });
  requestContextRef.current = { symbol, requestGeneration };

  const beginRequest = () => {
    const token = { id: Symbol(), session: requestSessionRef.current };
    activeRequestIdsRef.current.add(token.id);
    return token;
  };
  const finishRequest = (token: ActiveRequestToken) => {
    activeRequestIdsRef.current.delete(token.id);
  };
  const requestIsActive = (token: ActiveRequestToken) =>
    isActiveRequestToken(
      activeRequestIdsRef.current,
      requestSessionRef.current,
      lifecycleActiveRef.current,
      token,
    );
  const requestIsCurrent = (
    token: ActiveRequestToken,
    generation: number,
    requestSymbol: string,
  ) =>
    requestIsActive(token) &&
    requestContextRef.current.requestGeneration === generation &&
    requestContextRef.current.symbol === requestSymbol;

  useEffect(() => {
    lifecycleRevisionRef.current += 1;
    lifecycleActiveRef.current = true;
    requestContextRef.current = { symbol, requestGeneration };
    return () => {
      lifecycleActiveRef.current = false;
      const cleanupRevision = ++lifecycleRevisionRef.current;
      queueMicrotask(() => {
        if (lifecycleRevisionRef.current !== cleanupRevision) return;
        requestSessionRef.current = Symbol();
        activeRequestIdsRef.current.clear();
      });
    };
  }, [requestGeneration, symbol]);

  return {
    beginRequest,
    finishRequest,
    requestIsActive,
    requestIsCurrent,
    activeRequestIdsRef,
  };
};
