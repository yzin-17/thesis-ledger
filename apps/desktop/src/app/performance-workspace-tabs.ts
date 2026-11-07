export const performanceWorkspaceTabs = ['overview', 'analysis', 'allocation', 'trades'] as const;
export type PerformanceWorkspaceTab = (typeof performanceWorkspaceTabs)[number];
export function performanceWorkspaceTab(search: string): PerformanceWorkspaceTab {
  const value = new URLSearchParams(search).get('tab');
  return performanceWorkspaceTabs.find((tab) => tab === value) ?? 'overview';
}
