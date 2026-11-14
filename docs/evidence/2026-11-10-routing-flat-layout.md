# 细分路由平铺配置验收

状态：通过。规格见 [细分路由直接编辑](../specs/2026-11-09-market-routing-inline-editor.md)，任务见 [实施清单](../archive/tasks/2026-11-10-routing-flat-layout.md)。本记录为当前平铺交互的验收依据。

## 实现与范围

面板顶部切换市场、标的类型，初始为全部市场和全部类型。下方只展示当前范围默认来源，以及该范围的市场、类型或用途行；点击市场、类型名称也能进入对应范围。周期默认及各复权口径展开在同一层，主备下拉框保持对齐。桌面共用一行表头，窄屏逐组显示标签。状态、保留例外数量和使用上级入口位于范围名称下方，覆盖诊断继续可见。

各行常驻主备下拉框，实际选择写入现有共享草稿；切换范围和展开只影响查看。上级恢复、明确未配置、下级例外保留和精确来源绑定均复用原有领域函数。所有修改统一预览保存。

本轮仅调整 Desktop 展示和表单组合，移除递归树组件；分层数据投影继续负责实际范围枚举。无 Server、DSA、数据库、依赖或 Docker 修改。实际页面由宿主机 Vite 提供当前源码，读取和预览使用实际服务。

## 定向与静态检查

- 定向运行 `pnpm --filter @thesis-ledger/desktop exec vitest run`，输入为 `market-policy-{defaults,navigation,target-select,workflow}`、`routing-config-workflow`、`routing-flat-scopes`、`routing-scope-tree` 对应测试文件：7 文件、34 项通过。新增测试覆盖查看范围不改变配置、全部周期和复权范围平铺可达、普通用途不产生口径行；原继承、空配置、精确绑定和失败恢复测试继续通过。日志 `/tmp/routing-flat-tests.log`。
- Desktop `typecheck` 和 `build` 通过；构建保留已有大包体积警告。日志 `/tmp/routing-flat-typecheck.log`、`/tmp/routing-flat-build.log`。
- 修改的路由组件、共享选择器、显示投影及新增测试严格 ESLint 通过，复杂度上限 20。日志 `/tmp/routing-flat-eslint.log`。
- `scripts/check-boundaries.mjs` 通过；`scripts/check-file-size-guardrails.mjs` 通过，保留 6 项既有大文件警告，本轮组件均低于阈值。系统 Node 经 Volta 缺失匹配版本，改用本机已安装 Node 执行检查，未改项目依赖。日志 `/tmp/routing-flat-{boundaries,size}.log`。`git diff --check` 通过。

## 实际浏览器

使用 `apps/desktop/scripts/check-hierarchical-routing.cjs`，通过 Playwright 和本机 Edge 对宿主机页面验收。1440、1024、768、390 全部通过；已查看桌面、平板、窄屏截图。

| 宽度 | 页面宽度 | 细分面板左右边界 | 受控保存次数 | 预览来源变化 | 真实写入 | 页面错误 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440 | 1440 | 480–1440 | 2 | 7 | 0 | 0 |
| 1024 | 1024 | 64–1024 | 2 | 7 | 0 | 0 |
| 768 | 768 | 16–768 | 2 | 7 | 0 | 0 |
| 390 | 390 | 0–390 | 2 | 7 | 0 | 0 |

验证市场和类型名称导航、两个范围选择器及市场变化重置类型、展开不产生草稿修改、主备直接选择、恢复上级、跨面板组合修改、统一预览与取消、503 后同一草稿重试、资料详情及原页签导航。桌面用途行与精确口径行的主源横坐标和宽度误差小于 1px，未出现嵌套口径面板。所有实际打开的下拉面板均在视口内，页面无横向溢出，底部操作可见。

所有 PUT 保存均拦截；390px 读取响应中的待确认目录标志使用受控值，验证干净草稿也可预览待确认变化。其余读取和 POST 预览连接实际服务。首轮脚本因选中值文本含装饰箭头导致精确文本断言失败，修正为校验中文显示标签后通过；未修改业务数据和来源行为。

结果 `/tmp/routing-flat-qa/results.json`，截图 `/tmp/routing-flat-qa/{overview,fine,main}-{1440,1024,768,390}.png`，日志 `/tmp/routing-flat-browser.log`。运行时只读核对：实际策略修订 194、117 条路由、58 条配置规则、152 个已知能力键；原样预览 HTTP 201、117 条路由、来源变化 0。

最终复核：代码与规格一致，全部当前交互验收通过；真实配置保持不变，未提交或推送。此结论限于本轮 Desktop 改动，不扩大为共享工作区其他任务的全仓验收。
