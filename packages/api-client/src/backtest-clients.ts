import { backtestNavRunClient } from './backtest-nav-run-client.js';
import { backtestRunConfigClient } from './backtest-run-config-client.js';
import { backtestRunClient } from './backtest-run-client.js';
import type { ParsedRequest, ParsedPost } from './parsed-request.js';
import { checkedBacktestPreparation } from './backtest-preparation-client.js';

export function backtestClients(request: ParsedRequest) {
  const post: ParsedPost = (path, body, schema, signal) =>
    request(path, schema, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  const config = backtestRunConfigClient(post);
  return {
    ...backtestNavRunClient(request, post),
    ...config,
    ...backtestRunClient(request, post),
    prepareCheckedRunConfig: checkedBacktestPreparation(config),
  };
}
