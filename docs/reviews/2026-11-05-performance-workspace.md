# 收益分析统一工作区验收记录

## 范围与结果

本次按[现行规格](../specs/2026-11-05-performance-workspace.md)合并 Desktop/Web 页面；实施状态由[任务](../archive/tasks/2026-11-05-performance-workspace.md)维护。本记录区分真实组件／路由交互、固定数据浏览器和目标运行态，不以本地结果代表 Docker 或安装包已经更新。

## 实现核对

- 导航与规范页面统一为“收益分析”及 `/performance`；四页签为组合概览、收益分析、配置目标、交易，URL 保存页签和账户范围。旧 `/portfolio` 地址替换跳转并保留查询参数。
- `app/PerformanceWorkspace.tsx` 拥有跨功能编排、统一账户、换算状态和联合刷新。Portfolio 提供概览与交易，Performance 提供收益率、历史图表和配置；特性不反向依赖应用编排。
- 概览保留总资产、今日收益、累计和已实现盈亏、持仓与行情详情、首次使用引导及清仓后收益；完整走势图归入收益页签。收益指标不再重复展示总资产卡片。
- 收益页签切换资产总值与累计盈亏，继续使用原接口、粒度、区间、冻结历史、空点和当前点。收益率采用原有完整历史摘要，图表区间不冒充收益率区间。
- 配置编辑、校验、版本、保存、失败草稿、重试及保存后读取继续复用原实现；切页／账户／模式和换算转换受原草稿保护控制，保存在途阻止切换。
- 交易保留原有标的和生命周期筛选、清除、分页、详情与复盘跳转，消费统一账户；筛选区不再重复账户选择器。
- 无账户缓存且列表未就绪前不挂载账户消费者；有已校验缓存时，刷新失败保留范围和配置草稿并提示重试，不卸载编辑器。无效、停用、跨模式账户经原校验回退。迟到结果继续按查询键隔离。
- 盈亏历史刷新从组合查询移至应用联合刷新，避免一次刷新同时失效两遍。新增交互断言确认一次刷新仅新增一次当前盈亏历史请求。
- `PerformanceSections.tsx` 由本次前 929 行降为 779 行；按职责提取 `PerformanceMetrics.tsx` 与 `performance-display.ts`。指标计算与格式化表达式保持原义，仅有换行、末尾逗号和导出位置变化。Portfolio Dashboard 由 183 行减至 117 行。

## 工具函数与计算口径

依照 recommend skill 检查实际安装的 `es-toolkit@1.51.0` 所有运行时导出，没有日期／货币格式化候选；保留原生 `Intl.NumberFormat` 与原日期处理，参照 [ECMA-402 标准](https://tc39.es/ecma402/#sec-intl.numberformat.prototype.format)。未新增工具库或重复实现日期／货币算法。金额、百分比、空值和收益原因的现有回归继续通过。

未修改 Server、API 客户端契约、历史快照、数据库、收益和分配算法、目标存储协议或交易操作实现。`scripts/check-boundaries.mjs` 新增 Portfolio／Performance 到 app 的反向依赖门禁，并禁止组合事实反向依赖收益消费；联合刷新由应用编排拥有。

## 验证命令与证据

日志位于 `/tmp/thesis-ledger-performance-workspace-20261105/`。pnpm 使用工作区规定的 `https://registry.npmmirror.com`；测试使用 `NODE_OPTIONS=--no-experimental-webstorage` 排除本机 Node 26 原生 Web Storage 对 jsdom 的干扰。

| 检查               | 范围与结果                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首轮定向回归       | `routes`、账户筛选、清仓组合、持仓表、收益模式、盈亏图、交易模式：7 文件 34 项通过                                                                                                                                                |
| 统一工作区路由     | `performance-workspace.ui.test.tsx`：7 项通过，覆盖旧地址、四页签、账户往返、模式／换算默认值、草稿／失败／在途、账户列表就绪及刷新失败保留编辑器                                                                                 |
| 最后刷新与范围回归 | `performance-workspace.ui.test.tsx`、`portfolio-query-demand.test.ts`、`portfolio-account-filter.ui.test.tsx`、`performance-mode-account-scope.ui.test.tsx`：4 文件 34 项通过；包含最终联合刷新、模式换算复位与等待账户校验的输入 |
| 其他收益回归       | `performance-ui`、`performance-read-state`、`performance-target-save` 与全局账户旅程通过；包回归同时覆盖既有计算与操作测试                                                                                                        |
| 类型与构建         | `apps/desktop` 的 `pnpm run build`（包含 `tsc --noEmit`）通过；最终账户草稿保护变更后重新构建通过，保留原大 chunk 提示                                                                                                            |
| ESLint             | 仓库根目录 `pnpm exec eslint` 检查本次 app、Portfolio／Performance 源码及新增路由测试，通过                                                                                                                                       |
| 模块边界           | `pnpm exec node scripts/check-boundaries.mjs`：`Import boundaries: OK`                                                                                                                                                            |
| 文档与格式         | 本次文件的 Prettier、差异空白与文档链接核对通过                                                                                                                                                                                   |

Desktop 包回归命令 `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run --reporter=dot`：218 文件中 214 通过、4 失败，1253 项中 1249 通过、4 失败。此后新增的账户就绪场景和联合刷新断言已在最终 34 项定向回归验证；未为这些局部输入重复全包检查。

全包四项失败与此前现金页面任务中的失败一致，来自本次未改动的代码，不记为全仓通过：

- `list-frame.contract.test.tsx`：`RuleSourceMonitorPanel.tsx` 的表格容器声明。
- `sticky-table-actions.contract.test.tsx`：同一表格的操作列声明。
- `market-data-provider-ui.test.tsx`：三个页签预期与当前四个页签不一致。
- `ui-contract.test.tsx`：`reference-start`／`reference-end` 仍有原生日期输入。

## 浏览器与布局

使用 taste skill 自带 `layout/check.mjs`、`shoot.mjs`，通过已安装 Microsoft Edge 的独立无界面进程逐次执行；没有使用窗口浏览器或修改检查器。真实 `PerformanceWorkspace` 及其子组件以预置 QueryClient 固定数据渲染，加载本次通过构建的 CSS，浏览器阶段不调用 API。

组合概览在 1440×900、1024×768、768×1024、390×844 均无页面横向溢出。四页签已生成桌面及窄屏截图；现有业务表格继续在共享列表容器内展示，保留横向浏览与固定操作列。

布局检查器退出码为 1，报告 `edge-left`、`screen-short`、`hero-fold`：前者来自指标／表格内容列，后两者来自营销页全屏 Hero 假设。本应用按内容高度和业务列展示，已人工检查内容边缘、标签、图表和操作，不将整个营销检查器记为通过。

部分数据、错误和空态的补充截图已逐张复核：空态保留账户录入与配置引导，读取失败保留重试；历史不完整时收益率保留破折号及原因，已有资产点继续按原质量语义展示。加载时四页签保持可见，待账户校验通过后才挂载对应消费者；模式往返恢复未合并、CNY 的原默认换算。

截图、检查器结果、验证日志及最终源码指纹保存在本地 `/Users/yzin/.codex/visualizations/2026/11/05/01a1aa9f-a6f8-7631-95a5-5d400a1dc132/performance-workspace/`。这类可重建产物未加入 Git。本次没有重复营销页的图片、Hero 或整屏节奏要求，也不将静态预览性能冒充完整应用性能。

## 最终执行边界

只实施本地 Desktop/Web 合并，没有提交、推送、部署、Docker 操作、数据库写入、外部 Provider 调用或 Mobile／原生改动。保留工作区其他既有修改；尚未证明目标运行态已加载新页面。

## 公共换算工具栏调整

按用户反馈，将汇率合并、基准币种及汇率状态提至四页签外，与账户范围共同展示。复用 `PerformanceScopeControls.tsx` 中原控件与提示，收益和配置页签删除重复入口；页面只订阅既有查询缓存元数据，概览和交易不因此新增收益请求。计算、单账户／单币种禁用条件及原草稿保护保持不变。

补充交互回归覆盖公共控件跨四页签保持、概览／交易请求数量不增加，以及换算切换时取消放弃配置草稿。验证日志为原临时证据目录的 `fx-toolbar-tests.log`、`fx-toolbar-build.log` 与 `fx-toolbar-eslint.log`；宽窄屏预览以 `fx-toolbar-` 前缀另存，原合并验收截图保持原样。

本轮最终回归为 4 文件 44 项通过，类型／构建、ESLint 和模块边界通过。1440 与 390 宽度截图已人工检查；窄屏账户选择占整行，换算开关与基准币种在下一行，均位于页签上方。本轮未重复全包回归或更新 Docker 运行态。
