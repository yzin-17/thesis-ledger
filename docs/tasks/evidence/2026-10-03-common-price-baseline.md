# HiThink 与腾讯共同价格能力验收

日期：2026-10-03。以用户确认的主 Spec §1.1 为验收基线，连续完成共同价格路径。三仓既有未提交工作保留；未提交、发布、购买服务、注册账号或更改数据库结构。

## 完成内容

- DSA 基础 ETF 日线：HiThink `fund-market-historical/qfq` 与腾讯 `tencent/none,qfq,hfq` 按适配能力、启用状态、必要凭据和精确路由就绪，取消人工限标的、限窗口和短期失效的 RouteAdmission 前置。高级能力继续独立判定。
- 公共日级状态：从实际 Bar、日历和采集时间自动整理，腾讯不再依赖 HiThink 专用 DataFrame 属性；系统计算的是归一化响应摘要，不冒称原始网络响应摘要。保留重复日期、非法价格、未完成分页、错误身份和缺日处理。
- 整窗备用：图表与固定供应商快照的归一化价格研究允许已配置的同口径 HiThink/腾讯整窗替换，记录真实来源；不再要求跨供应商算法等价证书。首次配置准备、执行预检及快照构建均传递价格研究用途。真实单位和严格历史计算没有借此取得资格。
- 标的目录新增“行情详情”，复用现有查询协调器、TanStack Query 缓存和弹窗。无需新建持仓；目录入口省略数量、成本、盈亏，原持仓入口保留这些信息。基金仍走净值分段。边界脚本增加行情详情不得反向依赖目录面板、目录面板不得依赖账户写入编排的约束；来源名称映射仍复用其原有独立叶模块。

## 本地验证

| 输入与命令 | 结果 | 日志 |
| --- | --- | --- |
| DSA：`env PATH="$PWD/.venv/bin:$PATH" ./scripts/ci_gate.sh` | syntax、critical flake8、确定性检查通过；7752 passed、1 skipped、4 deselected、626 subtests | `/private/tmp/common-price-dsa-gate-final-20261003.log` |
| Schemas：`pnpm --filter @thesis-ledger/schemas exec vitest run` | 589 passed；构建通过 | `/private/tmp/common-price-schema-full-20261003.log` |
| Server：`pnpm --filter @thesis-ledger/server exec vitest run`，最后两处准备/快照接缝修改后复验 | 2074 passed、125 skipped；252 文件通过、33 文件跳过 | `/private/tmp/common-price-server-tests-final2-20261003.log` |
| Server：准备/预检/窗口选择定向测试；快照来源/依赖/日级状态定向测试 | 60 + 29 passed；Server build 与修改文件 lint 通过 | `/private/tmp/common-price-fallback-wiring-tests-20261003.log`、`/private/tmp/common-price-snapshot-final-20261003.log` |
| Desktop：行情定向与全包测试 | 91 项定向通过；543 项全包通过；最后仅变更不可用提示后 API 7 项复验通过 | `/private/tmp/common-price-desktop-focused-20261003.log`、`/private/tmp/common-price-desktop-full-20261003.log`、`/private/tmp/common-price-chart-api-final-20261003.log` |
| Desktop：`pnpm --filter @thesis-ledger/desktop build` | TypeScript 与 Vite 构建通过；保留既有大分块提示 | `/private/tmp/common-price-desktop-build-final2-20261003.log` |
| 边界、workspace 依赖及修改的应用源码 lint | 通过；目录到行情组件的单向复用未引入非法依赖。边界脚本通过 `node --check` 和直接执行；该 `.mjs` 被既有 ESLint 配置忽略，不把忽略提示计作 lint 通过 | `/private/tmp/common-price-boundaries-final-20261003.log`、`/private/tmp/common-price-dependencies-final-20261003.log`、`/private/tmp/common-price-ui-lint-20261003.log` |
| `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs`，C06 收尾复验 | ratchet passed，10 项未增长的既有超限警告；此前 1550/1549 行失败经测试职责拆分修复，未提高阈值或修改忽略规则 | `/private/tmp/ledger-test-split-size-20261003.log`；历史失败 `/private/tmp/common-price-size-final-20261003.log` |

未变更 DSA、Schemas 的已通过输入后没有重复运行其高成本检查。Server 新发现的准备接缝修复后才重跑相关定向、全包、构建及最小目标部署。

## 目标部署与配置

先执行 infra `./scripts/sync-code.sh all`，最后 Server 准备接缝修复后执行 `./scripts/sync-code.sh thesis-ledger`，兼容性预检、同步、重启和健康检查通过。日志分别为 `/private/tmp/common-price-sync-all-20261003.log`、`/private/tmp/common-price-sync-final-20261003.log`。没有新增依赖、Schema、原生 SDK 或 Dockerfile 变化。

目标 DSA、Server、Worker 均健康。DSA 镜像为 `sha256:6a7252651a631bc15dfc6824468f8485cee181ad7827c87935b77ace2215d725`；Server/Worker 为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`，均未因快更改变。本轮运行在容器可写层，容器重建需重新同步或构建包含该代码的镜像，不能当作已发布新镜像。

最终 Desired/DSA revision 均为 36、`syncState=applied`：ETF qfq 为 HiThink 主源、腾讯备源；none/hfq 为腾讯。验收时临时停用的两个来源均已恢复 `enabled=true,configured=true`。既有 efinance 净值历史路由保留，其准入过期仍如实显示。

## 真实普通回测与冻结重放

标的 `159516.SZ`，正式区间 `2026-05-16..2026-08-09`，预热至 `2026-04-30`。普通策略 v2 使用同一价格序列的收盘/开盘比较、50% 权益定仓；显式零费用、连续归一化数量、固定供应商快照。以下均通过正常 Server 准备、幂等创建、真实 Worker 终态，以及目标 Worker 只读冻结重放：

| 实际来源 / 口径 | Run ID | 结果校验值 | 终态 / 完整性 |
| --- | --- | --- | --- |
| 腾讯 hfq 主源 | `f66b82b3-ac55-4046-b8a2-2da33b823af4` | `4a11f72fb3b0ae7f` | succeeded / complete |
| HiThink qfq 主源 | `4a5b559c-58ad-46ad-a075-69e5690c24ed` | `01fec3349070ad49` | succeeded / complete |
| 腾讯 qfq 主源 | `8ea8a831-9b3c-4463-8352-b0b92730499d` | `cb560dbe65dbe802` | succeeded / complete |
| 腾讯 qfq 备源，HiThink 暂停用 | `e784e529-6d24-4df1-908c-5d5fba4c515c` | `f310629effbdb556` | succeeded / complete |

快照依次为 `4f84f49f1fc605df6dfc3bf89b9b3d11370c61294fee1ccc62a94c01ae965fa6`、`ed39aa7aae459aeb7e5d0a034923053b58a219cb8eea14f029005649dc48b40b`、`b7ce738be95826ea2ac7d4981dba756e30eaec32593e6de661f18a7f5e234ff5`、`ecd91a4f954bbd136946dcc347ce2df5ef64e43bc0408cf4966122e657e99b9b`。

重放使用 `assertCurrentRunForRead`、`LocalSnapshotStore.v3.replay`、`LocalSnapshotV3Runner.run`，与数据库结果校验值逐条一致。日志：`/private/tmp/common-price-replay-20261003.log`、`/private/tmp/common-price-fallback-replay-20261003.log`。备源 Run 的准备结果记录 `routeIndex=1,effectivePolicyRevision=36`；未产生人工兼容证据包。

备源首次准备暴露配置准备漏传价格研究用途，返回 `invalid_proof`，未创建 Run；定位后补齐准备与快照接缝、回归并同步目标，第二次才通过。原腾讯 HFQ 的日级元数据阻塞及该次失败均已由修复后证据取代，不伪记初次通过。

## 图表与只读交互

使用本机 Desktop Web 开发界面 `http://127.0.0.1:5173` 连接目标 Server；验收期间重启本轮开发服务以清除旧组件缓存。不是 Electron 原生窗口验收。

- 目录搜索 `159516` 后可直接打开 `159516.SZ` 行情，没有点击确认标的、添加持仓或写入 Ledger。
- 三口径可选且来源如实披露。2026-09-30 的腾讯不复权/前复权收盘为 0.651，后复权为 2.604；切换后价格与标签同步，切回 qfq 正确。
- 原三个月视图经历史补取后，“全部已加载”显示 `2025-08-21..2026-09-30`。不拼接不同口径或不同来源缓存。
- 正常 Server 图表 API 的 none/qfq/hfq 各返回 90 点。HiThink 停用时，qfq options 为 `availableVia=backup`，实际读取腾讯 `routeIndex=1`、90 点；恢复后主备顺序仍为 revision 36。
- 腾讯停用时，不复权/后复权选项禁用并显示“行情路由已禁用”；日线和技术指标失败显示不可用，没有以其他口径假装成功。随后恢复腾讯启用并刷新页面，三口径重新可选，后复权图表恢复 2.604，最终界面截图已随会话输出。
- `159516.OF` 详情只有净值分段，没有价格复权选择器。当前净值路由不可用如实展示；本次只验证分段隔离，不把该状态计作真实 NAV 正向通过。
- 原三条 Run 的稳定序列化配置 SHA-256 与结果校验值在所有图表操作前后完全一致，比较日志为 `/private/tmp/common-price-config-before-20261003.log` 与 `/private/tmp/common-price-config-after-final-20261003.log`。
- 页面 Console 检查无错误。浏览器原始 CDP 网络采集权限被拒绝，已停止该采集；实际 API 的独立验收和浏览器 DOM 操作分别记录，不冒称已抓取浏览器网络流量。
- 备源 Run 的结果页面显示“已完成”，创建于 11:40:25、完成于 11:40:27；来源的精确 target 与 routeIndex 由正常准备结果核对。

## 范围对账

基础价格交付完成；未完成的严格历史 PIT、真实份额/公司行动、可逆因子、专业行情与非共同研究辅助能力按用户本轮范围调整为扩展。AKShare/EastMoney 未完成事件/价格、Tushare 当前免费权限不足、RQData 无账号及 TdxAiData 付费/ARM64 问题继续明确跳过。腾讯 none 本轮用于图表；真实 `raw-events` 回测仍依赖真实份额和公司行动，不计作已通过。

原任务编号及 AC 对账以[主 Task §0](../2026-09-25-multi-source-adjustment-aware-backtest.md)为准。现有事件、严格 PIT、其他市场、NAV 和账户隔离由其已完成定向及本轮包级回归保留；没有新增外部事件或高级来源验收声明。文件尺寸门禁已通过；Electron、原始浏览器网络采集及新镜像发布均不计作本轮通过。

## C06 测试职责收尾

此前尺寸门禁失败来自当前 Ledger 合同夹具新增必要的 `envelopeVersion: 3`。本次保留该字段，把基线观察批次的命令、写入 harness 和 4 项测试迁至 `apps/server/test/ledger/baseline-observation-batch.service.test.ts`，导入草稿提交/修订的 15 项测试留在原文件；两者通过 `baseline-import-ledger.fixture.ts` 复用当前事件及持久化形态。测试主体和断言保持原样，原文件由 1550 降至 1358 行。没有变更生产源码、依赖、数据库或目标运行时。

| 检查命令与输入 | 结果 | 日志 |
| --- | --- | --- |
| Server：`vitest run test/ledger/baseline-import.service.test.ts test/ledger/baseline-observation-batch.service.test.ts` | 19 passed；迁移前后用例总数一致 | `/private/tmp/ledger-test-split-focused-20261003.log` |
| `pnpm --filter @thesis-ledger/server typecheck`；三个修改/新增测试文件的 ESLint | 通过 | `/private/tmp/ledger-test-split-typecheck-20261003.log`、`/private/tmp/ledger-test-split-lint-20261003.log` |
| `pnpm --filter @thesis-ledger/server exec vitest run` | 2074 passed、125 skipped；253 文件通过、33 文件跳过 | `/private/tmp/ledger-test-split-server-full-20261003.log` |
| `node scripts/check-boundaries.mjs`；`node scripts/check-workspace-dependencies.mjs`；`GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` | 全部通过；尺寸门禁保留 10 项既有警告 | `/private/tmp/ledger-test-split-boundaries-20261003.log`、`/private/tmp/ledger-test-split-dependencies-20261003.log`、`/private/tmp/ledger-test-split-size-20261003.log` |

测试调整未影响 DSA、Schemas、Desktop、应用构建或部署输入，沿用上文已通过结果；本次未重复镜像构建或容器同步。
