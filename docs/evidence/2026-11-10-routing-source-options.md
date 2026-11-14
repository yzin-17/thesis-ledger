# 路由主备具体来源统一选择验收

状态：通过。规格见 [细分路由直接编辑](../specs/2026-11-09-market-routing-inline-editor.md) AC6，任务见 [实施清单](../archive/tasks/2026-11-10-routing-source-options.md)。

## 实现与兼容

大类和全部细分行统一在主备下拉框中选择提供方与具体来源，选项及回显复用原精确路由的中文显示映射，例如“AKShare · 东方财富”和“HiThink · HiThink 股票历史接口”。只有一个适用来源时直接显示该来源标签，多来源保留“按能力匹配”；已绑定的来源可以切回能力匹配。来源选择依据当前范围和实际目录，已有精确绑定即使目录未包含也保留回显。

选择变更通过现有领域函数同时更新提供方与精确绑定，保留另一方、上级和下级例外；主备不能重复选择同一家提供方。初始展示单一来源不写入草稿，不改变能力匹配语义。明确清空、恢复继承和统一预览保存保持。展示组件只承担同一选择器组合，领域投影和更新归属 `routing-source-choices.ts`；覆盖诊断读取同一提供方标签映射。

本轮仅改 Desktop 展示、测试和文档，无 Server、DSA、协议、数据库、依赖或 Docker 变更。实际页面由宿主机 Vite 加载当前源码。

## 定向与静态检查

- 定向运行 `pnpm --filter @thesis-ledger/desktop exec vitest run`，输入为市场策略默认、导航、目标选择、工作流及分级配置、全量筛选、范围继承、统一来源选项测试，共 8 文件、39 项通过。统一来源的 5 项测试覆盖各家中文具体标签、主备与精确绑定同时更新、另一方与上级保留、相同提供方去重、明确清空、单一来源展示不写配置、能力匹配恢复、子级例外保留及目录外绑定回显。日志 `/tmp/routing-source-options-tests.log`。
- Desktop `typecheck`、`build` 通过，构建保留既有包体积警告。日志 `/tmp/routing-source-options-{typecheck,build}.log`。
- 修改源码与新增测试严格 ESLint 通过，复杂度上限 20；边界检查和文件规模检查通过，保留 6 项既有大文件警告。日志 `/tmp/routing-source-options-{eslint,boundaries,size}.log`。差异卫生通过，最终代码、规格及文档链接复核通过。

## 实际浏览器与数据边界

`apps/desktop/scripts/check-hierarchical-routing.cjs` 使用 Playwright 和本机 Edge，在 1440、1024、768、390 全部通过。已实际查看桌面和手机来源选择截图：

- 主备直接回显具体来源，当前范围仅有主备两个来源选择器；来源选项和回显共用标签。
- 实际选择“AKShare · 东方财富”作主源、HiThink 股票历史接口作备用；预览载荷精确验证提供方为 `akshare/hithink`，绑定为 `eastmoney/hithink-financial-api`。
- 筛选前后、清空与重新筛选、跨面板修改、恢复上级、统一预览和返回修改正常。503 受控失败后再次提交保留同一草稿及双来源绑定。
- 页面无横向溢出，面板边界依次为 480–1440、64–1024、16–768、0–390；所有打开的下拉弹出层在视口内，键盘打开及关闭正常。
- 每个宽度预览 7 项来源变化、2 次受控保存、真实写入 0、浏览器错误 0。所有 PUT 均拦截；390px 待确认目录标志使用受控响应，其余读取和 POST 预览连接实际服务。

结果 `/tmp/routing-source-options-qa/results.json`，来源截图 `/tmp/routing-source-options-qa/sources-{1440,1024,768,390}.png`，其余页面截图在同目录，日志 `/tmp/routing-source-options-browser.log`。真实策略修订仍为 194；原样预览 HTTP 201、117 条路由、来源变化 0。

最终复核通过。本轮不写真实配置，未提交或推送；结论限于本次 Desktop 变更，不扩大到共享工作区其他任务。
