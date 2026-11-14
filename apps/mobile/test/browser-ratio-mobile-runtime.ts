import { getMobileTheme } from '../src/theme';

// 仅提供原生运行环境的主题；实际业务组件与展示函数均使用源码。
const theme = getMobileTheme('light', 'red-up');
export function useMobileRuntime() {
  return {
    theme,
    scope: ['ratio-display-sample'],
    api: {
      strategy: {
        definitions: {
          list: () => fetch('/api/qa/strategies').then((response) => response.json()),
          createVersion: (_id: string, schema: unknown) =>
            fetch('/api/qa/versions', {
              method: 'POST',
              body: JSON.stringify({ schema }),
            }).then(async (response) => {
              if (!response.ok) throw Error('受控版本保存失败');
              return response.json();
            }),
        },
        optimization: {
          resolveExecutionModel: (body: unknown) =>
            fetch('/api/qa/execution-model', {
              method: 'POST',
              body: JSON.stringify(body),
            }).then((response) => response.json()),
        },
      },
      market: {
        getFundDailyError() {
          throw new Error('隔离缓存不应发起读取');
        },
      },
    },
  };
}
