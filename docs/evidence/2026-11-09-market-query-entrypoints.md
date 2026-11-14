# 市场查询入口与抽屉一致性验收

## 验收范围与运行环境

- 规格：[市场查询入口与抽屉一致性](../specs/2026-11-09-market-query-entrypoints.md)；任务：[归档任务](../archive/tasks/2026-11-09-market-query-entrypoints.md)。
- 基线为 `main` 分支的 `9c7d1f0e` 加当前共享工作区未提交源码，保留原有路由策略、来源诊断及规则监测等并行修改。本轮仅涉及 Desktop 市场数据查询与共享标的字段、相关测试及本主题文档，不将整个工作区 diff 归为本轮交付。
- 真实页面为 `http://127.0.0.1:5173/market-data`，使用宿主机现有 Vite 运行态与真实本地目录；浏览器为本机 Microsoft Edge 无头模式，时区设为 `Asia/Shanghai`。只允许真实 GET；新闻 POST 被浏览器拦截并返回受控失败/不可用结果，其他写请求拒绝。没有写入真实业务数据或调用真实新闻来源。
- 只修改宿主机 Desktop 应用；现有 Vite 已加载源码。Docker 更新不适用，未执行 `sync-code.sh` 或 `update.sh`，不声明镜像更新或发布。

## 实现与排查范围

- 页标题保留原刷新图标；两个入口改为页签栏右侧的「查询资料」「查看新闻」，窄屏换行。
- 两个抽屉均复用 `SheetContent size="detail"`、`SheetHeader` 和 `SheetBody`。
- `InstrumentSymbolField` 复用已选目录记录，在框内回显名称和代码；编辑恢复原始代码，`onChange` 仍传原代码，未增加闭合状态补名请求。目录故障、未知、禁用、跨市场/类型过滤沿用原行为。
- 排查共享字段消费者：资料、新闻、证券静态资料、自选、策略执行与探索、比赛标的池、研究表单、账户与复盘；现有调用继续消费原值，研究表单的旧回显断言同步更新。持仓范围 `InstrumentOptionField` 仍由调用方提供标签，不扩大到目录检索。合约字段按已有来源清单投影名称与代码，保留清单日期、近月范围和可交易性限制说明。
- 两个查询表单初始代码为空；资料代码示例和共享标的字段的占位/空输入提示移除。保留校验、目录故障、空结果与实际来源覆盖说明。
- 个股新闻与市场快讯复用 `MarketNewsTimeRangeField`：1、3、7、30 天和自定义日期，默认 3 天；预设按点击读取的时刻倒推，自定义包含本地起止日全天。修改条件取消旧查询，读取与重试仍需点击；结果使用响应中绑定本次请求的时间范围。

## 自动检查

| 检查 | 输入与命令 | 结果 |
| --- | --- | --- |
| 查询与选择器定向验证 | 在 `apps/desktop` 执行 `pnpm exec vitest run test/instrument-symbol-field.ui.test.tsx test/market-news-sheet.ui.test.tsx test/market-news-time-range.test.ts test/market-reference-contracts.ui.test.tsx test/market-data-provider-ui.test.tsx test/market-news-api.test.ts` | 6 个文件、43 项通过 |
| 共享消费者回归 | `pnpm exec vitest run test/strategy-instrument-selection.ui.test.tsx test/instrument-catalog-search.recovery.ui.test.tsx test/portfolio-instrument-search.test.ts test/market-reference-table.ui.test.tsx` | 4 个文件、11 项通过 |
| 类型与构建 | 在 `apps/desktop` 执行 `pnpm build` | 通过；包含 `tsc --noEmit`，保留现有大分块提示 |
| 仓库门禁 | 根目录执行 `node scripts/check-boundaries.mjs`、`node scripts/check-accessibility.mjs`、`git diff --check` | 边界通过、13 项无障碍/响应式静态检查通过、diff 检查通过 |
| 回显断言与凭证复测 | `pnpm exec vitest run test/research-form-v2.ui.test.tsx test/market-experiment-recovery.ui.test.tsx` | 2 个文件、24 项通过 |
| 包级测试与本轮文件 ESLint | 在 `apps/desktop` 执行 `pnpm test`；根目录以 `pnpm exec eslint <下述本轮修改的 TS/TSX 文件> --max-warnings=0` 检查 | 283 个文件、1810 项全部通过；ESLint 通过 |

Node 通过现有 pnpm 运行时执行；直接脚本使用 `/Users/yzin/.volta/tools/image/node/26.13.0/bin/node`，未安装或升级依赖。

首次定向测试有两项 Select 选择未生效：jsdom 的普通 `click()` 没有复现 Base UI 的指针事件，补齐真实指针事件后 43 项全部通过。首次包级测试为 1808/1810，通过检查发现研究表单仍期待仅代码，已更新为名称与代码并复测通过；另一项凭证测试在当前共享工作区定向复测通过，未修改其实现或断言。更新研究回显断言后执行第二次包级检查，1810 项全部通过，未再次重复构建或浏览器矩阵。

ESLint 输入如下（路径均相对于主仓）：

```text
apps/desktop/src/features/market-data/MarketDataPage.tsx
apps/desktop/src/features/market-data/MarketDataSectionTabs.tsx
apps/desktop/src/features/market-data/MarketReferenceSheet.tsx
apps/desktop/src/features/market-data/MarketReferenceCodeField.tsx
apps/desktop/src/features/market-data/MarketReferenceContractField.tsx
apps/desktop/src/features/market-data/InstrumentSymbolField.tsx
apps/desktop/src/features/market-data/InstrumentSearchCombobox.tsx
apps/desktop/src/features/market-data/MarketNewsSheet.tsx
apps/desktop/src/features/market-data/MarketNewsSearch.tsx
apps/desktop/src/features/market-data/MarketNewsTimeRangeField.tsx
apps/desktop/src/features/market-data/MarketNewsFeed.tsx
apps/desktop/test/market-news-sheet.ui.test.tsx
apps/desktop/test/instrument-symbol-field.ui.test.tsx
apps/desktop/test/market-news-time-range.test.ts
apps/desktop/test/research-form-v2.ui.test.tsx
```

本轮还新增浏览器脚本和本主题 Spec、Task、证据；没有修改共享 `Sheet`、`Tabs` 或 `Select` 本身及 Server/Mobile 文件。

## 实际浏览器验收

脚本：`apps/desktop/scripts/check-market-query-entrypoints.cjs`。从主仓执行：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
  /Users/yzin/.volta/tools/image/node/26.13.0/bin/node apps/desktop/scripts/check-market-query-entrypoints.cjs
```

默认使用 `msedge`；可通过 `MARKET_QUERY_CHROMIUM_EXECUTABLE`、`MARKET_QUERY_QA_BASE_URL`、`MARKET_QUERY_QA_OUTPUT` 指定浏览器、页面与产物目录。原 Chromium 缓存缺少 Framework，改用已安装的 Edge，无依赖安装。首次浏览器脚本在切换新闻类型的短暂过渡中匹配到两个范围控件，补充等待旧面板隐藏后，四种宽度全部完成。

| 视口宽度 | 资料与新闻抽屉宽度 | 受控查询数 | 真实写请求 | 结果 |
| --- | --- | --- | --- | --- |
| 1440 | 960 | 4 | 0 | 通过 |
| 1024 | 960 | 4 | 0 | 通过 |
| 768 | 752 | 4 | 0 | 通过 |
| 390 | 374 | 4 | 0 | 通过 |

每个视口核对：入口同行或换行、原页签选择保留、两个抽屉打开/关闭及边界、真实目录「贵州茅台 · 600519.SH」回显、聚焦与 Escape、无示例占位和说明、中文范围回显、选择不自动提交、7 天请求、受控失败后点击恢复、自定义空值与倒置校验、整日起止参数、结果范围、快讯 24 小时请求、页面与抽屉横向溢出及浏览器异常。全部通过，浏览器异常为零。

截图与统计在 `/tmp/market-query-entrypoints-qa/`，每种宽度保留页面、资料及新闻截图，另有 `results.json`。已人工查看 1440 页面和资料抽屉、390 页面和新闻抽屉，入口分组、名称回显、日期与窄屏边界正常。

## 验收边界

真实目录读取与页面样式通过；查询提交、失败恢复与范围由受控响应验证。不证明新闻来源可用或历史覆盖完整，界面继续显示来源覆盖缺口。没有新增数据库结构、服务端接口、Worker、原生依赖或部署配置，相关迁移/原生编译/镜像更新不适用。

后续已对当前获准的招商银行最近 3 天补充真实来源与实际抽屉验收，见[个股新闻真实读取验收](2026-11-09-market-news-live-read.md)。该真实证据有独立标的、日期和准入范围，不改变本记录原有受控样本的证据性质。

最终一致性检查通过：AC1–AC5 有对应证据；回显与原值分离，时间与取消行为一致；已有并行修改保留，无未完成事项或新增 TODO。Task 已归档，当前 Spec 保留；证据由活动 Spec 与浏览器复验共用。
