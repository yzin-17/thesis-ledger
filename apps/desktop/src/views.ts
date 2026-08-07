export type DesktopView =
  | 'portfolio'
  | 'position-detail'
  | 'position-entry'
  | 'risk-center'
  | 'performance'
  | 'strategy'
  | 'journal'
  | 'providers'
  | 'automation'
  | 'ai-chat';

export type DesktopNavigationView = Exclude<DesktopView, 'position-detail' | 'automation'>;

export const desktopRoutes = [
  { view: 'portfolio', path: '/portfolio', label: '投资组合' },
  { view: 'position-entry', path: '/position-entry', label: '录入持仓' },
  { view: 'risk-center', path: '/risk-center', label: '风险中心' },
  { view: 'performance', path: '/performance', label: '收益分析' },
  { view: 'strategy', path: '/strategy', label: '策略实验' },
  { view: 'journal', path: '/journal', label: '投资复盘' },
  { view: 'ai-chat', path: '/ai-chat', label: '研究助手' },
  { view: 'providers', path: '/providers', label: '数据与自动化' },
] as const satisfies ReadonlyArray<{
  view: DesktopNavigationView;
  path: `/${string}`;
  label: string;
}>;

export const desktopNavigation: readonly DesktopNavigationView[] = desktopRoutes.map(
  ({ view }) => view,
);

export const desktopPathForView = (view: DesktopView) =>
  desktopRoutes.find((route) => route.view === view)?.path ?? null;
