# 行情派生详情与周期能力验收证据

日期：2026-10-05。权威范围为[原 Spec](../../specs/2026-09-16-market-chart-period-aggregation.md)与[原 Task](../2026-09-16-market-chart-period-aggregation.md)的 T3.3b1/b2。本叶完成本地实现、回归及只读能力核验；T3.3c、T3.2b2.2/T3.2c3、T5 和完整产品验收继续开放。

## 实现与消费合同

- Schema 新增展示详情联合合同，根序列与 bars 分段同时核对证券、周期、口径、指纹及完整内容；指标保留显示指纹与 calculationInput。原生详情 Schema 仍拒绝派生序列。
- SDK 默认或明确 1m/1d 的详情调用保持原生返回类型；派生或动态周期使用展示联合类型。请求与响应的证券、周期、口径匹配，并保留 AbortSignal。
- Market 独立详情服务先分别预检指标的实际窗口；不可行指标单独降级，可行指标与 bars 共用一次真实基础获取。DSA 失败保留 bars；来源失败不重试；非法参数保持 400，不支持的资产/市场保持 422。原生入口与非行情分段沿既有合同。
- 独立 `/api/market/:symbol/period-options` 使用 `market-period-options-v1`，不扩展原生 chart-options。每周期及每指标按真实日历、完整桶、双层预算和所选价格口径在实际基础窗口核验路由，返回窗口、计划日线数和日历 revision。
- 能力服务不读取行情、不计算指标、不调用模型。available 只表示日历/路由/预算前置就绪，不代表实际历史覆盖足够、来源持续可用或目标部署完成。
- 详情默认 30 点、年度 10 点；独立 bars/指标和周期能力默认 90 点、年度 10 点。显式请求分别遵守原入口参数上限。Desktop 源码未修改。

实现位于 `packages/schemas/src/market-display-detail.ts`、`market-period-options.ts`，`packages/api-client/src/market-display-client.ts`，以及 `apps/server/src/market/market-period-detail.service.ts`、`market-period-options.service.ts`。共享原生详情校验与指标参数解析按 Market 概念所有权复用，没有新增反向依赖。

## 本地验证

以下命令在主仓执行，Shell 经 `rtk proxy`；成功日志保存在临时目录。表内结果为最后一次验证，不将此前已修正的夹具失败保留为当前失败。

| 验证 | 命令或输入范围 | 最终结果 | 日志 |
| --- | --- | --- | --- |
| Schema 全包 | `pnpm --filter @thesis-ledger/schemas test` | 56 文件、673 项通过 | `/tmp/market-period-detail-schema-regression.log` |
| SDK 全包 | `pnpm --filter @thesis-ledger/api-client test` | 12 文件、72 项通过 | `/tmp/market-period-detail-sdk-regression-final.log` |
| 新详情/能力 HTTP | Server `vitest run test/market/market-period-detail-http.test.ts` | 14 项通过 | `/tmp/market-period-detail-mixed-indicator.log` |
| Server 受影响回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/market test/integration/dsa-market-calendar.test.ts test/integration/dsa-period-indicators.test.ts test/integration/dsa.client.test.ts --maxWorkers=2` | 63 文件、784 项通过；5 文件、27 项条件跳过 | `/tmp/market-period-detail-server-regression.log` |
| Schema/SDK build | 分别执行 `pnpm --filter @thesis-ledger/schemas build` 与 `pnpm --filter @thesis-ledger/api-client build` | 通过 | `/tmp/market-period-detail-schema-build-final.log`、`/tmp/market-period-detail-sdk-build-final.log` |
| Server 类型/build | `pnpm --filter @thesis-ledger/server typecheck`、`pnpm --filter @thesis-ledger/server build` | 通过 | `/tmp/market-period-detail-server-types-final.log`、`/tmp/market-period-detail-server-build.log` |
| Desktop 类型/build | `pnpm --filter @thesis-ledger/desktop typecheck`、`pnpm --filter @thesis-ledger/desktop build` | 通过；保留既有构建分块告警 | `/tmp/market-period-detail-desktop-types-final.log`、`/tmp/market-period-detail-desktop-build.log` |
| lint/格式 | 本叶新增及受影响文件 lint；新增职责按复杂度 20 验证；14 个受影响文件 Prettier 检查 | 通过；存量 Controller 未做整文件格式化 | `/tmp/market-period-detail-lint-final.log`、`/tmp/market-period-detail-sdk-lint-final.log`、`/tmp/market-period-detail-shared-lint.log`、`/tmp/market-period-detail-format.log` |
| 架构/尺寸 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs`、`node scripts/check-file-size-guardrails.mjs` | 通过；9 个存量尺寸告警未增长 | `/tmp/market-period-detail-boundaries.log`、`/tmp/market-period-detail-dependencies.log`、`/tmp/market-period-detail-size.log` |
| 文档收尾 | `git diff --check`、本叶两份新文档 Prettier 检查、任务层级及相对链接核验 | 通过；剩余 32 项主任务/阶段义务、34 个展开叶；150 个相对链接有效 | 本轮最终核对输出 |

定向覆盖四周期详情、原生类型兼容、同指纹不同内容拒绝、每指标独立预算、高 MA 不可行而 MACD 可行时的一次基础获取、来源失败不重试、DSA 失败保留 bars、非法请求以及无路由/日历失败的能力降级。条件跳过的 PostgreSQL/Redis 测试不计为真实运行态通过。

Desktop build 仅证明共享 SDK/Schema 兼容，不证明 T5 周期 UI 或浏览器验收。本轮没有重复输入未变的既有 Domain/Backtest 全包检查，也没有提高门禁阈值或添加 ignore。

## 目标真实能力只读核验

宿主机当前能力服务消费目标 DSA 的真实 `/market/calendar` 与目标既有原生 chart-options，未请求目标新 period-options/detail 派生入口。核验标的为 `159516.SZ`、qfq、显式 2 个周期点；能力返回保留实际日历 revision。

| 周期 | 实际基础窗口 | 计划日线数 | bars 前置 | 指标前置 |
| --- | --- | --- | --- | --- |
| 5d | 2026-09-16～2026-09-30 | 10 | available | MA/MACD/RSI available |
| 1w | 2026-09-21～2026-10-05 | 7 | available | MA/MACD/RSI available |
| 1mo | 2026-08-01～2026-10-05 | 42 | available | MA/MACD/RSI available |
| 1y | 2025-01-01～2026-10-05 | 424 | available | MA：calendar_input_limit；MACD/RSI：calendar_unavailable |

年度 MACD/RSI 的本次结果是日历不可得，不能声称其实际预算检查已成功完成。受控测试另行证明年度预算拒绝与 bars 独立可得。`600519.SH` 四周期均为 route_not_configured，在原生价格能力拒绝后未额外读取日历。

两标的合计 17 次日历请求、15 次价格能力请求；实际行情获取、DSA 指标计算和模型调用均为零。脚本入口 `/tmp/market-period-options-target-readonly.mjs`；命令：

```sh
rtk proxy env TSX_TSCONFIG_PATH=apps/server/tsconfig.json pnpm exec tsx /tmp/market-period-options-target-readonly.mjs
```

结果日志 `/tmp/market-period-options-target-readonly.log`。凭据只在容器环境读取，未打印或复制到宿主机。三个既有账户的 accountId、ledgerRevision、projectionGeneration、events、effective 语义摘要前后相同；摘要排除共享 instrumentDirectory。受保护账户为 `0e9677d2-98c6-45b1-8bc3-8d07b9209180`、`93337db7-a5a0-40c5-823f-63577e9e924b`；既有标记账户为 `95bd7e1a-72df-4cd7-aae8-121d8545e5ea`。

## 部署与收尾边界

主仓已有 28 项 migration，目标仍为 26 项；当前结构 head 为 `20261004140000_strategy_authoring_records`。本轮没有升级数据库、更新容器、构建发布镜像或改变来源能力，现行容器健康不能证明新入口已部署。后续须先完成保数据升级及结构门禁，再按 infra 官方入口更新；不使用清库重建替代保数据升级。

T3.3b1/b2 及本地父叶 T3.3b 已完成；T3.3c、T3.3/T3、T5/G1/P1/R1 保持未勾选。月线完整真实指标窗口仍受此前来源 503 影响，年度不可得理由分别保留。工作区既有修改、账户与工作树均保留，没有提交、推送或清理。
