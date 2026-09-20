import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const strategyCenterLayout = readFileSync(
  new URL('../src/features/strategy/StrategyCenterLayout.tsx', import.meta.url),
  'utf8',
);
const backtestJobs = readFileSync(
  new URL('../src/features/strategy/StrategyBacktestJobsPage.tsx', import.meta.url),
  'utf8',
);
const backtestDetail = readFileSync(
  new URL('../src/features/strategy/StrategyBacktestDetailPage.tsx', import.meta.url),
  'utf8',
);
const experimentList = readFileSync(
  new URL('../src/features/strategy/StrategyExperimentListPage.tsx', import.meta.url),
  'utf8',
);
const strategyLibrary = readFileSync(
  new URL('../src/features/strategy/StrategyLibraryPages.tsx', import.meta.url),
  'utf8',
);
const listPresentation = readFileSync(
  new URL('../src/features/strategy/StrategyListPresentation.tsx', import.meta.url),
  'utf8',
);
const baseStyles = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');
const buttonSource = readFileSync(
  new URL('../src/components/ui/button.tsx', import.meta.url),
  'utf8',
);
const appSource = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const dashboardSource = readFileSync(
  new URL('../src/features/strategy/StrategyDashboard.tsx', import.meta.url),
  'utf8',
);
const riskApplicationSource = readFileSync(
  new URL('../src/features/strategy/StrategyRiskApplicationPage.tsx', import.meta.url),
  'utf8',
);
const editorSource = readFileSync(
  new URL('../src/features/strategy/StrategyEditorPage.tsx', import.meta.url),
  'utf8',
);
const editorSheetSource = readFileSync(
  new URL('../src/features/strategy/StrategyEditorSheet.tsx', import.meta.url),
  'utf8',
);
const experimentCreateSource = readFileSync(
  new URL('../src/features/strategy/StrategyExperimentCreatePage.tsx', import.meta.url),
  'utf8',
);
const experimentDetailSource = readFileSync(
  new URL('../src/features/strategy/StrategyExperimentDetailPage.tsx', import.meta.url),
  'utf8',
);
const experimentDetailSectionsSource = readFileSync(
  new URL('../src/features/strategy/StrategyExperimentDetailSections.tsx', import.meta.url),
  'utf8',
);
const riskApplicationsSource = readFileSync(
  new URL('../src/features/risk/StrategyRiskApplicationsSection.tsx', import.meta.url),
  'utf8',
);
const riskApplicationEditorsSource = readFileSync(
  new URL('../src/features/risk/StrategyRiskApplicationEditors.tsx', import.meta.url),
  'utf8',
);
const notificationRouteSelectSource = readFileSync(
  new URL('../src/features/risk/NotificationRouteSelect.tsx', import.meta.url),
  'utf8',
);

describe('策略中心界面契约', () => {
  it('复用共享的线型标签页', () => {
    expect(strategyCenterLayout).toMatch(/<TabsList\s+variant="line"/);
    expect(strategyCenterLayout).toContain('<TabsTrigger');
    expect(strategyCenterLayout).toContain('nativeButton={false}');
    expect(strategyCenterLayout).toContain('<PageHeader');
    expect(strategyCenterLayout).toContain('eyebrow="STRATEGY CENTER"');
    expect(strategyCenterLayout).toContain('description="管理策略版本、回测任务与 AI 优化实验。"');
    expect(strategyCenterLayout).toContain('value={value}');
    expect(strategyCenterLayout).toContain('onValueChange={(nextValue)');
    expect(dashboardSource).toContain('const [centerTab, setCenterTab]');
    expect(dashboardSource).toContain('strategyCenterTabForPath(location.pathname)');
    expect(backtestDetail).toContain(
      "identity.sourceKind === 'experiment' ? 'experiments' : 'library'",
    );
    expect(backtestDetail).toContain('onSourceTabChange(');
    expect(strategyCenterLayout).not.toContain('data-icon="inline-start"');
  });

  it('列表移除强制桌面最小宽度和固定操作列', () => {
    for (const source of [strategyLibrary, backtestJobs, experimentList]) {
      expect(source).toContain('table-fixed');
      expect(source).not.toMatch(/min-w-\[(?:760|920|940)px\]/);
      expect(source).not.toContain('StickyTableAction');
    }
  });

  it('策略与实验列表优先展示业务信息', () => {
    expect(strategyLibrary).not.toContain('>能力<');
    expect(strategyLibrary).toContain('>最近回测<');
    expect(strategyLibrary).toContain('onBacktest(strategy, latest)');
    expect(experimentList).toContain('experimentSourceLabel(experiment)');
    expect(experimentList).toContain('experimentProgressLabel(experiment)');
    expect(experimentList).not.toMatch(/>\s*\{experiment\.id\}\s*</);
    expect(experimentList).not.toContain('model.provider');
    expect(strategyLibrary).toContain('font-medium text-foreground hover:underline');
    expect(experimentList).toContain('font-medium text-foreground hover:underline');
    expect(backtestJobs.match(/font-medium text-foreground hover:underline/g)).toHaveLength(2);
    expect(backtestJobs).toContain('text-left font-medium text-foreground');
  });

  it('版本记录使用紧凑列表而非独立卡片', () => {
    expect(strategyLibrary).toContain('<TabsContent value="versions" className="mt-4">');
    expect(strategyLibrary).toContain('<th className="w-2/3 px-4 py-3 font-medium">版本</th>');
    expect(strategyLibrary).toContain('className="px-4 py-3 text-right text-muted-foreground"');
  });

  it('回测列表分开表达状态进度和结果摘要并保存展开状态', () => {
    expect(backtestJobs).toContain('>状态与进度<');
    expect(backtestJobs).toContain('>结果摘要<');
    expect(backtestJobs).toContain("searchParams.get('expanded')");
    expect(backtestJobs).toContain('backtestStatusSummary(group.jobs)');
    expect(backtestJobs).toContain(
      'md:grid-cols-[minmax(18rem,1fr)_max-content_max-content] md:items-center',
    );
    expect(backtestJobs.match(/w-auto shrink-0 flex-row items-center gap-2/g)).toHaveLength(2);
    expect(backtestJobs.match(/className="w-fit"/g)).toHaveLength(2);
    expect(
      backtestJobs.match(/w-max min-w-\(--anchor-width\) max-w-\(--available-width\)/g),
    ).toHaveLength(2);
    expect(listPresentation).toContain('backtestResultSummary(job)');
  });

  it('链接渲染的按钮不被全局链接颜色覆盖', () => {
    expect(baseStyles).not.toContain('a {\n  color: var(--color-text-primary);\n}');
  });

  it('共享按钮和标签页不被原生按钮规则覆盖字重', () => {
    expect(baseStyles).toContain('button:not([data-slot]),\ninput,');
    expect(baseStyles).not.toContain('button,\ninput,');
  });

  it('主按钮使用常规字重，链接式主按钮复用同一变体', () => {
    expect(buttonSource).toContain('font-normal hover:bg-primary/80');
    expect(buttonSource).not.toContain('font-semibold hover:bg-primary/80');
    expect(listPresentation).toContain('className={`${buttonVariants()} ml-auto`}');
    expect(backtestDetail.match(/nativeButton=\{false\}/g)).toHaveLength(2);
    expect(experimentDetailSource.match(/nativeButton=\{false\}/g)).toHaveLength(3);
    expect(experimentDetailSectionsSource.match(/nativeButton=\{false\}/g)).toHaveLength(1);
  });

  it('筛选器的回显与选项复用同一份中文标签', () => {
    expect(backtestJobs).toContain('strategyVersionOptions.find');
    expect(backtestJobs).toContain('statusOptions.find');
    expect(experimentList).toContain('sourceModeOptions.find');
    expect(experimentList).toContain('statusOptions.find');
    expect(experimentList).toContain(
      'md:grid-cols-[minmax(18rem,1fr)_max-content_max-content_auto] md:items-center',
    );
    expect(experimentList.match(/w-auto shrink-0 flex-row items-center gap-2/g)).toHaveLength(2);
    expect(experimentList.match(/className="w-fit"/g)).toHaveLength(2);
    expect(
      experimentList.match(/w-max min-w-\(--anchor-width\) max-w-\(--available-width\)/g),
    ).toHaveLength(2);
  });

  it('生产根路由提供 blocker 上下文且策略中心保留局部错误降级', () => {
    expect(appSource).toContain('createBrowserRouter');
    expect(appSource).toContain('<RouterProvider router={appRouter} />');
    expect(dashboardSource).toContain('<StrategyCenterErrorBoundary>');
    expect(editorSource).toContain('useBeforeUnload');
    expect(experimentCreateSource).toContain('useBeforeUnload');
  });

  it('风险生成使用单层上下文 Drawer 并在固定页脚完成保存', () => {
    expect(dashboardSource).toContain('presentation="drawer"');
    expect(riskApplicationSource).toMatch(/<Sheet\s+open/);
    expect(riskApplicationSource).toContain('<SheetFooter');
    expect(riskApplicationSource).not.toContain('<AlertDialog');
    expect(riskApplicationSource).toContain('放弃并关闭');
    expect(riskApplicationSource).not.toContain(
      '<Button variant="outline" onClick={requestClose}>',
    );
    expect(riskApplicationSource).toContain('accountDisplayLabel(selectedAccount)');
    expect(riskApplicationSource.match(/nativeButton=\{false\}/g)).toHaveLength(4);
    expect(riskApplicationSource).toContain('strategyRiskCycleModeLabel(cycleMode)');
    expect(riskApplicationSource).toContain('strategyMonitoringMetricLabel(rule.metric)');
    expect(riskApplicationSource).toContain('strategyComparisonOperatorLabel(rule.operator)');
    expect(riskApplicationSource).toContain('md:grid-cols-[minmax(0,3fr)_minmax(260px,2fr)]');
    expect(riskApplicationSource).toContain('aria-label="实际证券账户" className="w-full"');
    expect(riskApplicationSource).toContain('<FieldLabel>通知渠道</FieldLabel>');
    expect(riskApplicationSource).toContain('<NotificationRouteSelect');
    expect(riskApplicationSource).toContain('useNotificationRoutingQuery()');
    expect(notificationRouteSelectSource).toContain('aria-label={ariaLabel} className="w-full"');
    expect(notificationRouteSelectSource).toContain('routes.map((route)');
    expect(notificationRouteSelectSource).not.toContain('value="feishu"');
    expect(riskApplicationSource).not.toContain('aria-label="飞书通知渠道"');
    expect(strategyLibrary).toContain('riskApplicationId');
    expect(strategyLibrary).toContain('查看风险应用');
    expect(strategyLibrary).toContain('生成风险规则');
    expect(strategyLibrary).not.toContain('<TabsTrigger value="risk"');
    expect(strategyLibrary).not.toContain('<TabsContent value="risk"');
    expect(strategyLibrary).toContain('<Tabs\n        value={activeTab}');
    expect(strategyLibrary).not.toContain('<Tabs defaultValue="definition">');
    expect(dashboardSource).toContain('const [versionTabState, setVersionTabState]');
    expect(dashboardSource).toContain('tabState={versionTabState}');
    expect(dashboardSource).toContain('onTabChange={setVersionTabState}');
  });

  it('风险中心用明确的编辑与删除动作管理应用，并统一通知下拉回显', () => {
    expect(riskApplicationsSource).toContain('编辑通知配置');
    expect(riskApplicationsSource).toContain('删除应用');
    expect(riskApplicationsSource).not.toContain('定位此应用');
    expect(riskApplicationsSource).not.toContain('复制为独立规则');
    expect(riskApplicationEditorsSource).toContain('strategyRiskNotificationSeverityLabel');
    expect(riskApplicationEditorsSource).toContain('<NotificationRouteSelect');
    expect(riskApplicationEditorsSource).toContain('useNotificationRoutingQuery()');
    expect(riskApplicationEditorsSource).not.toContain('strategyRiskNotificationChannelOptions');
    expect(riskApplicationEditorsSource).toContain('ariaLabel="策略应用通知渠道"');
    expect(riskApplicationEditorsSource).not.toContain('aria-label="策略应用飞书通知"');
  });

  it('编辑已有版本保留源详情并使用右侧 Drawer', () => {
    expect(dashboardSource).toContain('<StrategyEditorRoute');
    expect(dashboardSource).toContain('mode="edit"');
    expect(dashboardSource).toContain('presentation="drawer"');
    expect(editorSource).toContain("presentation === 'drawer' ? 'sheet' : 'page'");
    expect(editorSheetSource).toContain('<Sheet open={open}');
    expect(editorSheetSource).toContain('<SheetFooter>');
    expect(strategyLibrary).toContain('id={strategyCenterTriggerId.editVersion}');
    expect(editorSheetSource).toContain('triggerId={triggerId}');
    expect(editorSheetSource).toContain(
      'finalFocus={triggerId ? () => document.getElementById(triggerId) : undefined}',
    );
    expect(editorSource).toContain('strategyCenterTriggerId.editVersion');
    expect(editorSource).toContain('strategyCenterFocusState(strategyCenterTriggerId.editVersion)');
  });

  it('路由型 Drawer 关联来源操作，关闭后可恢复焦点', () => {
    expect(strategyLibrary).toContain('id={strategyCenterTriggerId.riskApplication}');
    expect(riskApplicationSource).toContain('triggerId={strategyCenterTriggerId.riskApplication}');
    expect(riskApplicationSource).toContain(
      'finalFocus={() => document.getElementById(strategyCenterTriggerId.riskApplication)}',
    );
    expect(strategyLibrary).toContain('strategyCenterFocusTarget(location.state)');
  });
});
