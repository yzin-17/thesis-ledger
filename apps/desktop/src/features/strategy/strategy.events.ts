import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { strategyKeys } from './strategy.queries.js';
import type { BacktestJobSummary } from './strategy.types.js';

type BacktestEventHandlers = {
  onOpen: () => void;
  onUpdate: (summary: BacktestJobSummary) => void;
  onInvalid: () => void;
};

type BacktestEventSource = Pick<EventSource, 'addEventListener' | 'close'> & {
  onopen: ((event: Event) => void) | null;
};

export const createBacktestEventConnection = (
  createSource: () => BacktestEventSource = () => new EventSource('/api/v1/backtests/events'),
) => {
  const subscribers = new Set<BacktestEventHandlers>();
  let source: BacktestEventSource | null = null;

  const connect = () => {
    if (source) return;
    source = createSource();
    source.onopen = () => subscribers.forEach((subscriber) => subscriber.onOpen());
    source.addEventListener('backtest.job.updated', (event) => {
      try {
        const incoming = JSON.parse((event as MessageEvent<string>).data) as BacktestJobSummary;
        subscribers.forEach((subscriber) => subscriber.onUpdate(incoming));
      } catch {
        subscribers.forEach((subscriber) => subscriber.onInvalid());
      }
    });
  };

  return {
    subscribe(handlers: BacktestEventHandlers) {
      subscribers.add(handlers);
      connect();
      return () => {
        subscribers.delete(handlers);
        if (subscribers.size === 0) {
          source?.close();
          source = null;
        }
      };
    },
  };
};

const backtestEventConnection = createBacktestEventConnection();

export const applyBacktestJobSummaryEvent = (
  current: BacktestJobSummary[] | undefined,
  incoming: BacktestJobSummary,
) => {
  if (!current) return [incoming];
  const index = current.findIndex((job) => job.id === incoming.id);
  if (index < 0) return [incoming, ...current];
  return current.map((job, jobIndex) => (jobIndex === index ? incoming : job));
};

export const useBacktestJobEvents = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    return backtestEventConnection.subscribe({
      onOpen: () => {
        void queryClient.invalidateQueries({ queryKey: strategyKeys.jobs() });
      },
      onUpdate: (incoming) => {
        queryClient.setQueryData<BacktestJobSummary[]>(strategyKeys.jobs(), (current) =>
          applyBacktestJobSummaryEvent(current, incoming),
        );
        queryClient.setQueryData(strategyKeys.job(incoming.id), (current: unknown) => {
          if (!current || typeof current !== 'object') return current;
          return { ...current, ...incoming };
        });
      },
      onInvalid: () => {
        void queryClient.invalidateQueries({ queryKey: strategyKeys.jobs() });
      },
    });
  }, [queryClient]);
};
