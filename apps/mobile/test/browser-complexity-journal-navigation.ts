// 只提供受控路由上下文，导航不发起业务请求。
export const params = {
  accountId: '00000000-0000-4000-8000-000000000010',
  mode: 'actual' as const,
  kind: 'object' as const,
  runId: '00000000-0000-4000-8000-000000000011',
  toolCallId: '00000000-0000-4000-8000-000000000003',
};
export function useRoute() {
  return { params };
}
export function useNavigation() {
  return {
    navigate(name: string, destination: unknown) {
      document.documentElement.dataset.journalNavigation = JSON.stringify({
        name,
        params: destination,
      });
      window.dispatchEvent(new Event('controlled-journal-evidence'));
    },
  };
}
