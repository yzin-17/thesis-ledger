# 标的确认状态验收记录

## 范围与结果

历史规格：[标的确认状态与操作反馈](../specs/2026-11-10-instrument-confirmation-state.md)；实施：[归档任务](../tasks/2026-11-10-instrument-confirmation-state.md)。本次从持久化关联读取真实确认状态，统一 Desktop/Mobile 目录状态与缓存。原有“确认标的”接口、支持市场及持仓选择能力当时保持；没有 migration、依赖或原生工程变化，未提交或推送。后续导航与港美股票资格已由[证券业务选择流程](../../specs/2026-11-10-instrument-selection-workflow.md)更新，下文是原验收现场。

## 实现与边界

- Server Market 搜索先排序、截取最终候选，再一次批量读取 `InstrumentAssetAssociation`。同时要求目录 ID、完整证券代码匹配，关联 active、`confirmedAt` 非空、关联 Asset 的身份为 confirmed；关联读取失败直接使搜索失败，不能回退成未确认。不可关联的市场或类型始终 `confirmed=false`。
- `confirmable` 继续表示支持关联，搜索增量增加 `confirmed`。Schema 兼容缺少新字段的旧响应，但只有明确 true 才显示已确认；目标运行态已验证返回布尔字段。
- api-client 的 `instrumentConfirmationPresentation` 只消费响应事实，统一中文标签及稳定原因码映射。持久化读取留在 Server Market，不反向依赖客户端展示层。
- Desktop 成功回执后取消旧搜索，更新所有已缓存搜索词下的同一目录 ID，再失效重读；搜索传递 `AbortSignal`。失败不更新已确认，成功后的刷新失败仍保留成功状态。移除页面重复重读，失败使用共享中文提示。
- Mobile 目录在确认成功后同步缓存，由现有配置命令机制重新读取。按钮分别显示确认标的、已确认、不支持关联，不再直接显示内部原因码。已确认证券仍可在持仓选择器选入，原确认调用与保存流程保持。
- Desktop 行内容提取至 `InstrumentCatalogRow.tsx`，避免存量目录组件继续增加职责；窄屏名称和操作分行，保持完整代码和按钮可读。目录结果边框及焦点圈修复保留。
- 检查 `scripts/check-boundaries.mjs`，未新增 Server feature 依赖或客户端反向依赖，无需新增豁免；相关边界及 workspace 依赖检查通过。

## 定向和包级验证

| 检查 | 结果 |
| --- | --- |
| Server 定向：`vitest run test/market/instrument-confirmation-state.test.ts test/instrument.service.test.ts test/risk-market-contracts.test.ts` | 通过；新 5 项覆盖完整身份、批量谓词、无候选/不支持跳过、读取失败和目录搜索降级。日志 `/tmp/instrument-confirm-server-tests.log`。 |
| Server Market 范围：`vitest run test/market test/instrument.service.test.ts test/risk-market-contracts.test.ts` | 107 文件、1,138 项通过，9 文件、39 项既有环境条件测试跳过；不将跳过视为通过。日志 `/tmp/instrument-confirm-server-market.log`。 |
| schemas `pnpm test` | 133 文件、1,500 项通过，日志 `/tmp/instrument-confirm-schemas-tests.log`。 |
| api-client `pnpm test` | 43 文件、222 项通过，含中文三状态及增量契约校验；日志 `/tmp/instrument-confirm-client-alltests.log`。 |
| Desktop `pnpm test` | 294 文件、1,880 项通过，日志 `/tmp/instrument-confirm-desktop-alltests.log`。此轮之后补充旧搜索迟到用例、传递搜索取消信号及调整确认失败提示；最终受影响范围重跑如下，其余结果按未变输入复用。 |
| Desktop 最终定向：`vitest run test/instrument-confirmation-state.ui.test.tsx test/instrument-catalog-search.recovery.ui.test.tsx test/market-data-provider-ui.test.tsx` | 3 文件、16 项通过；新增 3 项覆盖成功/失败、全部搜索词缓存、刷新失败保留、重开、请求中禁用及晚到结果取消。日志 `/tmp/instrument-confirm-desktop-final-targeted.log`。 |
| Mobile `pnpm test` | 55 文件、239 项通过，日志 `/tmp/instrument-confirm-mobile-tests.log`。随后新增用例按下面定向验证，不重复运行无关原有测试。 |
| Mobile 最终定向：`vitest run test/parity/instrument-confirmation-state.test.tsx test/parity/instrument-picker.test.tsx` | 2 文件、5 项通过，含新 2 项目录失败重试/成功状态及已确认证券继续选入持仓；日志 `/tmp/instrument-confirm-mobile-final-targeted.log`。 |
| schemas、api-client、Server、Desktop build | 通过。Desktop build 包含最终 TypeScript 检查，保留既有包体积警告；日志 `/tmp/instrument-confirm-{schemas,client,server,desktop}-build.log`。 |
| Mobile 最终 typecheck | 通过，日志 `/tmp/instrument-confirm-mobile-final-typecheck.log`。未改原生编译输入，不以本检查宣称 Native compile。 |
| 修改源码及新测试 ESLint | 通过，日志 `/tmp/instrument-confirm-eslint-final.log`；公共投影及新行组件按复杂度上限 20 严格检查通过，日志 `/tmp/instrument-confirm-strict-eslint.log`。 |
| 边界、workspace 依赖、文件规模及差异卫生 | 通过。规模保留 6 项既有警告；日志 `/tmp/instrument-confirm-{boundaries-final,dependencies,size-final}.log`，`git diff --check` 通过。 |

初次类型检查发现 Zod optional 输出可能显式包含 undefined，已按项目 `exactOptionalPropertyTypes` 约定修正本次新增类型，最终两端类型检查通过。未改其他任务的测试或门禁阈值。

## 实际浏览器受控写入

宿主 Vite `http://localhost:5173` 加载当前源码，在本机 Edge 运行：

```sh
PLAYWRIGHT_MODULE=/tmp/codex-market-range-qa/node_modules/playwright \
CHROMIUM_EXECUTABLE='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
pnpm exec node apps/desktop/scripts/check-instrument-confirmation.cjs
```

1440、1024、768、390 均通过。保留真实 MarketDataPage、API 客户端、TanStack Query 与目录组件，只拦截目录搜索及指定确认接口；每种宽度 2 次受控 POST，先失败、再延迟成功，真实写入 0，其他写入口全部禁止，浏览器错误 0。

验证了未确认可点击、已有确认禁用、不支持关联单独显示；失败后可重试，请求中禁用防重复；成功立即变为已确认，换搜索词及整页重开后仍保持。焦点圈完整，页面无横向溢出，窄屏操作分行且可以滚动查看最后一行。已查看桌面与手机成功状态截图。

结果 `/tmp/instrument-confirm-qa/results.json`，截图 `/tmp/instrument-confirm-qa/confirmed-{1440,1024,768,390}.png`，日志 `/tmp/instrument-confirm-browser-final.log`。成功后的刷新失败与旧请求迟到由挂载测试受控证明，不把浏览器重开样本视为真实数据库写入证据。

## 目标 Docker 运行态

实际入口：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/sync-code.sh thesis-ledger`；执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。未设置额外影响行为的环境参数，采用脚本默认健康超时。兼容性预检通过，退出 0；Server 与 backtest-worker 健康，未执行结构升级或卷操作。日志 `/tmp/instrument-confirm-sync.log`。

两个目标的镜像 ID 均保持 `sha256:818afb6662fc6103edd1f4a27ba741fbdb21c76e7152e6e084d5629bcf7e976e`。这是容器可写层快更，不能作为镜像已更新或生产发布证据，容器重建后会恢复镜像代码。

## 独立真实只读核对

通过真实 GET `/api/market-data/instruments/search` 与 `/api/market-data/instruments/associations?symbol=…`，逐项对照返回状态、完整代码、目录 ID、关联状态、确认时间及 Asset 身份，不执行真实确认 POST。

| 标的 | 可关联 | 已确认 | 与持久化关联一致 |
| --- | --- | --- | --- |
| 招商银行 `600036.SH` | 是 | 是 | 是 |
| 招商银行 `03968.HK` | 否 | 否 | 是 |
| 招商银行 ADR `CIHKY.US` | 否 | 否 | 是 |
| 招商港口 `001872.SZ` | 是 | 否 | 是 |

另外用真实 `/market-data` 页面在四种宽度搜索招商银行，分别验证 A 股已确认禁用、港股不支持关联禁用、未确认 A 股仍可操作；所有业务请求仅 GET，浏览器错误 0、真实确认写入 0。结果 `/tmp/instrument-confirm-qa/live-results.json`，截图 `/tmp/instrument-confirm-qa/live-{1440,1024,768,390}.png`，日志 `/tmp/instrument-confirm-live.log`。核对脚本 `/tmp/check-instrument-confirmation-live.cjs`。

真实只读结果证明当前部署状态来自已有持久化事实；新确认成功与失败转换由受控 POST 和真实组件挂载证明，不将样本写入归为真实业务操作。

## 最终一致性复核

AC1–AC5 在上述范围通过。状态所有权、批量读取、增量契约、两端反馈和缓存一致；已确认未改变持仓选择资格。原界面焦点及结果边框保持，其他工作区修改未覆盖。未新增 TODO，未提交或推送；当前行为合同保留，实施任务及专属证据归档。
