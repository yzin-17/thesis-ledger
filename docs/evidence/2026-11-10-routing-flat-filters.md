# 路由全部范围平铺与顶部筛选验收

状态：通过。规格见 [细分路由直接编辑](../specs/2026-11-09-market-routing-inline-editor.md)，任务见 [实施清单](../archive/tasks/2026-11-10-routing-flat-filters.md)。

## 当前行为与范围

细分面板一次展示当前大类全部配置范围。大类、市场、类型、用途、周期默认和精确复权范围使用同列主备控件，每行完整展示对应范围名称。当前“行情与净值”共 135 项可编辑范围。顶部筛选市场、标的类型、用途、周期和复权，初始全部；各筛选独立取交集，匹配范围自身的维度，不把其他默认范围混入结果。选项使用中文业务标签，无对应维度时不显示筛选项。清空筛选恢复全部结果，不改草稿。

主备直接选择、恢复上级、明确未配置、保留下级例外、上游精确来源绑定及统一预览保存继续消费原领域函数。显示范围来自冻结能力键及既有配置规则，目录中的新能力不自动纳入。修改只涉及 Desktop 展示、测试与文档，保持 Server、DSA、接口、依赖和持久化；未执行 Docker 操作。实际前端由宿主机 Vite 加载当前源码。

## 定向和静态检查

- `pnpm --filter @thesis-ledger/desktop exec vitest run` 定向执行 `market-policy-{defaults,navigation,target-select,workflow}`、`routing-config-workflow`、`routing-flat-scopes`、`routing-scope-tree` 对应测试：7 文件、34 项通过。新增投影契约验证所有范围一次可达、去重、既有空规则保留、跨市场类型筛选、组合条件交集、空结果及配置不变；继承、精确来源和失败恢复测试继续通过。日志 `/tmp/routing-filters-tests.log`。
- `pnpm --filter @thesis-ledger/desktop build` 通过，包含 TypeScript 检查；保留已有包体积警告。日志 `/tmp/routing-filters-build.log`。
- 修改的组件、投影及测试严格 ESLint 通过，复杂度上限 20。日志 `/tmp/routing-filters-eslint.log`。
- `scripts/check-boundaries.mjs` 通过；`scripts/check-file-size-guardrails.mjs` 通过，保留 6 项既有大文件警告。日志 `/tmp/routing-filters-{boundaries,size}.log`。差异卫生通过。最终复核与文档链接检查通过。

## 实际浏览器

运行 `apps/desktop/scripts/check-hierarchical-routing.cjs`，通过 Playwright 和本机 Edge 验证 1440、1024、768、390。实际查看桌面、平板和手机截图，结果全部通过：

- 初始全部行可直接定位和打开来源下拉，顶部筛选保持可见；行内没有导航和口径展开控件。
- 类型可独立跨市场筛选；市场变化保留其余筛选；组合筛选、空结果、清空筛选及修改后重新筛选均正常，草稿保留。
- 主备直接编辑、键盘打开和关闭下拉、恢复继承、跨面板组合修改、统一预览、返回修改、503 后同一草稿重试、资料详情及原页签导航均通过。
- 页面无横向溢出，面板边界依次为 480–1440、64–1024、16–768、0–390；所有打开的下拉弹出层位于视口内。桌面筛选前后来源列横坐标和宽度误差小于 1px。
- 每个宽度预览 7 项来源变化，2 次受控保存，真实写入 0，浏览器错误 0。所有 PUT 均拦截，第一次返回 503，第二次返回受控成功；390px 使用受控待确认目录标志，保留干净草稿可预览的验证。其余读取和 POST 预览使用实际服务。

结果 `/tmp/routing-filters-qa/results.json`，截图 `/tmp/routing-filters-qa/{overview,fine,main}-{1440,1024,768,390}.png`，日志 `/tmp/routing-filters-browser.log`。真实策略只读核对为修订 194、117 条精确路由；原样预览 HTTP 201、117 条路由、来源变化 0。

最终复核：当前代码、交互和规格一致，本轮范围通过。真实配置未保存，未提交或推送；不扩大为共享工作区其他任务的全仓验收结论。
