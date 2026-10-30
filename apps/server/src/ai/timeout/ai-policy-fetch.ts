import { getGlobalDispatcher, type Dispatcher } from 'undici';

// 保留宿主已配置的代理和连接池；AI阶段与任务期限拥有等待判断。
const dispatcher = {
  dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) {
    return getGlobalDispatcher().dispatch(
      { ...options, headersTimeout: 0, bodyTimeout: 0 },
      handler,
    );
  },
};

export const aiPolicyFetch: typeof fetch = (input, init) => {
  const options: RequestInit & { dispatcher: typeof dispatcher } = { ...init, dispatcher };
  return globalThis.fetch(input, options);
};
