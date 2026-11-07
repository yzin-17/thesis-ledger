# 风险监控常驻来源与旧任务续查

对应 [Spec](../specs/2026-11-06-risk-monitoring-schedule.md) 与 [Task](../tasks/2026-11-06-risk-monitoring-schedule.md)。本轮是在“已有更新消费仍未满足盘中常驻监控”后的续查，不是验收完成记录。

## 只读运行态

检查时间：2026-11-06 17:51:34 UTC。使用现有 `thesis-ledger-dev-thesis-ledger-1` 中 Prisma 的 SELECT/count，以及已配置的 DSA Control GET。未运行 Provider 测试、报价、历史请求、OpenD 订阅、行情采集器或任何通知投递。

- Desired 与 Effective policy 均为修订 **189**，全局启用、已应用；目录 integrity 为 complete，catalogRevision 为 `1106839547598160`。
- 风险规则共 **7** 条；当前已启用、未归档、无需修复且已生效的规则 **0** 条。此前只读明细中，未归档且 enabled 的集合也为空。不能把这个结果写成“没有配置规则”，不能替用户启用。
- `risk-evaluation` 自动化任务 **0**，`systemKey=risk-monitoring-close` **0**。本目标不存在需要暂停、重排或删除的旧 16:05 任务。
- HiThink 已配置、启用，credentialConfigured=true，configVersion=9；富途已配置、启用，credentialConfigured=true，configVersion=1；腾讯无需凭据、已配置且启用；长桥停用、未配置凭据。只输出这些脱敏事实，没有读取或保存凭据内容。
- 相关 Provider 的 settings/configSchema 均无已配置的常驻调用预算字段。这里不能推出上游实际收费为零或当前账户具备订阅权限。

一次初始 Control GET 因误用不存在的环境变量返回401；检查实际源码后，改用已有 `THESIS_LEDGER_CONTROL_TOKEN`，同一只读操作成功。没有更换、生成或扩大任何 token。

## 已选来源与真实能力

| 范围 | 当前有效选择 | 已确认的边界 | 能否直接闭环 |
| --- | --- | --- | --- |
| 中国股票报价 | HiThink `a-share-prices-snapshot`，eligible=true | 已接入单次快照，仍有来源准入与凭据围栏；当前没有常驻预算承诺。15秒缓存是 Server 缓存，不是上游推送频率或无限读取许可 | 不能在本轮约束下直接开始持续调用受限快照 |
| 中国 ETF 报价 | HiThink `fund-market-snapshot` 当次 eligible=false/upstream_failure；腾讯 `tencent` 为已配置的 eligible 备选 | 腾讯无需新凭据，但现行 DSA 对**每来源、每标的**请求在调用前占用600秒窗口，失败/进程重启也不会立即释放；Server 现有 ETF 缓存、手动刷新与退避也遵守600秒 | 已实现不快于600秒的后台采样及固定来源执行，隔离闭环通过；未运行真实上游，不保证捕捉采样间短暂越界，不能宣称实时推送 |
| 港美股票/ETF 报价 | 当前 policy **未选任何报价路由** | 富途报价目录 ready、连接已配置；长桥未配置。ready目录不代表已选路由、订阅额度或该账户的实时权利 | 不能借监控自动改变来源选择；不能直接从 SDK 存在推导可用订阅 |
| 港美分钟线 | 当前 policy **未选任何 MINUTE_BAR 路由** | 富途四类1m目录 ready；现有 `MinuteRequest.from_request` 只允许 `parameters={interactive_chart:true}`，调用 `request_history_kline`，不是流式订阅；历史查询消耗历史额度，不可偷偷作为常驻补洞 | 尚缺风险执行合同与常驻更新接缝，不能把交互图表或历史分页当成已完成 K 线事件流 |
| 场外基金 | 已配置正式净值来源 | 正式 NAV 按公布日期评估，不存在可据以承诺的盘中报价流 | 继续使用正式净值，不用估算或请求时间替代 NAV 日期 |

运行态 GET 的目录输出中，富途/腾讯/HiThink的相关行均可为 ready；这与 Effective 中选中目标的 eligible、以及具体调用的权利/预算是不同事实。没有把目录读取当作来源成功验收。

源码证据：[DSA ETF 预算执行](../../../daily-stock-analysis/src/services/thesis_ledger_provider_runtime.py)、[持久预算占用](../../../daily-stock-analysis/src/services/thesis_ledger_control.py)、[Server ETF 窗口](../../apps/server/src/market/market-quote-cache-policy.ts)、[富途来源绑定](../../../daily-stock-analysis/data_provider/thesis_ledger_sources/futu.py)、[分钟合同](../../../daily-stock-analysis/src/services/thesis_ledger_minute_contract_v1.py)、[富途分钟读取](../../../daily-stock-analysis/data_provider/futu_history.py)。

## 订阅能力的区分

富途 SDK 在产品外具备报价/K线订阅能力，已有接入文档也把 `StockQuoteHandlerBase`、`CurKlineHandlerBase` 和 subscribe 列为未接入。当前 DSA 的精确 Quote 绑定是 query；源码中没有这些推送处理器或现成的常驻流执行器。注册器虽然识别 operation=`subscribe`，找不到对应 binding 时仍明确拒绝，不能据此声明订阅可用。

[富途官方订阅说明](https://openapi.futunn.com/futu-api-doc/quote/sub.html)说明港股订阅需相应 LV1 或以上权利，BMP 不支持；初次/重连订阅还可能推送缓存样本。官方示例同时展示订阅额度占用及连接关闭的释放语义。因此当前 OpenD host/port 已配置，不足以证明持续订阅无需额外权限或额度。没有调用 subscribe、query_subscription 或账户权限探测来扩大本轮操作。

## 来源设计与已实现范围

产品目标维持“规则启用后自动监控，关页不停止”，不再以16:05排程作前置。按实际来源逐项实现，不要求用户先指定统一延迟。腾讯ETF已落实第一条路径的代码和离线/隔离验收，第二条仍是未实现能力：

1. **现有报价的常驻获取**：Market 拥有采集，不让 Risk 直接调用 Provider。按规则推导完整 symbol/assetType 的需求集合，账户/组合规则覆盖其全部持仓；遵守用户当前 Desired/Effective 顺序、精确身份、全局开关与准入。只允许已核实合同边界的选中公开目标，Redis lease/window跨进程限流并在上游前占用；规则停用或移除后释放本应用需求。取得新源时间/正式净值后，复用现有日志触发评估及数据库去重。ETF现有600秒上限必须直接展示，无法回溯窗口内未知越界。
2. **已配置 OpenD 的持续订阅**：先确认用户要选用的精确市场/资产路由、现有账户权利、可用订阅额度及正常时段语义，再由 DSA 增加 subscribe 执行绑定、持久的本应用所有权与连接恢复，Market 消费流并沿用当前 Risk 状态机。只释放本应用订阅，禁止 `unsubscribe_all` 影响其他程序。K线需要明确发生/可得时间及完成条件，不能把未结束尾柱、重连缓存或交互查询冒充新收盘事件。真实上游与故障验收另设阶段，不启用真实通知。

已新增**执行前锁定来源及 generation** 的 Data POST 接缝；原 quote GET 保持兼容。即使现在 ETF 首选 HiThink 不可用、实际会落到腾讯，也不能通过一次元数据预检便假定未来请求始终只消耗腾讯；目标资格可能在请求前变化。不得临时重写用户策略、绕过主来源或调用探测接口来实现“免费强制走备选”。

实现已经包含规则需求自动登记和腾讯ETF后台采样执行器，无需额外监控开关；尚未部署、未解冻或实际请求任何来源。600秒来自当前来源限制，不是向用户要求统一延迟。HiThink仍需现有受限来源的常驻预算证据；富途仍缺已选路由、已核实订阅权利和执行流；正式净值后台获取、汇率刷新及已完成K线仍待按各自合同接入。这些具体缺口不能用腾讯采样闭环的通过掩盖。

## 16:05任务迁移影响

本目标任务数为0，**当前无需执行任何迁移**。此前“旧任务仍可能按原计划执行”是兼容性说明，不能误写成目标确有旧任务。

其他环境存在旧任务时，先给出只读预览：任务ID、systemKey、enabled、cron/timezone、nextRunAt、retryPolicy/lockTtl与活动执行数，保留配置及历史。仅识别 `risk-monitoring-close` 且仍匹配原默认设置的候选；用户改过的默认任务也按自定义处理，不自动暂停。

只有常驻来源覆盖、事件/通知一致性及目标验收通过，并且用户已明确该运行态变更后，才对精确候选做事务内CAS暂停（只变 enabled，保留 cron/timezone/历史；若需改变 nextRunAt，应在预览中说明）。不删除任务或运行记录，不批量停用所有 `risk-evaluation`，不启用外部通知。已经开始的旧扫描先单独核对能否安全结束；数据库越界去重负责兼容重叠，不把禁用任务等同于取消了在途执行。

如果新链路未覆盖来源或无法满足时延，不用暂停旧任务掩盖缺口，也不擅自重启用户此前停用的任务。回退操作沿用明确授权和原配置。当前没有执行任何这些动作。

## 本轮验证与变更

- 只读运行态核查如上，修订189与任务0重复核对一致；未改变真实7条规则的状态。
- 更正 Server 的分钟错误说明：由“没有精确来源”改为“现行合同仅交互图表，风险尚未接入完成分钟更新”，保持拒绝行为，未借此读取历史或旧缓存。
- `vitest run test/risk/strategy-runtime.test.ts`：14项通过。这里未改执行链，不重复生产镜像构建、Docker更新或8项旧隔离验收，也不把这14项当作持续来源验收。


## 本次源码与验证增量（2026-11-06 18:23 UTC）

- DSA 新增 `POST /api/v3/thesis-ledger/market/background-quote/plan`，只读控制事实，不触发 Provider；响应按资产/当前顺序报告目标、generation、policyRevision、获取方式、最短请求间隔、未知的源更新频率或稳定原因码。`POST /market/background-quote` 携带 generation，标准 Runtime 在预算/上游前及返回前重核；只允许当前首个 eligible 的腾讯中国ETF，保留原 routeIndex 和 fallbackUsed，不尝试 HiThink。原 GET 兼容。协议所有权见 [DSA Spec](../../../daily-stock-analysis/docs/specs/2026-11-06-background-quote-source.md)。
- Risk 从数据库当前生效规则推导独立的行情需求；组合/账户覆盖其持仓，精确标的分类批量取本地目录，未知不猜。每5秒仅核对本地需求；Market对成功取得的只读计划缓存60秒；计划请求失败时由本地需求协调重试。上游报价按来源至少600秒，且只使用中国市场工作日交易时段的时钟窗口；未核实交易所节假日，不承诺节假日零调用。关页不影响后台执行；无规则无数据请求，停用/归档/未来规则由事实源自然收敛。每1秒的本地观察协调负责规则保存后的已有数据首评；这两个本地协调周期不是统一的行情扫描频率。
- Market复用标准报价缓存、锁与ETF请求窗口，再通过原观察日志触发Risk；额外的后台尝试窗口在请求前占用，跨Server进程/重启共享。即使Redis窗口丢失，DSA原SQLite来源预算仍阻止额外请求。源数据失败不清除风险越界状态。当前选择的备选来源是来源身份，不能等同于陈旧回退；合格备选报价允许评估并保留实际来源和fallbackUsed。
- Desktop/Mobile沿用TanStack Query读取状态，显示标的当前本地名称、来源、最短请求间隔、上游更新频率未知、来源时间、获取时间、最早下一次窗口和具体等待原因；名称按完整代码批量本地投影，不查远程或改写冻结通知。来源协调心跳与风险处理心跳分开，不把旧状态当作在运行。

| 验证 | 最终结果与输入范围 |
| --- | --- |
| `node scripts/test-risk-source-dsa.mjs` | 40项通过，含真实标准Runtime+临时SQLite，成功/失败/重启预算、当前备选routeIndex=1、受限主来源零调用、身份/代次/来源改变拒绝与HTTP鉴权；随后DSA数据源码语法、统一能力边界、runtime打包输入和测试登记全部通过 |
| `node scripts/test-risk-monitoring-runtime.mjs` | 9项通过；48个migration、head `20261106030000_strategy_submission`，真实隔离PostgreSQL/Redis；新增规则→Market完整报价读取→日志→持久风险事件用例，不开页面；真实与模拟各一事件，仅真实入队一次，重启和重复协调不再发事件。DSA传输为受控响应，通知为mock |
| Server定向组合 | 103通过、12跳过（隔离测试另由专用脚本运行）；新增状态名称/时效测试1通过；最后身份/状态/需求组合11通过（与前述集合有重叠），符号或资产与计划不一致时在控制/预算/数据请求前拒绝；此前通知专项验证保持，未声称此次重跑全仓 |
| 消费合同 | Schemas新计划2通过；Desktop来源展示2通过，Mobile通过真实API-client解析1通过；Schemas/Domain/API-client构建通过 |
| 类型与构建 | 全Server `tsc --noEmit` 通过；生产源码单独编译通过；Desktop/Mobile typecheck通过；Desktop生产构建通过（既有大chunk警告保留）；完整Nest构建通过 |
| 门禁 | 新执行/展示代码ESLint complexity≤20通过；Server边界通过；`GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` 通过，6项存量警告未增长 |
| 浏览器 | 真实组件、真实样式、GET-only受控fixture于1440/1024/768/390逐项截图/DOM检查，横向溢出均false，来源和时间行完整、无16:05入口；viewport已恢复，临时页关闭，Vite5187已停止。不是目标部署页面或原生Mobile运行验收 |

DSA生产镜像本身没有pytest；脚本通过只读挂载已有本地venv中的纯Python测试工具，生产依赖仍由既有镜像提供。首次缺pytest失败未安装依赖；首次策略全对象断言受动态appliedAt影响，改为比较路由与修订；首次新闭环误期望仅一个事件，已更正为实际/模拟两事件且仅一条通知入队。编译发现新增可选字段的exactOptionalPropertyTypes不匹配，已修复后重跑通过。所有失败与日志保留于本机 `/tmp/risk-source-*.log`，没有将失败写成通过。

两个专用脚本只创建UUID隔离资源、复用本地镜像、不注入真实凭据或发送通知，不操作目标服务/volumes；DSA容器禁用网络，风险隔离环境仅使用受控DSA响应与通知mock；运行后均已清理。未执行目标sync/update，未构建生产镜像，真实上游时效、连接恢复和节假日仍无验收证据。当前目标有效规则0、旧任务0的只读事实不因代码完成而变化。
