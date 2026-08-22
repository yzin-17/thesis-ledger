import type {
  MarketDetailRequest as SharedMarketDetailRequest,
  MarketDetailResponse,
} from '@thesis-ledger/api-client';

export type MarketDetailRequest = SharedMarketDetailRequest;

export type MarketDetailFetcher = (
  request: MarketDetailRequest,
  signal: AbortSignal,
) => Promise<MarketDetailResponse>;

type Flight = {
  controller: AbortController;
  promise: Promise<MarketDetailResponse>;
  consumers: number;
  state: { settled: boolean };
};

export const marketDetailRequestKey = (request: MarketDetailRequest) =>
  JSON.stringify({
    symbol: request.symbol,
    include: request.include ? [...request.include].sort() : null,
    barsLimit: request.barsLimit ?? 30,
    navLimit: request.navLimit ?? 30,
    refresh: request.refresh === true,
  });

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException('行情详情请求已取消', 'AbortError');

export class MarketDetailRequestCoordinator {
  private readonly flights = new Map<string, Flight>();

  request(
    request: MarketDetailRequest,
    fetcher: MarketDetailFetcher,
    signal?: AbortSignal,
  ): Promise<MarketDetailResponse> {
    const key = marketDetailRequestKey(request);
    let flight = this.flights.get(key);
    if (flight?.controller.signal.aborted) {
      if (this.flights.get(key) === flight) this.flights.delete(key);
      flight = undefined;
    }
    if (!flight) {
      const controller = new AbortController();
      const state = { settled: false };
      const promise = Promise.resolve()
        .then(() => fetcher(request, controller.signal))
        .finally(() => {
          state.settled = true;
          if (this.flights.get(key)?.promise === promise) this.flights.delete(key);
        });
      flight = { controller, promise, consumers: 0, state };
      this.flights.set(key, flight);
    }

    const activeFlight = flight;
    activeFlight.consumers += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeFlight.consumers = Math.max(0, activeFlight.consumers - 1);
      if (activeFlight.consumers === 0 && !activeFlight.state.settled) {
        activeFlight.controller.abort();
        void activeFlight.promise.catch(() => undefined);
      }
    };

    if (!signal) return activeFlight.promise.finally(release);

    const consumerSignal = signal;
    if (consumerSignal.aborted) {
      release();
      return Promise.reject(abortReason(consumerSignal));
    }

    return new Promise<MarketDetailResponse>((resolve, reject) => {
      const onAbort = () => {
        release();
        reject(abortReason(consumerSignal));
      };
      consumerSignal.addEventListener('abort', onAbort, { once: true });
      activeFlight.promise.then(
        (value) => {
          if (released) return;
          consumerSignal.removeEventListener('abort', onAbort);
          release();
          resolve(value);
        },
        (error: unknown) => {
          if (released) return;
          consumerSignal.removeEventListener('abort', onAbort);
          release();
          reject(error instanceof Error ? error : new Error('行情详情请求失败'));
        },
      );
    });
  }

  get size() {
    return this.flights.size;
  }
}
