# 个人研究首批实施：基础报价按字段降级

> 日期：2026-10-06；依据：[已完成预研](2026-10-06-personal-research-feasibility.md)、[现行 Spec](../../specs/2026-10-03-multi-source-remaining-acceptance.md)和[原 Task 的 PR 队列](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md)。
> 首批结论：PR01～PR05 的个人研究首批交付完成；PR04 类型检查已复验通过，PR05 已按消费者先行顺序快更并验收页面。首批验收时策略未配置实时Quote；随后用户继续请求的PR06～PR08及PR08a已启用腾讯ETF基础Quote并完成真实页面验收，见[续接证据](2026-10-06-tencent-etf-basic-quote.md)。原严格能力保持独立状态。前六节保留上一轮执行记录，本对话首批结果见第七节。

## 一、范围与结果

用户要求以个人研究可用性为目标，在已完成预研后继续实施。已同步原两组 Spec／Task：严格 PIT、完整因子／事件证明、专业 Quote 完整演练及异地回退不再是普通价格研究的统一前置；原高级能力没有被勾选为通过，原共同价格完成结论保持。未创建第二套研究引擎、质量平台或重复 TODO。

基础 Quote 只将 `volume`／`amount` 从数值扩为数值或 null。缺失、占位文本、布尔值、负值和非有限量额公开为 null；真实 0 保留，不以 0 冒充未知。HiThink 未使用的 `price_change`／`price_change_ratio_pct` 缺失或异常也不阻塞报价。现价、前收、OHLC 和证券身份继续验证，原认证、路由、准入与修订、晚到撤销、来源时间及陈旧回退保持。

本批不是完整“仅价格即可”的 Quote 合同：OHLC／前收仍为必需字段，HiThink 现有来源准入也没有取消。既有配置未就绪仍可能拒绝读取，不把代码局部完成表述为所有来源已可用。未知量额单位继续标 unknown，不猜测换算，不因此授予量额敏感计算资格。

Server 生产读取和缓存本来即可透传 Quote，Desktop 页面本来就展示原行情时点且不消费量额，因此本批仅调整共享 Schema，增加读取／缓存回归，没有改 Server 业务读取代码或界面样式。价格策略、费用、分红现金账本、乘法／等差派生、Snapshot／Runner 均未修改。

## 二、文件与职责

| 仓库／路径 | 本批改动 |
| --- | --- |
| 主仓 `packages/schemas/src/market.ts` | 仅 Quote 两字段 nullable；543 行不增长，既有其他 WIP 保留 |
| 主仓 `packages/schemas/test/quote-partial-fields.test.ts` | 新增量额 null／数值、双时钟、单位和核心非法输入回归 |
| 主仓 `apps/server/test/market/quote-partial-fields.test.ts` | 新增实际 Reader、fresh／last-valid 缓存和错误身份／价格回归 |
| DSA `src/services/thesis_ledger_quote_values.py` | 非必需报价数值规范化，异常为 null，明确不用于核心价格 |
| DSA `src/services/thesis_ledger_hithink_quote.py` | 量额和未使用涨跌字段使用可空规范化；226→224 行 |
| DSA `src/services/thesis_ledger_provider_runtime.py` | 仅从必需字段验证中移出量额，其余校验保持；2403→2401 行 |
| DSA `api/thesis_ledger_quote_fields.py`／`api/thesis_ledger.py` | Quote 公开数值投影按职责提取，所有生产者在 HTTP 边界规范可空量额；API 入口1894→1887行 |
| DSA `tests/test_thesis_ledger_quote_values.py`／`tests/test_thesis_ledger_hithink_quote_runtime.py` | 测试控制输入经过真实 HiThink 适配、临时策略存储、鉴权网关与 HTTP 序列化，不替换这些业务层 |
| DSA `tests/test_thesis_ledger_control_v3.py` | 仅为原目录用例补显式 synthetic 凭据前提，不修改目录逻辑或降低断言 |
| DSA `docs/thesis-ledger-basic-quote.md`／`docs/CHANGELOG.md` | 记录新合同、原有准入边界及消费者先行的部署顺序 |

原两组多源 Spec／Task 是本次范围与状态的唯一入口；本文件记录实际结果，不建立平行执行台账。历史收费与状态继续由原 `2026-10-06-historical-rules-primary-backup.md` 任务拥有，本轮未修改该任务或其实施文件。

## 三、验证结果

以下均在宿主本地执行，测试临时 SQLite／Redis 替身不代表目标服务。未做新的金融取数或收费调用。

| 检查 | 实际结果 | 边界 |
| --- | --- | --- |
| DSA 首轮报价定向 | 71 项通过 | 可空数值、真实适配、鉴权 HTTP、准入／撤销／时钟的受控输入测试 |
| Schema 定向 | 2 文件、25 项通过 | 新合同和既有 contracts |
| Schema build／typecheck | 通过 | 更新本地 dist 后消费者再验证，不是部署 |
| Server Quote 定向复验 | 2 文件、16 项通过 | Reader／缓存／并发和必需字段回归 |
| Schema 全包 | 60 文件、691 项通过 | 当前本地包 |
| Server 全包 | 298 文件通过、47 文件跳过；2411 项通过、217 项跳过 | 当前本地包；跳过项未伪记通过 |
| DSA 全量后端门禁 | syntax、关键 flake8、确定性检查通过；初轮测试 7842 通过、1 失败、1 skipped、4 deselected、626 子测试通过 | 唯一失败是原目录用例缺少 HiThink 测试凭据，见下文；不标初轮全量通过 |
| DSA 失败修复后的定向 | 5 文件、82 项通过；未设置外部 HiThink key，由该用例显式设置 synthetic key | 含完整目录测试文件和报价／时钟回归；测试前提修复后未重复全量7843项 |
| DSA 最终源码检查 | 8 个 Python 文件 AST 与关键 flake8 通过 | 只检查本批改动 |
| api-client／dsa-adapter／Desktop／Mobile 类型检查 | 通过 | 新 Schema 的消费者兼容；不代表原生编译或运行态验收 |
| Desktop 行情定向 | 3 文件、19 项通过 | 行情展示／弹窗／类型纯逻辑，没有新增视觉修改 |
| 主仓局部 ESLint、两份新测试 Prettier、边界与依赖图 | 通过 | 没有放宽门禁或增加忽略 |
| Server 类型检查 | 未通过 | `backtest-nav-domain-input.ts:50` 的 `historicalKnownAt?: string` 与 `string | undefined` 不匹配；不是 Quote 量额错误 |
| 定向 git diff／文档路径 | 检查通过 | 相对文件路径存在；不代表所有生产功能通过 |

### 本轮定位与修复的检查问题

首轮 Server 新测试有两项失败。检查确认该包通过 workspace 导出读取了仍要求数值量额的旧 Schema `dist/market.js`；构建 Schema 后原样复验，16 项全部通过，没有删改断言或绕过合同。

DSA 初轮唯一全量失败为 `test_v3_route_catalog_is_exact_complete_and_independent_of_policy`：期望 HiThink 基础日线路由 ready，但该用例未提供凭据。单独加入 synthetic 环境值后原断言通过，随后只在该测试设置假凭据，并在无外部 key 的进程中复验目录和报价5文件82项通过。没有用真实账号或修改实际目录准入。全量测试前提与修复后的定向验证分别保留，不把初轮失败记录覆盖成通过。

### 尚未解除的类型问题

Server `src/backtest/backtest-nav-domain-input.ts:50` 将执行模型 source 传入 `FrozenNavExecutionModelSegment` 时，历史可用时刻可选字段的显式 undefined 与 `exactOptionalPropertyTypes` 不相容。该文件实际内容与 HEAD 完全相同，且不属于本批写集；这不证明整个工作区都无并行类型变更，也不把该问题归因于某个对话。未通过修改 Quote Schema、关闭 TypeScript 选项或修改其他任务的 NAV 实现来绕过。

该问题由 Backtest／NAV 所属执行任务修复后，复验 Server typecheck 即可继续 PR04；若覆盖本批的输入未变化，不要求重做取数、预研或全量测试。PR04 因这一必要检查保留未完成，不阻断独立源码交付，也不把它变成重新补严格历史证明的理由。

## 四、环境与证据位置

主仓开始于 `main@514abeebfe57bac0c16271439d8b777ff3b02a9f`，577 项 dirty；DSA 为 `yzin@d40549602d187da7bdd0e8bebb59d2a0fc271919`，32 项 dirty；infra 为 `main@dd3d92b5f46a780d10fdc3e66543b98471aa9bc2`，49 项 dirty。验证使用当前未提交工作区，不声称这些 commit 单独包含本批功能。

命令、日志、原文件对比与测试结果保存在：

`/tmp/thesis-personal-research-implementation-20261006-uwcmlp2w/`

主要结果：`targeted-results.json`、`schema-build-results.json`、`package-results-main.json`、`package-results-dsa.json`、`consumer-results.json`、`dsa-final-focused-result.json`。对应日志为 `schema-package.log`、`server-package.log`、`dsa-package.log`、`consumer-typecheck.log`、`dsa-final-focused.log` 等；未把完整成功日志塞入 Task。

所有 Shell 由 RTK 包装；pnpm 使用已安装工具，注册表变量指定 npmmirror，未安装新依赖。DSA 后端门禁使用现有 `.venv` 与 `scripts/ci_gate.sh all`，离线测试筛选 `not network`。本批没有访问或变更真实金融凭据。

## 五、部署、撤回与后续边界

V3 的量额由 number 扩为 number | null；新消费者能读旧数值，旧消费者可能拒绝 null。因此目标更新顺序是先消费者（Schema／Server／客户端），再 DSA。只有当前工作区必要检查解除，并与其他目标任务协调好运行窗口，才能通过 infra 正式维护入口执行。PR05 仍未执行；没有把代码写入用户正在使用的容器或改变路由。

本轮没有数据库迁移、配置保存、凭据修订、服务启停、Docker 操作、故障注入、备份恢复、上传、stage／commit／push。未部署时无需服务回退；若要撤回源码，仅撤回本批相对开始时备份的局部补丁及新文件，不使用 `git checkout/reset` 覆盖其他 WIP。

现金分红、原始价格现金收益、本地等差派生、进一步减少人工源准入和目标部署仍需各自的最小实施叶。本批不把这些高级功能算作完成，也不要求它们齐备才能开展已有的普通价格研究。

## 六、首批一致性审查

已对照实际差异检查 Scope、Schema、HiThink／HTTP 量额语义、原时间和单位语义、测试与文档一致性；原两个超限 DSA 入口均减少行数，未改共享 barrel、费用／事件合同或计算引擎。所有原五项高级义务保留准确边界，PR01～PR03 与 PR04／PR05 的状态分开。

结论：本批代码与局部业务验证通过；当前工作区 Server 类型检查未通过，故 PR04／PR05 不勾选，不宣称可部署或完整产品验收。后续只补真实剩余接缝，不重做已完成预研。

## 七、本对话续接：PR04／PR05 验证与目标更新

### 7.1 授权、实际输入与类型阻塞

用户在本对话引用“核验多源输入”并要求继续完成。已读取该对话和现行个人研究 Spec／Task；本轮只续接首批 PR04／PR05，不启动现金事件、等差派生、严格 PIT 或异地恢复。三仓开始时 dirty 分别为 588、39、49 项，全部保留，没有 stage／commit／push。

实际运行 `rtk proxy pnpm --filter @thesis-ledger/server typecheck` 返回 0；没有复现上一轮 NAV 可选字段错误，没有修改 NAV 文件或归因于某个并行对话。比较上一轮 `tested-source-hashes.json`：本批 6 个生产文件和 Schema／Server／DSA 可空值测试均未变化，仅 DSA Quote runtime 测试有后续修改。沿用仍覆盖本批输入的全包证据，不将其外推为所有当前 WIP 的全量验收。

本轮新增 `packages/schemas/test/quote-dsa-http-contract.test.ts`：使用现有 DSA Python 环境、HiThink 真实适配代码、临时 SQLite、鉴权网关和 FastAPI 实际 HTTP 序列化；只有上游金融响应使用受控输入。输出跨 Python/TypeScript 直接交给当前 `quoteSchema`。覆盖股票/ETF × 缺失、占位文本、负值、无穷值、真实 0、正常数值共 12 个场景。没有调用金融网络或读取真实 Key。

该测试在单仓 CI 没有相邻 DSA Python 环境时按环境跳过；跨仓验收必须提供环境并实际运行。本机本轮为 1 项通过、0 跳过，不能用 CI 的环境跳过代替这一执行证据。

| 本轮检查 | 结果与范围 |
| --- | --- |
| Server typecheck | 通过，原阻塞未复现 |
| 新增 DSA HTTP → Schema 合同检查 | 1 项通过，内部 12 个场景；实际跨语言输出，无金融调用 |
| 后续变化的 DSA Quote runtime 测试 | 单文件 29 项通过，2 个既有依赖警告 |
| Schema typecheck、新增文件 ESLint/Prettier | 均通过 |
| Desktop build | TypeScript 和 Vite 构建通过；既有大 chunk 提示保留，不提高阈值 |
| 本批原全包结果 | 沿用未变报价输入的上一轮 691/2411 等证据，未重复全量测试 |

复验命令：

```bash
rtk proxy pnpm --filter @thesis-ledger/server typecheck
rtk proxy pnpm --filter @thesis-ledger/schemas exec vitest run test/quote-dsa-http-contract.test.ts --reporter=dot
rtk proxy pnpm --filter @thesis-ledger/schemas typecheck
rtk proxy pnpm exec eslint packages/schemas/test/quote-dsa-http-contract.test.ts
rtk proxy pnpm exec prettier --check packages/schemas/test/quote-dsa-http-contract.test.ts
# 以下在相邻 DSA 执行
rtk proxy .venv/bin/python -m pytest tests/test_thesis_ledger_hithink_quote_runtime.py -q --disable-warnings
```

### 7.2 正式入口与兼容次序

只读对话快照确认自然语言策略已完成、Backtest 无活动执行；未向其他对话发消息。普通沙箱的进程检查权限不足后，经只读升级检查未见更新/构建占用。目标容器均已运行，Server package、Prisma Schema/raw-owned inventory 与 DSA requirements 初步字节一致；正式脚本继续核对全部 workspace 依赖和 migration。宿主可用空间约 11.44 GiB，本次属于兼容的代码快更，未构建镜像或执行缓存/卷清理。

两次执行目录均为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`；入口为该仓 `scripts/sync-code.sh`，均设置 `COREPACK_NPM_REGISTRY`、`pnpm_config_registry`、`npm_config_registry` 为 `https://registry.npmmirror.com`。未改变其他更新参数、数据库模式或目标配置。

| 阶段 | 实际入口与退出结果 | 独立核对 |
| --- | --- | --- |
| 消费者先行 | `rtk proxy env COREPACK_NPM_REGISTRY=https://registry.npmmirror.com pnpm_config_registry=https://registry.npmmirror.com npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh thesis-ledger`，退出 0 | workspace/Server 构建、Server/Worker 同步重启及 healthy；容器内共享 Schema 实际接受 null 和 0，并拒绝非法价格；两端 Quote Reader JS 与宿主字节一致 |
| DSA 后更新 | 同样的注册表环境下执行 `./scripts/sync-code.sh dsa`，退出 0 | DSA WebUI 构建、Python/WebUI 同步、重启及 healthy；5 个相关生产文件与宿主一致 |

Server/Worker 镜像 ID 保持 `sha256:95d8e518ffee019a8a29a13979b4fd9736f914153c4b78c636d6e0866c87a0b0`；DSA 保持 `sha256:08bfe1b5a0d59d6b27c54e961a5850f603885b4686d459818897c68d3bcd250e`。这是可写层更新，容器重建后会消失；不表示新不可变镜像发布完成。

DSA 容器内以 `python -B` 只读调用实际公开投影：缺失 volume/amount 输出 null，真实 0 输出 0；没有初始化业务 Control Store、改凭据或调用上游。Server `/api/v1/health` 为 200/healthy，DSA `/api/health` 为 200/ok。健康和这些受控运行函数检查与在线 Provider 验收分开记账。

### 7.3 浏览器页面与现有路由边界

Computer Use 浏览器工具两次连接超时，停止重复连接。使用 bundled Playwright 与已安装 Chrome 的独立临时 profile；沙箱启动失败后按批准的本地只读浏览器检查执行，没有使用用户浏览器资料或创建持仓/任务。一次脚本定位把行情链接当按钮，修正为页面实际链接后继续；这属于验收脚本问题，不修改产品交互。

实际页面为 `http://127.0.0.1:5173/market-data`，Vite 开发前端连接目标 `127.0.0.1:3000` API；另已完成 Desktop 生产构建，本浏览器结果不冒称 Electron 或生产静态站点验收。

| 场景 | 实际结果 | 证据范围 |
| --- | --- | --- |
| 未拦截的真实目标页面 | 搜索 159516，打开 `159516.SZ/ETF` 行情；目录、chart-options、detail 均 HTTP 200，腾讯 qfq 最近收盘 0.651，日期 `2026-06-30..2026-09-30`，K 线/均线/MACD 与来源可见，页面未处理异常为 0 | 真实目标读取和既有价格路径；未点击确认标的、保存策略或重试金融来源 |
| 当前 Quote 策略 | policy revision/dsaRevision 均 36、syncState=applied；没有 Quote 路由。真实详情 quote 段为 unavailable/provider_policy_unavailable，页面显示暂时不可用 | 验证错误按能力局部披露；不是 HiThink Quote 在线正例，也不自动解除来源准入 |
| 受控 null Quote 页面 | 仅在独立浏览器拦截 detail 响应的 quote 段，注入 volume/amount=null、现价10及旧 marketTime；实际组件显示 ¥10.00、行情时点 `2026/9/30 16:14:43` 和陈旧回退，未把10月6日抓取时刻写成行情时间；页面异常为0 | 浏览器消费/时间/null 场景，受控数据不写目标，不计真实金融输入或持续可用性 |

截图为 `/private/tmp/thesis-personal-research-quote-page-20261006.png`（真实目标）与 `/private/tmp/thesis-personal-research-quote-controlled-null-20261006.png`（受控输入）。有界浏览器脚本为 `/private/tmp/thesis-personal-research-browser-20261006.mjs`；默认读取真实目标，`--controlled-null` 仅修改该临时浏览器的响应。两个 profile 均在脚本结束时关闭。

### 7.4 续接收口

PR04 的必要检查通过，PR05 的消费者先行更新、产物/健康核对和当前路由下页面消费通过；个人研究首批 PR01～PR05 完成。原策略和准入未修改，实时 Quote 仍未配置；要启用来源应另做最小路由/实际来源叶，不把本轮部署称为所有来源已可用。

现金事件/原始价格现金收益/本地等差派生、严格 PIT 和异地发布回退继续按各自需要和任务实施，未在首批勾选。没有新增依赖、迁移、费用或 UI 样式改动；没有提交、推送、上传、恢复或故障注入。最终局部检查确认链接/空白、新增测试和原生产输入稳定，Spec/Task 与上述实际范围一致。
