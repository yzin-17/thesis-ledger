# 标的详情证券资料验收记录

## 范围与实现

Desktop 证券资料已并入共用行情详情。目录、自选及持仓共用 `MarketDetailDialogContent`，港美股票与 ETF 挂载后自动读取；目录页独立查询表单及 `SecurityStaticInfoPanel.tsx` 删除。服务端、API、路由配置、DSA、Mobile 和数据库保持，无真实业务写入、提交、推送及 Docker 操作。

规格见[标的详情内自动展示证券资料](../../specs/2026-11-10-instrument-detail-security-info.md)，实施状态见[归档任务](../tasks/2026-11-10-instrument-detail-security-info.md)。本记录证明 Desktop 消费与界面迁移，不认证真实 Provider 可用性。

- `MarketDetailSecurityInfo.tsx` 按完整代码与类型使用 TanStack Query，传递取消信号、缓存五分钟；切换不串资料，关闭取消读取。A 股、基金、指数和未知类型不发请求。
- 资料区独立于行情成功与否，复用共享 Card、Table、加载区域、刷新图标及中文错误投影。首读中央加载；刷新保留数据并叠放加载圈；失败保留资料并支持重试。行情自动刷新不轮询静态资料。
- 证券 ID、每手股数保留字符串；缺失值为未知，退市标志区分是、否及未知。历史变更未核验和供应商上市日期已废弃说明保留。
- 原持仓数量、成本、盈亏原样提取为 `MarketDetailPositionContext.tsx`，避免已有复杂文件继续扩张。共用详情内容较 HEAD 减少 14 行；未提高阈值或添加豁免。
- 检查了 `scripts/check-boundaries.mjs`，无 Server 模块依赖或导出变化，无需新增例外；边界检查通过。旧 `SecurityStaticPriceDialog.tsx` 仍用于既有市场会话浏览器样本，未改该样本的报价验证边界。

## 测试与静态检查

验证按定向测试、包级验证、相关门禁、浏览器顺序执行。

| 检查 | 结果与输入范围 |
| --- | --- |
| Desktop 定向测试 | 最终 4 文件、30 项通过：`test/market-detail-security-info.test.tsx`、`src/features/market-detail/MarketDetailDialog.test.tsx`、`src/features/market-detail/MarketDetailDialog.latest.integration.test.tsx`、`test/instrument-catalog-search.recovery.ui.test.tsx`。新增资料测试 9 项，覆盖自动请求、未知值、大整数、缓存类型隔离、取消、迟到结果、刷新失败保留和重试。日志 `/tmp/security-info-targeted-final.log`。 |
| Desktop `pnpm test` | 293 文件、1,877 项通过，日志 `/tmp/security-info-desktop-tests.log`。此轮位于持仓摘要纯提取和最终列宽/错误文案调整前；之后重跑上述受影响的 4 文件、30 项通过，其余结果按未变输入复用。 |
| Desktop `pnpm typecheck`、`pnpm build` | 通过；最终 build 内含完整 TypeScript 检查，保留既有包体积警告。日志 `/tmp/security-info-typecheck.log`、`/tmp/security-info-build-final.log`。 |
| 新增源码与测试严格 ESLint，复杂度上限 20 | 通过，输入为资料区、持仓摘要、定向测试及浏览器入口。日志 `/tmp/security-info-eslint-new-final.log`。 |
| 修改的已有源码 ESLint | `MarketDataPage.tsx`、`MarketDetailDialogContent.tsx` 通过，日志 `/tmp/security-info-eslint-existing.log`。初始对存量函数额外强制复杂度 20 时发现原有 34/27；按仓库 ratchet 提取持仓摘要，最终复杂度与规模均不增加。 |
| `pnpm exec node scripts/check-boundaries.mjs` | 最终通过，日志 `/tmp/security-info-boundaries-final.log`。 |
| `pnpm exec node scripts/check-file-size-guardrails.mjs` | 最终通过，保留 6 项存量警告，日志 `/tmp/security-info-size-final.log`。 |
| `pnpm exec node scripts/lint-workspace.mjs --guardrails` | 未通过：其他任务的 `apps/server/test/quality/data-quality-observation.test.ts` 有 4 项未使用变量错误，`data-quality-postgres.integration.test.ts` 有 1 项类型导入错误。本次未编辑这两个文件，不扩大修复范围。日志 `/tmp/security-info-complexity.log`；不声明全局 lint 通过。 |
| `git diff --check` | 通过，保留共享工作区其他未提交修改。 |

## 实际浏览器

宿主 Vite `http://localhost:5173` 加载当前源码；通过 Playwright 与本机 Edge 执行：

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright \
CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
pnpm exec node apps/desktop/scripts/check-security-info.cjs
```

1440、1024、768、390 均通过。保留真实目录组件、共用弹窗与 TanStack Query，API 边界使用资料成功、503 和延迟受控响应，行情使用受控失败，证明资料展示不依赖行情成功。每个宽度 5 次静态读取，覆盖首读、刷新叠层、失败保留、重试、缓存重新打开、ETF 类型及 A 股跳过；页面、表格无横向溢出，弹窗在视口内，滚动及 Escape 关闭正常，焦点返回原目录按钮。浏览器错误 0，真实写入 0。

已实际查看桌面成功、手机成功和失败截图；手机列宽调整后证券 ID 与时间完整可读。结果 `/tmp/security-info-qa/results.json`，截图 `/tmp/security-info-qa/{ready,refresh,failed}-{1440,1024,768,390}.png`，日志 `/tmp/security-info-browser-final.log`。

最初入口空白源于验收脚本将源码 `/src/shared/api/` 误匹配为接口；改为只拦截以 `/api/` 开头的请求后通过。该失败不属于产品或 Provider 故障。

## 真实页面与来源边界

`apps/desktop/scripts/check-security-info-live.cjs` 连接真实 `/market-data` 页面，搜索 `03968` 并打开招商银行港股详情。确认独立表单已移除，资料自动请求。真实接口返回 HTTP 503，原始原因“当前 Control 未配置对应能力路由”；界面显示资料未读取及重试，未更改路由、权限或来源配置。浏览器错误 0，真实写入 0。结果 `/tmp/security-info-qa/live-results.json`，截图 `/tmp/security-info-qa/live-1440.png`，日志 `/tmp/security-info-live-final.log`。

当前没有真实资料成功返回的证据。成功展示、精度、刷新和失败恢复由受控响应证明；真实结果只证明自动读取及失败展示。现有未配置路由属于来源环境边界，不将 UI 验收扩大为来源接通。

## 最终复核

AC1–AC5 在声明的 Desktop 消费与界面范围通过。源码、测试、目录入口、错误状态及文档一致；支持范围未扩展，原数值与历史语义保持，其他任务修改未覆盖。全局 lint 失败与真实来源未配置分别保留证据，不声明全仓或真实来源成功。
