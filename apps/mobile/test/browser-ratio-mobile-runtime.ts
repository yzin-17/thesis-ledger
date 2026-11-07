import { getMobileTheme } from '../src/theme';

// 仅提供原生运行环境的主题；实际业务组件与展示函数均使用源码。
const theme = getMobileTheme('light', 'red-up');
export function useMobileRuntime() {
  return {
    theme,
    scope: ['ratio-display-sample'],
    api: {
      market: {
        getFundDailyError() {
          throw new Error('隔离缓存不应发起读取');
        },
      },
    },
  };
}
