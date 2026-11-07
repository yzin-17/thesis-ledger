// 只适配导航环境；不激活页面请求，点击详情时记录原组件传入的目的地。
export function useIsFocused() {
  return false;
}
export function useNavigation() {
  return {
    navigate(name: string, params: unknown) {
      document.documentElement.dataset.watchlistNavigation = JSON.stringify({ name, params });
    },
  };
}
