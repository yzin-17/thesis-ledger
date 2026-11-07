import { getMobileTheme } from '../src/theme';
// 受控 Web 环境提供主题和身份范围；实际页面、原生基础组件与投影均使用源码。
const theme = getMobileTheme('light', 'red-up');
const unexpected = () => {
  throw new Error('隔离自选缓存不应发起业务请求');
};
export function useMobileRuntime() {
  return {
    theme,
    baseUrl: 'watchlist-number-browser',
    mode: 'actual',
    scope: ['watchlist-number-browser'],
    api: {
      request: unexpected,
      watchlist: { list: unexpected, prices: unexpected, change: unexpected, add: unexpected },
    },
  };
}
