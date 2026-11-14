# 路由策略划分与来源配置验收

日期：2026-11-09。

对应 [Spec](../specs/2026-11-09-market-route-navigation.md) 与[已完成任务](../archive/tasks/2026-11-09-market-route-navigation.md)。

## 实现结果

- 六类业务导航：行情与净值、财务与持仓、资讯与资金、宏观与市场、交易规则、证券资料与公司行动。覆盖完整参考目录中的公开数据及衍生品能力，未知能力保持可见。
- 市场、标的类型和能力搜索组合筛选；桌面侧栏、窄屏分类选择器共用当前分类与完整策略草稿。
- 通过来源配置表达使用意图。清空主源删除对应精确路由及备用源，加载与刷新均不自动补入默认来源。
- 旧策略或单项 `enabled=false` 投影为未配置；已有启用项保留。重新选择仅恢复当前能力，显式保存时为配置项提交协议所需的启用字段。
- 日线和分钟线按能力展开周期、复权子行，仍独立编辑精确键；折叠时显示修改及异常数量。
- 统一保存显示全部修改数及当前视图外的修改数。状态投影、保存操作与表格分别由职责明确的组件或 helper 承担。
- 共享 Tabs 正确向底层传递 `orientation`，支持侧栏分类的竖向键盘语义。

## 验收映射

| 标准 | 结果 | 依据 |
| --- | --- | --- |
| AC1 分类完整且不丢行 | 通过 | 完整 `marketReferenceCatalog` 分类断言；未知能力兜底；已存失效键保留测试 |
| AC2 组合筛选及准确状态 | 通过 | 纯投影、选择器、公共收费及历史停复牌测试；四宽度组合筛选与空结果检查 |
| AC3 草稿与统一提交 | 通过 | 工作流及离开页面恢复测试；受控浏览器跨分类提交，精确检查删除、保留和新增路由 |
| AC4 行情子行及状态 | 通过 | 周期／复权分组测试；受控浏览器展开、清空、折叠，检查相邻口径保留 |
| AC5 响应式与实际页面 | 通过 | 1440、1024、768、390 的受控页面与真实页面均通过 |
| AC6 来源配置兼容 | 通过 | 旧停用项隔离、空策略和状态能力 Schema、清空主备、保存失败恢复及目录刷新保留空配置测试 |

## 自动检查

执行目录为主仓，Desktop 命令在 `apps/desktop` 下执行。

| 检查 | 最终结果 |
| --- | --- |
| 路由相关定向 Vitest 与样式契约 | 10 个文件、48 项通过 |
| `pnpm test`（Desktop） | 281 个文件、1791 项通过 |
| `pnpm build`（Desktop） | TypeScript 与 Vite 构建通过 |
| 本次组件及 helper 的 ESLint，附加 `complexity: [error, 20]` | 通过，无错误 |
| `pnpm exec node scripts/check-boundaries.mjs` | `Import boundaries: OK` |
| `pnpm guardrails:complexity` | 命令退出 0；全仓存在存量警告，本次集中判断已拆分并通过上述严格复杂度复查 |
| `pnpm exec node scripts/check-file-size-guardrails.mjs` | 通过，报告 6 个存量尺寸警告 |
| 本次变更范围 `git diff --check` | 通过 |

定向测试入口为 `market-policy-navigation.test.ts`、`market-policy-workflow.test.tsx`、`market-policy-target-select.test.tsx`、`market-data-provider-ui.test.tsx`、`market-independent-function-config.test.tsx`、`market-public-fee-config.test.tsx`、`market-trading-status-config.test.tsx`、`market-policy-defaults.test.tsx`、`navigation-draft-recovery.ui.test.tsx` 和 `desktop-style-tokens.test.ts`。

全量运行使用当前共享工作区，结果只说明本次实际运行的测试集合通过；未据此声明其他并行功能的外部来源验收通过。

## 实际浏览器

复现入口：

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright \
MARKET_ROUTE_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
node apps/desktop/scripts/check-market-route-navigation.cjs

PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright \
MARKET_ROUTE_CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
node apps/desktop/scripts/check-market-route-live.cjs
```

受控页面由独立 Vite 端口 `5188` 承载，使用真实组件、TanStack Query 工作流与 API 客户端。策略接口由浏览器拦截，先返回 503 验证草稿保留，再返回符合合同的成功样本。四种宽度均检查了以下结果：

- 跨分类编辑一起保存；提交保留前复权路由，删除不复权路由，新增风险警示来源。
- 所有提交配置项包含兼容字段；修改失败后可重试，成功后修改数归零。
- 目录刷新后清空项仍为未配置；旧停用项只在重新选择时进入提交。
- 组合筛选、空结果、清除筛选、六类切换、展开折叠可用。
- 选择器聚焦后可用 Escape 取消；弹出区域位于视口内。
- 表格在自身容器内横向滚动，页面无横向溢出，页面脚本错误为零。

真实页面使用 `http://localhost:5173/market-data`。验收脚本阻止所有非只读 API 方法；四种宽度均为零写入、零页面错误，分类导航及表格边界正常。实际读取策略为修订 193、117 条路由，检查未发现样本来源进入真实策略。默认中国内地范围六类分别为 33、13、20、21、7、7 条；该数字为本次运行时读数，不作为固定业务常量。

截图及机器结果保存在 `/tmp/market-route-navigation-qa/`，包括 `routes-<宽度>.png`、`live-<宽度>.png`、`results.json` 与 `live-results.json`。截图为本机验收产物，不纳入 Git；真实页面与受控样本分别记录。

## 运行边界与最终复核

本次修改为宿主机 Desktop 代码；当前 `5173` Vite 页面已读取修改后的源码。没有修改 Server、DSA、数据库协议或依赖，没有执行 Docker 状态变更，也没有将容器可写层同步声明为镜像发布。

真实策略保存未作为验收动作；保存精确内容、失败恢复及兼容字段通过受控请求验证。既有 DSA 与 Server 的来源准入及缓存围栏保持原契约，未把本轮浏览器样本认定为外部来源可用性证明。

最终逐项核对 AC1–AC6 与实现、自动检查、真实浏览器证据相符；当前范围无未完成项，无新增后续承诺，不写入 TODO。Spec 继续描述当前行为，完成任务归档；未创建 Git 提交。

## 面板布局精简验收

按截图反馈调整 `MarketPolicyPanel.tsx`：配置面板直接承接页签，应用状态移入保存操作区。`MarketPolicyRoutes.tsx` 使用原子类在 520px 以下为保存栏留出底部导航空间，沿用现有 DOM 和保存流程。

本次布局输入单独执行 3 个定向测试文件，21 项通过；Desktop 构建通过。真实页面在 1440、1024、768、390 四种宽度重新检查，六类导航、页面边界及零写入断言通过。此前 1791 项全量结果对应上一节记录的功能实现，本次没有重复运行全量测试。

## 分类选中态与正文颜色验收

针对截图中的分类、展开项标题及已选来源文字，先检查共享组件与实际计算样式，确认两个共性原因：共享 TableCell 继承旧表格的次级文字色，SelectValue 的 span 又被旧表格通用规则改为辅助字号和颜色。

修复由共享语义承担：TableCell 默认使用正文色；SelectValue 明确继承触发器颜色、使用正文尺度并清除通用 span 的额外上间距。分类导航采用共享 Tabs 的 navigation 变体，当前分类以主题主色底和对比文字显示，其他分类正常显示正文色，选中底色在鼠标停留时保持。浅色和深色主题分别消费既有语义 token。

源码检查覆盖 Desktop 中 57 个 SelectValue、10 个 TableCell、21 个 TabsList 消费文件。调用方显式 className 仍可表达其语义；表头、辅助说明、真正的占位文本和禁用态保留各自层级。分类样式仅由新 navigation 变体启用，其他页签继续使用既有变体。

本次相关的 5 个定向测试文件、47 项通过，Desktop 构建通过；共享工作区全量回归为 281 个文件、1792 项通过，最终深色变体调整后又通过上述定向检查和构建。实际页面在 1440、1024、768、390 下分别验证浅色和深色主题，脚本断言已选来源、展开项标题和普通分类名称使用正文色，选中分类文字及底色符合主题 token；8 个组合均通过，页面无横向溢出，零写入、零脚本错误。机器结果和截图分别保存在 `/tmp/market-route-navigation-qa/` 与 `/tmp/market-route-colors-dark/`。

## 默认市场范围

市场初始筛选已改为全部市场。实际浏览器重新进入 `http://localhost:5173/market-data`，触发器回显“全部市场”，列表同时包含香港和美国的实时行情配置；未操作真实策略保存。
