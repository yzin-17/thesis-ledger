# 行情修复、镜像持久化与门禁收口证据

任务：[多来源分钟与小时行情接入](../tasks/2026-11-07-market-intraday-sources.md)。本记录只承接用户新确认的三个有序交付，原来源接入证据保持。

## U1：实时报价异常

### 原因与修复

- 复查前真实详情已能通过腾讯备用源返回 4.124，不能将当下成功误报为历史问题不存在。原 2026-11-07 15:17:29 的 DSA 日志明确记录腾讯在 `provider-qualification` 阶段被 `request_budget_cooldown` 拒绝，没有实际上游读取。
- `thesis_ledger_cache_context_v3.py` 原本把完整全局策略版本纳入报价缓存代次。分钟配置从 189 更新到 190 后，报价目标未变，但 Server 的新缓存命名空间没有旧的有效报价；DSA 的 ETF 报价 10 分钟来源预算仍有效，导致页面报不可用。
- 新增 `thesis_ledger_cache_route_epoch.py`，只读既有已应用策略历史，查找精确路由最近控制变更的连续代次。当前策略 192 的 ETF 报价路由代次为 189；无关分钟策略更新不清空报价缓存，响应 `policyRevision` 仍为最新真实版本。
- 保留完整前后控制快照的一致性检查、来源配置/凭证/资格事实及绑定版本。主备顺序、路由/全局停用再启用均改变代次；历史缺失或不可读时退回全局版本，不能猜测旧缓存有效。不新增表、不改历史、不降低来源请求预算。

### 验证

- DSA `tests/test_thesis_ledger_cache_context_v3.py`：29 通过，包含无关分钟配置复用、主备顺序变化、全局/所属路由关闭再开启、删除再恢复、配置与凭证变更、采样竞态、认证及参数隔离；来源读取全部受控。
- Server `quote-cache-window`、`market-cache-control`：8 通过，涵盖有效缓存、请求预算、并发与控制变化；DSA 能力边界通过。日志 `/tmp/market-closeout-cache-tests.log`、`/tmp/market-closeout-server-cache-tests.log`。
- 在 infra 目录执行 `./scripts/sync-code.sh dsa`，退出 0，DSA 健康。此步仅用于验证 U1，不作为镜像完成证据。
- 修复后真实报价详情为 `stale`，价格 4.124，来源腾讯，来源时间 2026-11-06 16:14:52（北京时间），量额仍为空；成功复用既有受控代次下的有效报价，保留 `servedFromCache` 和刷新失败状态，未伪装成新获取行情。
- 真实浏览器自选页在 1440/1024/768/390 均显示 4.124 CNY、腾讯、来源日期；无横向溢出、页面异常和业务写入。此轮仅验收报价，走势详情请求被拦截以免额外外呼，不将截图中的走势失败计为真实来源结论。截图 `/tmp/market-closeout-quote-<width>.png`，结果 `/tmp/market-closeout-quote-ui-results.json`。

## U2：镜像持久化

已采集更新前基线：PostgreSQL 23 张业务/冻结/策略表，共 3958 行；DSA 5 张配置、准入、策略和账号权限表，逐表计数与内容摘要；五个容器的 ID、镜像、全部挂载。脚本仅执行只读 SQL/inspect，摘要不包含秘密。基线 `/tmp/market-closeout-before-images.json`。

在 infra 目录执行 `LONG_BRIDGE_SOURCE_PYTHON=<现有 Codex Python 3.12> ./scripts/update.sh all`，采用默认数据库检查模式、保留全部卷，费用 0，不改研究执行开关。退出 0，完成后的镜像、容器、代码及保护数据比较如下。

### 重建结果

- 正式 `update.sh all` 退出 0。DSA 镜像由 `90c59c35…` 更新为 `c6f85df7…`；Server/Worker 由 `57ad8f54…` 更新为 `b1761bc3…`，三个容器 ID 均变化；PostgreSQL、Redis 容器未变，全部挂载保持。完整 ID 和前后摘要见后续汇总。
- PostgreSQL 23 张保护表的 3958 行内容摘要、DSA 五张配置/准入/策略/权限表摘要全部相等。
- DSA 52 个变更生产 Python 文件在重建容器内与工作区逐一 SHA256 相同，`docker diff` 没有生产 `.py` 文件覆盖，证明代码来自新镜像。
- 报价真实新获取成功：4.124，腾讯，来源时间 2026-11-06 16:14:52，`servedFromCache=false`，获取时间 2026-11-07 20:14:02（北京时间）。
- 首次当前自选的 efinance 分钟读取失败，诊断确认 `_ef_call_with_timeout` 4.5 秒超时；保持此失败，不放宽预算、不改现有主备。此为外部来源条件，不用镜像健康覆盖。
- 使用既有富途港股 ETF 02800.HK 验证新镜像正常执行面，1m 返回 90 点、60m 返回 6 根，身份/不复权/来源均正确。未改客户端图表渲染，复用此前四屏宽图形布局及 U1 四屏宽报价证据，不将 efinance 超时标成成功。

## U3：门禁清理

U2 完成后开始。写集先限定为旧错误涉及的 6 个 Desktop 源码/测试文件，保留现有改动；不提高阈值，不关闭规则或删除断言。


### 首轮门禁修复

修复 6 个 Desktop 文件的 13 条旧错误：研究选择测试和自选走势测试使用异步 `act` 显式等待微任务，保留原异步刷新语义；自选 mock 复用 API Client 的查询类型并保留取消信号验证；去掉多余类型断言和未使用图标导入；优化准备组件使用已有包的具名类型导入；修复收益读取测试 JSX 返回式中的非法逗号。没有关闭规则、提高阈值或删除断言。

定向 lint 通过；相关四份测试共 22 项通过。主仓继续修复 Mobile 3 条、Server 2 条和基准脚本 1 条错误，合计 11 个文件中的 19 条 lint 错误；全仓 9 组 3263 文件 lint 通过，复杂度门禁通过并保留 6 个存量文件尺寸警告。

### 全量回归发现与处理

- 宿主 `.venv` 的 Python 链接失效，未覆盖虚拟环境或安装依赖。首轮使用导出的 Shell 函数导致部分清空环境的子进程找不到依赖，并绕过门禁脚本测试的 PATH 桩；改为 `/tmp/market-closeout-python` 临时 Python 3.12 环境，以 `.pth` 复用既有 site-packages，Python/Python3/flake8 均走该环境。临时 flake8 启动器补齐 `__main__` 保护，避免 macOS spawn 重复执行；原仓库门禁入口和选择项保持。
- DSA 旧测试的能力总量、来源总量、按元组位置选择日线/事件绑定及默认启用假设与当前契约不一致。改为按能力选择绑定，补齐 191 条分钟精确目录断言；需要读取的隔离配置显式启用。RQData 事件使用受控 SDK 工厂，安装能力也由该夹具明确模拟；无准入不解密、账号轮换、晚到结果与错误分类断言保留。
- 新增分钟证券市场校验误作用于日线；公共 Schema 收窄为仅校验分钟符号市场，日线既有合同恢复。Server 图表详情与主备整窗 27 项测试通过，完整 Server 4006 项通过、403 项显式隔离/外部测试跳过；Mobile 231 项通过。
- 物理数据环境的 macOS 冷启动追踪确认，新复制的原生扩展首次加载约 18–22 秒，超过原测试 15 秒；仅 macOS 临时进程监听等待改为 30 秒，Linux 保持 15 秒。新增 DELETE 等端点的鉴权也纳入断言。物理复制、无模型 SDK、禁止非本地网络、重启、鉴权与资源关闭 7 项通过，日志 `/tmp/market-closeout-dsa-physical-final.log`。
- Desktop 全量初次 12 项超时，两份对应测试独立运行 12 项全部通过；4 个 worker 时仍有 3 项超时，继续以 2 个 worker 验证资源争用，不放宽 5 秒断言上限。同期新增的风险反馈字段不在本轮起始摘要中，其 `evaluatedRuleCount` 本地类型已对齐 Schema 的可选 `undefined`，Desktop 类型检查通过。相关日志保留，不将首次失败改写为成功。

### 最终输入与运行态

- Desktop 以 2 个 worker 完整运行 261 份测试、1670 项全部通过；将相同并发上限写入现有 Vite 测试配置，再以默认配置运行此前两份路由测试，12 项通过。没有增加测试超时。日志 `/tmp/market-closeout-desktop-full-final.log`、`/tmp/market-closeout-default-test-runner.log`。
- 新闻 SDK 子进程入口在测试中被直接调用，`logging.disable(CRITICAL)` 泄漏至后续日志测试；在三个直接调用入口的测试模块恢复原日志开关，保留生产静默行为。包含新闻、日志、拆分诊断及跨进程 Schema 的 145 项定向回归通过。完整 DSA 门禁的 PATH 同时加入实际 Node 路径，不能把找不到 Node 当成合同错误。
- 主仓最终 `pnpm build` 和 `pnpm -r typecheck` 退出 0；边界与依赖图检查通过。全仓 lint 最终通过 9 组 3267 文件。同期风险输入和 API 限流等源码在起始摘要后变化，保留这些 WIP，按当前输入补跑 Server 与 Schema 全量测试；未把最早一次通过直接套用于新输入。
- 因公共 Schema 和 Server 生产代码在 U3 变化，在 infra 目录执行 `LONG_BRIDGE_SOURCE_PYTHON=<现有 Codex Python 3.12> ./scripts/update.sh thesis-ledger`，退出 0。Server/Worker 最终镜像 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`，两个容器重建；DSA 保持 `sha256:c6f85df7ed2e0f0067a313638c4fb4cc48b538a368b9b480f0cc3b8d160ea28e`。此轮未重复构建 DSA。
- 第二次更新前后、与第一次更新前相比，PostgreSQL 23 张保护表 3958 行内容摘要及 DSA 五张保护表完全一致，全部挂载保持；PostgreSQL/Redis/DSA 容器未重建。证据 `/tmp/market-closeout-final-image-comparison.json`、`/tmp/market-closeout-after-final-server.json`。
- Server 的 `ai-model-receipt.js`、公共 Schema 的 `market-chart-wire-v3.js` 在宿主构建与最终容器中 SHA256 一致，Server `docker diff` 为空。最终 `/api/v1/health` 返回 HTTP 200、`healthy`；不重复外呼，用 U2 已验证的同一 DSA 镜像来源执行证据承接分钟/小时验收。

### 最终门禁结果

| 范围 | 最后结果 | 证据 |
| --- | --- | --- |
| 主仓构建、类型检查 | 全包通过 | `/tmp/market-closeout-final-build.log`、`/tmp/market-closeout-final-typecheck.log` |
| lint、边界、依赖 | lint 9 组 3267 文件通过；边界及 8 包依赖图通过 | `/tmp/market-closeout-final-workspace-lint.log`、`/tmp/market-closeout-final-boundaries.log`、`/tmp/market-closeout-final-dependencies.log` |
| 复杂度、秘密扫描 | 退出 0；保留 6 个存量尺寸警告；19015 文件秘密扫描通过 | `/tmp/market-closeout-complexity-final.log`、`/tmp/market-closeout-secrets-final.log` |
| Server 最新输入 | 505 份通过、90 份显式跳过；4016 项通过、403 项跳过 | `/tmp/market-closeout-server-latest.log` |
| Schema 最新输入 | 130 份通过、1 份跳过；1487 项通过、3 项跳过 | `/tmp/market-closeout-schemas-latest.log` |
| Desktop | 261 份、1670 项通过；默认并发配置下此前失败的两份测试 12 项另行通过 | `/tmp/market-closeout-desktop-full-final.log`、`/tmp/market-closeout-default-test-runner.log` |
| Mobile、Domain、API Client、DSA Adapter | 分别 231、767、209、3 项通过；输入未变，复用完整工作区执行中的对应结果 | `/tmp/market-closeout-full-tests-final.log` |
| DSA 完整门禁 | 语法、关键 flake8、确定性检查、跨进程合同及登记离线集全部通过；7559 项通过、315 子测试通过、1 项跳过、4 项网络用例排除 | `/tmp/market-closeout-dsa-verified.log` |

DSA 最后命令为 `PATH=<临时 Python bin>:<实际 Node bin>:<Volta bin>:<系统 bin> ./scripts/ci_gate.sh`，执行目录为 `daily-stock-analysis`，退出 0；没有改变门禁脚本、测试登记或排除项。主仓最早完整执行因 Desktop 并发超时失败，最终采用各包相同输入的通过结果及最新变化包的全量复测，不把失败的根命令标成通过。显式隔离数据库、真实外部来源及原生设备验收不由单元测试替代，也未擅自开启。

最终输入比较 `/tmp/market-closeout-final-input-diff.json` 确认生产输入稳定；从最终构建输入快照后仅增加 Desktop 已验证的并发上限和三个已由完整 DSA 门禁覆盖的测试日志恢复夹具，没有新增文件。保护数据与配置未变化，未 stage/commit/push；U1、U2、U3 均完成。来源缺权限、缺凭证及当前 efinance 网络超时保持真实状态，活动 Task 继续承接其外部解除条件。
