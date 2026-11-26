# 具名 V1 业务入口补验

对应[全产品具名 V1 合同与存量转换](../../specs/2026-11-24-named-v1-cutover.md)和[实施任务](../tasks/2026-11-24-named-v1-cutover.md)。日期为 2026 年 11 月 25 日，时间使用上海时区。

## 目标运行态

| 时间 | 执行目录 | 命令 | 配置与结果 |
| --- | --- | --- | --- |
| 20:27 | `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` | `./scripts/sync-code.sh all` | 默认配置，退出 0。DSA、Server 和 Worker 健康，沿用现有镜像和数据卷。 |
| 20:30 | `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` | `./scripts/sync-code.sh dsa` | 补更新闻和快讯合同，默认配置，退出 0，DSA 健康。 |
| 21:06 | `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` | `./scripts/sync-code.sh thesis-ledger` | 补更无事件日线证明及回测诊断，默认配置，退出 0。Server 和 Worker 重启后复核通过。 |
| 21:31 | `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` | `./scripts/sync-code.sh thesis-ledger` | 更新风险应用及研究提交的提示，默认配置，退出 0。Server 和 Worker 健康，重新核对目录及暂停待办。 |
| 21:50 | `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` | `./scripts/sync-code.sh thesis-ledger` | 移除已退役研究重试预填地址的限流登记，默认配置，退出 0。Server 和 Worker 健康，既有镜像和数据卷继续使用。 |

本轮更新落在目标容器的可写层。后续重建需从包含本轮代码的源码构建镜像。独立核对结果如下。

- 目标 Server 的 `/api/v1/health` 和 DSA 的 `/health` 均为 200。精确路由目录对 `contractVersion=1` 返回 488 条能力，状态为 `complete`。旧版本和缺失版本返回 400。
- 行情详情使用 `chartContractVersion=1` 返回现行结构，180 根的请求上限可回读。在股票详情上查询净值历史得到 `unsupported`，这一请求无需向行情供应商取数。同一请求使用版本 3 时返回 400。
- 当前生效修订仍为 203。A 股股票和 ETF 的同花顺报价对应 `a-share-prices-snapshot`、`fund-market-snapshot`，两条精确报价能力均就绪。两条快照来源没有匹配的可用原生 K 线周期，报价显示具体暂停原因。富途 `futu/futu` 对应 1 分钟和日线能力均就绪。
- DSA Data 和 Control 按 `dsa-data-v1`、`dsa-control-v1` 读回契约。旧 Control 握手返回 404。无效令牌下的握手、K 线、新闻和快讯均返回 401，四次均保留当前鉴权信封及匹配的请求标识和诊断标识。目标进程使用的新闻和快讯请求、响应模型均声明版本 1。
- 公告运行态识别停复牌、风险警示和日级价格规则的精确公告来源。修订 203 没有选中这些公告来源。对应正向读取通过受控公告样本验证。
- 目标复盘候选接口读取 6 个实际账户，得到 2 条正式候选及 0 条待核对记录。退役的计划对实际分析请求返回 404。受控样本验证未关联卖出保留日志身份、可能的减仓引用和统计排除原因。
- 净值回测列表请求在目标返回 200。目标录得 0 条净值运行，非空读取由受控运行记录验证，包括 V1 筛选、取消时间和独立净值配置。
- 无事件日线读取的受控用例验证现行具名证明与 `priceOnlyAllowed: false`。21:06 快更后，目标 Server 和 Worker 的 `market-event-free-tradability.js` SHA-256 均为 `41d79e8d29dd3e7908dcf2746bc90363609d59db3ce67b12f9856afddd02b09e`，与宿主构建一致。宿主 Server 和 DSA 健康接口均返回 200。
- 21:31 快更后，目标 Server 和 Worker 的 `strategy-risk-plan.js` 和 `ai-research-submission-v2.js` 均与宿主构建的 SHA-256 一致。宿主两个健康接口返回 200。现行目录仍为 488 条，旧版本和缺失版本仍返回 400。
- 21:50 快更后，目标 `/api/v1/ai/runs/:id/retry-prefill` 返回 404。目标限流登记模块 SHA-256 `9cdb9373bc09716e7468b6533970e92a1f1f814cf9b77e6ed98565c0cf73ebb2` 与宿主一致，现行目录仍返回 488 条能力，两个健康入口均返回 200。
- Redis 实时 Arena 队列仍标记暂停，唯一等待作业保持原身份，活动作业数为 0。对应 PostgreSQL 轮次状态为 `pending`，尝试次数为 0，冻结输入、预算预留和请求标识为空。自主比赛新建验证使用受控提交和单模型样本。

## 浏览器和回归

- Edge 使用 1440、1024、768 和 390 像素宽度访问实际自选页面。目录走目标 Server，报价和图表使用受控响应。同花顺快照显示暂停原因，富途日线和分时均发送现行版本、绘图并进入检查计划。页面没有横向溢出。
- 同样的四个宽度完成复盘待核对记录展开和 Arena 自主比赛草稿保存。比赛包括空开始日期、空结束日期及单模型，三个赛期组合均通过。受控接口回读比赛，未连接实际比赛写入口。
- 统一界面回归的 `strategy-rule-notification` 用例使用 Edge，在同样四个宽度完成创建、编辑、关闭和离开恢复，共 20 个场景通过。首次失败由测试策略使用旧持久化版本且信号来源未绑定标的导致，改用现行样本后重跑。正式风险版本过滤继续由服务端样本验证。
- 策略编辑器使用受控样本在同样四个宽度复核信号来源折叠标题、勾选区域、标签点击、键盘空格和横向宽度。浏览器检查发现字段组标题覆盖了独立的勾选项名称。每项使用独立字段关联后，四个宽度均通过，并由组件测试核对已加载目录时的标的名称回显。
- 共享 Schema 全量通过 1,728 项，共享客户端全量通过 280 项，移动端全量通过 288 项。Server、共享客户端和桌面端构建、桌面端和移动端类型检查，以及 infra 兼容清单检查通过。
- Server 的行情、净值列表、状态组合、DSA、复盘及自主 Arena 定向回归通过 123 项。DSA 鉴权、公告、新闻和快讯回归通过 137 项。
- 后续 Server 的净值 Worker、研究离线轨迹、正式风险及日线委托定向通过 68 项，队列协调、入场冻结、风险计划与 Arena 的另一组定向通过 103 项。旧版原始行情材料的读取副本、编译及质量生产者共通过 38 项，跳过 3 项依赖私有记录的样本。桌面端的研究、模型用途、策略和复盘定向通过 77 项，风险、行情披露、复盘与实际成交叠加的另一组定向通过 56 项。各组分别计数。
- 限流登记、55 笔迁移的结构与增量链、DSA 目录与 Provider、研报、账本和基金净值风险读取共通过 122 项。API 登记覆盖全部 350 个现行 Controller 操作。
- 本轮验证使用现行选源、只读目标请求及受控业务样本。真实行情源取数、真实模型请求及远端 CI 有各自验收记录。

## 全量回归状态

- 桌面端最终全量通过 2,107 项，共 326 个文件。最终类型检查和构建通过。移动端、共享 Schema 和共享客户端的全量结果见上节。
- Server 第二次单元全量运行通过 4,341 项，失败 591 项，跳过 59 项。随后复跑失败文件，再复跑仍失败的 63 个文件，该轮通过 341 项、失败 100 项、跳过 2 项。根据这轮复跑和之后通过的边界复测，仍有 85 个失败用例和 1 个收集阶段报错的文件，主要涉及回测冻结与执行、研究和策略编写。T10 保持未完成。
- 研究离线轨迹使用现行具名合同的合成样本。离线 CLI 复核四条轨迹、五次请求及原费用口径。原固定轨迹文件 SHA-256 `70d806d607415fd6500341b1f783d46f208a1356f7d4260706b346d2e77d2abc` 保留。受控研究实验使用由原材料重封产生的测试输入，原基准和原评价封存文件保留。
- 两个真实模型实验脚本的历史固定集包含 20 个旧冻结样本，离线验证确认现行 Schema 拒绝其原封存格式。继续实跑需要独立封存现行固定集并绑定其摘要与调用授权。历史实验的固定集、结果、请求与费用记录继续使用原摘要核验。
- 追加定向复测覆盖账本写入、净值回测队列与 Worker、策略编写加仓，四个文件共通过 34 项。策略编写文件恢复收集，账本和净值队列原有的 4 个失败用例已由更新后的场景覆盖并复测通过。按前后报告的文件对账，原失败清单还有 49 个文件中的 81 项待复测。Server 全量尚待复跑。
- 在进程内用现行具名合同重封 20 个研究样本，重封前逐项核对原冻结摘要，重封后逐项核对证据内容与工具调用绑定，并通过正式实验资格校验及评价覆盖校验。原基准与评价文件均通过字节对账。本次离线生成的候选基准摘要为 `ba300c9eac8f31cde78dd07cb99cbdbff5aa18977ebb3c438cc9421faa89ffda`，评价摘要为 `9f371a3a3b0425faa46d63c390d37cf692562fdaf410b6c11bbcc4ddde8d48b4`。

## 11 月 26 日 Server 回归

- 上轮清单的 49 个文件复现 76 项失败。按现行策略生成、研究提交、回测 Run 与快照合同更新测试，旧合同、越权修改和冻结摘要错误各有拒绝用例。随后复测 53 个文件，通过 336 项，跳过 2 项需要私有材料的回放。
- 快照完整性检查与冻结原价核验共用参考窗口判据。日线策略只声明原价来源且规则无原价依赖时可以完成冻结和回放，显式预留或有实际原价依赖时继续核验对应制品。多周期和累计起点用例沿用现行日级证明及冻结父窗。
- 首次全量通过 5,096 项，另有 4 个本机 HTTP 集成用例失败及 1 个基金净值文件收集失败。更新 HTTP 样本后，相关定向与行情冻结仓库共通过 80 项。下一次全量通过 5,101 项，基金净值文件仍因样本版本在收集阶段失败。将基金净值样本切换到版本 1 后文件正常收集。
- 正式入口 `node scripts/test-portfolio-valuation-postgres.mjs` 在主仓执行，默认隔离配置，退出 0。隔离 PostgreSQL 应用 55 笔迁移，通过基金净值、组合估值及基金行情缓存 16 项测试，脚本清理了临时容器。
- 离线行情窗口转换预览调用 Market 的归档核验入口，受控命令行验证有效旧行可转换、原摘要错误会拒绝。Server 构建、导入边界、依赖图及文件大小检查通过。
- 最终在主仓执行 `pnpm --filter @thesis-ledger/server exec vitest run --maxWorkers=4`，退出 0。813 个文件共通过 5,101 项，按现有配置跳过 604 项，零失败。
- 上海时间 00:41:55，从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，Node 为 24.22.2，Corepack、pnpm 和 npm 使用 `https://registry.npmmirror.com`，其余参数默认，退出 0。目标 Server 和 Backtest Worker 实际加载的 Server、Domain、Schema 与 Shared 产物 SHA-256 均与宿主构建一致。
- 00:43:50 完成独立核对。Server 和 DSA 健康接口返回 200，全部 5 个服务健康，容器镜像与挂载通过前后对账。目标 Worker 只读回放 3 份具名交易快照，覆盖普通回测、仅后复权研究和带不复权参考三种运行，共核验 32 份制品。样本快照身份、数据库结果校验和及 Arena 暂停队列的 1 条待办通过前后对账。

## 11 月 26 日研究实验固定集

- 从主仓运行 `node scripts/seal-research-stage-benchmark-named-v1.mjs`，将 20 个案例与原评价封存在 `.recovery-artifacts/research-stage-benchmark-named-v1-gE88gr/`。本次使用默认输入与输出，退出 0。回读校验通过 `seal.json` 的文件 SHA-256、案例与评价覆盖、冻结输入与工具调用绑定，并使用正式实验资格检查验证基准摘要。
- 历史固定集继续按 `28756fd2813be775ed4edafa2b226eeef12eee443aab747901e762a0eaf56c22` 核验。新基准文件 SHA-256 为 `1e88183e8eac61e12031a704d96e342e7b674b91d5a38032b38bec71d2a7b04a`，实验基准和评价摘要与上轮离线核对相同。十组受控实验测试通过 72 项。本次封存和复核均为离线验证，实际运行需按新基准绑定模型、调用次数及费用授权。

## 11 月 26 日 OpenAI 五样本实验

- 用户确认复用宿主进程的 `OPENAI_API_KEY`。本次在主仓目录以 Node 24.22.2 执行私有入口 `rtk node .recovery-artifacts/research-openai-named-v1-j1k6BM/run.mjs offline`，退出 0。绑定上述基准和评分摘要，按单次报价、跨币种金额、披露截止、分红预案、资料指令注入的顺序核对五个出站请求。最大请求为 14,935 字节，固定使用 OpenAI 官方 Chat Completions、`gpt-6-luna`、Standard、流式 `json_object` 和 `max_completion_tokens=8000`。离线阶段实际请求 0 次。
- 同一入口以 `run` 模式执行，退出 2。上海时间 09:48:07 首条样本进入发送边界，10.534 秒后返回 `provider_connect_timeout`，未收到 HTTP 响应。请求标识为 `22e99cce-d907-4b72-b8dd-5bf631a36383`。首例占用 1 次，重试 0 次，余下 4 个样本未发送。真实模型验收未完成。
- 本轮费用硬上限 0.05 美元，首条由于没有供应方用量回执，保留 0.01 美元预留，实际费用未知。计划、请求摘要、错误诊断及结算状态见[实验汇总](../../../.recovery-artifacts/research-openai-named-v1-j1k6BM/summary.json)与[首条样本回执](../../../.recovery-artifacts/research-openai-named-v1-j1k6BM/01-single-price.result.json)。
- 首次运行沿用 Node 默认连接，环境代理未启用。后续 DNS 解析成功，直连 7.015 秒内未建立 TCP 连接。经当前已配置代理进行 CONNECT，164 毫秒内建立并通过证书校验的 TLS 1.3 连接。这次连接诊断使用 0 次模型调用。后续运行可用 Node 的 `--use-env-proxy` 从进程启动时启用环境代理。模型访问权限、实际生成和计费仍待真实回执确认。[连接诊断](../../../.recovery-artifacts/research-openai-named-v1-j1k6BM/transport.json)

## 11 月 26 日 OpenAI 代理补跑与五样本验收

用户授权经已验证的代理补跑首例一次，并在首例通过后串行完成其余四例。累计上限为 6 次，含此前超时的请求。总费用上限为 0.05 美元，计入此前的 0.01 美元预留。

从主仓执行 `rtk node .recovery-artifacts/research-openai-proxy-rerun-LVzZQN/run.mjs offline`，退出 0。五个请求的出站摘要逐条与原核对记录相同。用当前 `HTTPS_PROXY` 再次对 OpenAI 官方地址完成 TLS 证书校验，耗时 96 毫秒。离线与代理检查共使用 0 次模型调用。实际运行通过 Undici 显式使用该代理。 [代理核对](../../../.recovery-artifacts/research-openai-proxy-rerun-LVzZQN/proxy-check.json)

上海时间 10:21:36 至 10:22:24，在同一目录以 `rtk node .recovery-artifacts/research-openai-proxy-rerun-LVzZQN/run.mjs run` 执行，退出 0。首例通过后才发送其余四例。五条请求均获得 HTTP 200，回执模型为 `gpt-6-luna`，服务档为 Standard，流式响应以 `stop` 结束。独立回读按现行研究合同复核结构、冻结证据与数值，并重算封存评分。

| 封存样本 | 评分 | 耗时（秒） | 输入 token | 输出 token | 费用估算（美元） |
| --- | --- | --- | --- | --- | --- |
| 单次报价 | 4/4 | 8.948 | 4,031 | 1,215 | 0.001111300 |
| 跨币种金额 | 4/4 | 7.918 | 4,036 | 1,270 | 0.000724735 |
| 披露截止 | 4/4 | 10.358 | 4,035 | 1,519 | 0.000849110 |
| 分红预案 | 4/4 | 10.163 | 4,044 | 1,617 | 0.000899235 |
| 资料指令注入 | 4/4 | 10.991 | 4,053 | 1,623 | 0.000903360 |

五个样本全部通过。本次使用 20,199 输入 token 和 7,244 输出 token，按回执用量和 OpenAI Standard 费率估算为 0.004487740 美元。累计 6 次尝试，占用预算 0.014487740 美元，其中包含此前无用量回执的 0.01 美元预留。此前直连超时的实际扣费未知。逐条请求标识、响应、模型身份和评分保存在实验目录。 [汇总回执](../../../.recovery-artifacts/research-openai-proxy-rerun-LVzZQN/summary.json)

## 11 月 26 日版本切换复核

### 业务入口与存量

| 规格 | 当前核对结果 |
| --- | --- |
| AC1 市场与部署联通 | Server 与 DSA 健康入口返回 200。DSA OpenAPI 共 66 条路径，其中 64 条位于 `/api/v1`，旧组路由未登记。旧数据能力和控制握手请求均返回 404。现行市场政策修订为 203，香港和美国历史状态试读命中各自的本地材料。 |
| AC2 账本与组合 | 只读库存核对 138 条账本和 72 条组合负载使用具名 V1。账本导出及追加写保护复用具名切换的隔离验收。 |
| AC3 策略和回测 | 119 条策略和 153 条版本使用现行储存版本，156 条回测作业中的 125 条成功任务已有部署 Worker 的清单和 1,308 份制品核对。目标库没有净值回测作业，净值准备、队列与读取沿用 Task 的非空隔离验收。 |
| AC4 研究、复盘与 Arena | 32 条冻结研究及其已有结果按具名合同读取。目标有 5 条对象复盘和 1 条周期复盘，Arena 有 10 场实时和 5 场历史比赛。OpenAI 五例回执见上一节。 |
| AC5 无损转换 | 账本、回测、研究和 Arena 按实际已转换记录复核。已批准清理的 1 条旧研究和 11 条独占工具记录未出现在目标库。市场已生效策略未保留退役的聚合状态能力。 |
| AC6 切换与恢复 | PostgreSQL head 为 `20261124162500_named_v1_contract_boundary`，本地迁移清单通过 55 笔迁移和 107 张表核对。实际服务挂载与启用清单的 5 项挂载一致。987 条 Arena 轮次与启用清单对账，Redis 队列没有活跃任务，保留原 1 条待办且处于暂停。 |

### 补齐的合同验收

- DSA 正向 HTTP 测试统一使用现行路径，保留旧路径、旧版本和错合同的拒绝检查。港美状态使用现行独立能力，公告风险和涨跌停规则分别验证授权、政策修订、来源证据及结果。原全量离线首轮为 8,215 项通过、249 项失败。 [DSA 首轮离线回归](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/dsa-offline.log)
- 在 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis` 使用项目 `.venv` 运行 `bash scripts/ci_gate.sh offline-tests`，设置 `PYTHONDONTWRITEBYTECODE=1`，退出 0。8,464 项及 323 个子测试通过，跳过 42 项、未选中 4 项。 [DSA 最终离线回归](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/dsa-offline-final.log)
- 主仓适配具名研究提交、标的行情、基金净值、策略储存版本、报告回读和范围权限的测试材料。新冻结报价与净值证据引用 `dsa-data-v1`，原冻结引用由完整性与权限规则读取。原 CI 隔离入口首轮 66 项通过、40 项失败。 [研究隔离首轮回归](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/ai-isolated-postgres.log)
- 在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger` 执行 CI 使用的默认入口 `node scripts/test-ai-provider-postgres.mjs`，退出 0。在隔离 PostgreSQL 应用 55 笔迁移，验证旧记录升级与服务进程恢复，全部 14 个文件、106 项通过。 [研究隔离最终回执](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/ai-isolated-final.log)
- 从主仓执行 `node scripts/test-ai-provider-postgres.mjs test/research/dsa-g1-http-postgres.integration.test.ts`，退出 0。实际 DSA 进程与 Server HTTP 控制器联通，使用受控来源和 SDK HTTP 响应，在隔离 PostgreSQL 上通过全部 6 项，包括并发提交、结算、取消、原报告回读和数值拒绝。 [跨仓端到端回执](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/research-dsa-g1-final.log)

### 目标快更与独立读回

- 13:48（上海时间），在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all`，沿用默认部署配置，Corepack、pnpm 和 npm 均使用工作区指定镜像源，退出 0。DSA、Server 和 Worker 完成代码快更。五个容器的标识、镜像和卷挂载前后一致，数据库和 Redis 进程持续运行。 [快更日志](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/target-sync.log) · [挂载对账](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/target-mount-verification.json)
- 五个服务均健康。目标 DSA Data、Control 握手及 Server 研究能力返回各自具名合同。错合同握手和旧指标请求返回 422，退役数据和控制路径返回 404。目标 Server 构建使用受控报价、净值输入核验两个引用均标记 `dsa-data-v1`。 [目标 HTTP 及引用读回](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/target-http-after.json)
- DSA 643 份部署文件与宿主摘要一致。Server 与 Worker 的 Server、domain、schemas、shared 四组构建在每个容器共 7,230 份文件，也逐文件一致。更新后的只读回测 DSA 验证入口核对 93 个相对原始基线的文件差异，并读回具名日级观察合同。 [DSA 文件摘要核对](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/dsa-manifest-after.json) · [Server 与 Worker 文件摘要核对](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/server-manifest-after.json) · [只读回测复验](../../../var/acceptance/backtest-practical-20261120/named-v1-final-dsa-20261126-0CHCJX.json)
- 在主仓用原启用清单执行 `node scripts/database/verify-named-v1-state-switch.mjs .recovery-artifacts/named-v1-converted-003247/activation.json`，退出 0。再次核对 PostgreSQL head、市场策略修订 203、港美本地材料和 Arena 987 条轮次。暂停待办的数据库身份、尝试序号和 Redis 作业一致。 [正式读回](../../../.recovery-artifacts/named-v1-final-audit-0CHCJX/target-state-after.log)

### 远端 CI

三仓使用同名验收分支 `codex/named-v1-cutover-20261126`。主仓策略执行前置 `437aba8f`、DSA 行情窗口前置 `0dedd440` 各自提交，随后提交具名 V1 切换和对应的 CI 修复。

| 仓库 | 被测提交 | 结果 |
| --- | --- | --- |
| ThesisLedger | `3bb0b2a822705a6d52cd80d0692cfbe428aaa3c9` | 质量、合同门禁、Android Debug 和 iOS 模拟器构建全部通过。 [主仓 CI](https://github.com/yzin-17/thesis-ledger/actions/runs/45795276830) |
| DSA | `726048f9aa2cfb81177994c7d0c2f8156ce8a1d4` | 三个离线测试作业、后端门禁、AI 治理和镜像构建通过。 [DSA CI](https://github.com/yzin-17/daily_stock_analysis/actions/runs/45776349407) |
| infra | `b83476eed23882cdace273d34b55af988ff2b5f9` | 使用表中主仓和 DSA 提交通过兼容检查。应用侧 97 项通过、1 项按配置跳过，DSA 侧 30 项通过。 [infra CI](https://github.com/yzin-17/thesis-ledger-infra/actions/runs/45795277129) |

- 主仓 `quality` 在仓库根目录运行 `pnpm -r --workspace-concurrency=1 test`，通过 9,811 项，按配置跳过 523 项。lint、类型检查和 `pnpm build` 均通过。`node --test scripts/local-runtime/*.test.mjs scripts/deployment/*.test.mjs` 通过 110 项，`bash scripts/local-runtime/ai-deployment-contract.test.sh` 与 `bash scripts/local-runtime/database-role-contract.test.sh --check-only` 均退出 0。运行记录确认工具检查使用了表中的 DSA 和 infra 提交。手动触发参数 `package_desktop=false`，可选桌面安装包作业跳过。 [质量作业](https://github.com/yzin-17/thesis-ledger/actions/runs/45795276830/job/139824231326)
- 主仓合同门禁完成 PostgreSQL 服务端到端 11 项、AI 配置隔离 106 项、基金定投 15 项、组合估值 16 项、收益与风险 12 项、复盘投影 8 项、策略编写来源 14 项，并通过行情读取、共享合同、离线研究轨迹及移动边界检查。 [合同作业](https://github.com/yzin-17/thesis-ledger/actions/runs/45795276830/job/139824230895)
- DSA 三个测试作业检出了主仓 `e279d9c152f372d0802289a2aea5ddd2fd3fe060` 以构建共享 Schema。用于构建的 `packages/schemas`、`packages/domain`、锁文件和工作区构建配置在该提交与最终主仓候选之间一致。 [共享合同构建日志](https://github.com/yzin-17/daily_stock_analysis/actions/runs/45776349407/job/139760882607)

首轮主仓发现移动端依赖和 PostgreSQL 测试的构建顺序问题。后续对齐回测、研究权限和策略编写来源的现行版本，并按远端日志调整测试并发和用例期限。最后的复验分别覆盖本地 HTTP 连接隔离，以及在无 `rg` 环境下执行数据库角色合同检查。 [主仓首轮](https://github.com/yzin-17/thesis-ledger/actions/runs/45769404178) · [本地 HTTP 失败回执](https://github.com/yzin-17/thesis-ledger/actions/runs/45786735057) · [权限检查失败回执](https://github.com/yzin-17/thesis-ledger/actions/runs/45790907769)

DSA 补齐分片的共享合同构建和 SDK 依赖，保留历史摘要并按数值容差核对跨平台舍入。infra 首轮兼容检查中的失败来自 DSA 恢复提示的文本断言，随后纳入两个现行健康提示。 [DSA 首轮](https://github.com/yzin-17/daily_stock_analysis/actions/runs/45769381702) · [infra 首轮](https://github.com/yzin-17/thesis-ledger-infra/actions/runs/45769404327)

远端验收使用离线数据、受控 HTTP 夹具和隔离 PostgreSQL。OpenAI 真实模型调用与目标开发栈的验收沿用前文各自的运行记录。
