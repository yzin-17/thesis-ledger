# 历史数据按需获取历史实施与验证记录

> 2026-10-14 按第二轮文档治理抽取。这里只保留有日期的阶段事实、已完成执行包、旧失败与修正，不是一套当前任务。当前责任、授权与未通过验收只由[原 Task](../../tasks/2026-10-09-history-data-on-demand.md)维护。
> 原记录中的“当前/下一步”仅在其原时点有效，不恢复取消范围或旧授权。

## 10. A0 接缝与执行检查点（2026-10-09）

- 基线：主仓 980、DSA 207、infra 75 项 dirty；已有同主题未跟踪代码属于保留的实现，不覆盖。后续修改按实际内容增量进行，不提交或推送。
- 现行路径：DSA `thesis_ledger_tradability_provider.py` 的 BaoStock normalizer 仅保留整窗 `tradable/suspendedDates` 和基础日期；`real_cn_tradability` 当前读取精确价格路由。独立 `HISTORICAL_TRADING_STATUS` 由 `thesis_ledger_local_rules.py`、`thesis_ledger_current_data_route.py`、Provider manifest 和认证 API 执行，当前只有公告/历史有界包，没有 BaoStock 状态候选。
- 消费路径：`collectSnapshotTradingStatusV3` 只遍历有效策略已配置且 eligible 的状态目标；快照单独保存状态响应与价格。`prepareTradingStatusExecutionV3` 标注当天 suspended 并过滤基准执行视图，不整窗拒绝；无 Bar 普通研究仍由既有 `assume-untradable-no-bar` 协议处理。旧公告规则/P6 行为保留。
- 契约缺口：当前 `market-trading-status-v3.ts` 强制已知日期引用公告。结构化读取应追加独立查询响应引用、实际观察时钟/摘要与粗粒度 ST 字段；不得虚构 PDF、公告发布日期、细分风险类别或价格限制。此共享契约由主代理串行处理，先于 S2 对外响应验证。
- S1 精确写集：DSA 新 `src/services/thesis_ledger_baostock_daily_status.py` 与 `tests/test_thesis_ledger_baostock_daily_status.py`；复用 `BaostockFetcher._baostock_session/_convert_stock_code` 和既有 `_result_frame`，不改旧聚合合同。DSA 内部契约与执行计划维护在本仓对应 `docs/specs/2026-10-09-history-data-on-demand.md` / `docs/tasks/2026-10-09-history-data-on-demand.md`。
- S1 输入/输出：实际 SH/SZ 股票、明确起止日、交易日历及来源日行 → 每日显式标记/未知、状态与 ST 分别覆盖、规范化响应摘要和观察时钟；不从 OHLC、成交量或缺行推断停牌。定向验证：DSA `.venv/bin/python -m pytest -q tests/test_thesis_ledger_baostock_daily_status.py tests/test_thesis_ledger_tradability_provider.py` 与变更文件 `py_compile`；不代表生产通过。
- S2 精确接缝：候选 manifest、`thesis_ledger_current_data_route.py`、`thesis_ledger_local_rules.py` 的读取分派与专属 API 测试；复用已有选源/复核、缓存存储，缓存键必须绑定证券/窗口/能力/来源/修订。若通用执行器需要扩大修改，先拆独立叶，不增加过阈值文件职责。
- S3/S4 接缝：共享状态 Schema/测试；DSA client 现有响应解析、`backtest-trading-status-snapshot-v3.ts` 与 `backtest-trading-status-execution-v3.ts`；状态粗标记只冻结披露，不用于精确价格模型。需独立拆分契约、冻结、执行验证；其余 Server/Worker/UI 无授权顺带重构。
- 真实样本：首个新股票 `300757.SZ`、`2023-08-21..2023-09-05`（跨月，预研支持起点停牌）；切换样本 `600221.SH`、`2021-02-10..2021-03-02` 检查 ST。样本仅为待验收请求，不是当前生产事实。
- 旧快照：P5 的 `000995.SZ` 以及四证券公告和 F01 已有成功运行从原证据索引定位，再查目标卷实际存在的任务；缺失旧资产不追补、不作为新实现前置。
- 环境：首次 `docker ps` 无法连接 daemon；通过 infra `scripts/docker-desktop.sh start` 在系统日志权限恢复后退出 0。五个目标容器均 Exited，DSA 容器配置仅确认 HiThink 环境凭证存在（不输出值），实时有效路由仍未读到。S5 应按当前停止状态走 `./scripts/update.sh all` 及预检；尚未构建或部署。
- A0 停止边界已遵守：未保存路由/凭证、签发准入、写目标数据或重跑全量调查。S1 开始实施；S2 依赖当前契约尚未就绪。

### S1 完成记录与 S2 接缝拆分

- S1：主代理完成新 helper 与专属测试；DSA `.venv/bin/python -m pytest -q tests/test_thesis_ledger_baostock_daily_status.py tests/test_thesis_ledger_tradability_provider.py` 29 项通过，两个变更文件 `py_compile` 通过。输入为当前 dirty 工作树及固定响应，不证明在线来源或产品完成；原整窗 normalizer 及依赖保持。真实查询和回测归 S5。
- [x] S2-C：S2 前置共享契约。依赖 S1，仅拥有 `packages/schemas/src/market-trading-status-v3.ts`、新 `market-structured-status-v3.ts`、`backtest-trading-status-v3.ts` 与专属 schema 测试。追加独立 `sourceRecords/sourceRecordIds`、粗 ST 和逐维覆盖；不得让结构化记录提供公告专属精确规则。新冻结版本与旧公告版本兼容；定向 schema 测试、包 typecheck/build 通过后交付。对外服务接入仍由 S2 拥有，Server 冻结选择与观察时钟检查归 S3。
- S2 精确写集补充：新 DSA `thesis_ledger_baostock_status_source.py` 与 `thesis_ledger_status_cache.py`、候选 manifest/当前路由/本地规则分派的最小改动及新专属路由测试。缓存复用既有 DSA 数据路径，只缓存该实际查询的规范化结果，不存公告、不建设新证据平台；只有可复用有效结果写入，失败不得覆盖旧值；所有读取仍经过当前 Control 目标与返回前复核。共享文件串行。

- S2-C 验证：结构化/旧公告/旧冻结四文件 26 项测试通过；`pnpm --filter @thesis-ledger/schemas typecheck` 与 `build` 通过。新增 `frozen-trading-status-v4`，旧版本不可纳入新结构化字段；粗 ST 不生成公告专属规则。首次 typecheck 暴露精确可选属性类型问题，已修复并重验；不作为运行态证据。
- S2 拆为 [x] S2-A（独立查询缓存）与 [x] S2-B（候选目录/路由/读取）：S2-A 仅新 `thesis_ledger_status_cache.py` 与专属测试，复用现有 DSA 数据根目录，按证券/窗口/能力/来源/SDK和normalizer修订内容寻址，原子发布且无有效事实不覆盖。S2-B 依赖 S2-A/S2-C，仅新状态来源 wrapper、manifest/当前数据路由/本地规则分派与专属测试；不修改通用执行器或用户策略。

- S2-A：10 项缓存定向测试通过，原子发布失败仍保留旧值；源码缓存无全市场预取或业务任务。
- S2-B：认证网关/目录/用户显式应用策略的隔离测试及旧公告/生命周期/缓存合计 38 项通过。旧测试按来源身份定位候选，避免新增目录条目改变其选择；原公告包断言保持。SDK 全局连接通过 45 秒独立读取进程隔离，不修改全局 socket 或隐式选源。仅测试临时 SQLite 保存测试策略，真实目标用户配置未写。
- S3 收敛：股票状态在现行新快照 collector 获取，价格准备逻辑与全局覆盖检查保持。追加明确的固定来源状态研究声明，分别保留价格截点和状态冻结/观察时钟；普通固定来源研究可消费当前取得的基础状态，不当作历史可见信号，严格 PIT 不调用。写集 `backtest-trading-status-v3.ts` 的声明合同、新 `apps/server/src/backtest/backtest-structured-status-v3.ts` 与专属测试、现有快照 collector 的最小接缝；共享契约串行。S4 执行仅验证既有逐日限制，不重建执行引擎。

- S3 本地证据：共享冻结合同 build 通过；Server 新结构化快照/旧冻结/旧执行与 Schema 合计 30 项定向测试通过。真实 Runner 使用固定输入、新 Parquet 产物、两次离线重放和原快照对照；这不等于在线 BaoStock 或目标生产回测。待包级检查后记叶完成。
- [x] S4-C：结果披露与诊断导出。依赖 S3；只拥有现有 `BacktestTradingStatusDisclosure.tsx`、`backtest-trading-status-disclosure.model.ts`、新 `BacktestStructuredStatusFacts.tsx` 和专属 UI 测试。复用既有 Alert，追加结构化来源/粗 ST/覆盖/时钟，旧公告内容保持；定向渲染与导出测试、Desktop typecheck/build，目标浏览器归 S5。使用项目锁定 shadcn CLI；首次 node PATH 缺失已用现有 Volta Node 绝对目录修复本次进程环境，未改用户配置。

### 本地链路完成与 S5 启动

- S2-A/S2-B 已完成；没有真实目标策略或准入写入。S2 全部所属 Python 文件 `py_compile`、关键 flake8（E9/F63/F7/F82）通过。
- S3：Server typecheck/build 通过，结构化与旧状态 30 项测试通过；固定来源状态观察时钟单独冻结，旧严格入口仍跳过。未增加新准备任务或更改价格准备协议。
- S4：复用现有逐日可交易性执行视图，新增结构化警告只作用于新响应；相关 11 项 Runner 测试通过。新快照起点停牌不成交、复牌后成交、离线重放与旧快照保持属于本地真实领域逻辑证据，在线事实仍由 S5 验收。
- S4-C：Desktop 的新/旧披露 11 项定向测试通过；Desktop typecheck/build 通过。初次从主仓运行 UI 测试未加载 Desktop alias，已改正确前端目录及现有 Node PATH，未修改工具配置；新记录明确显示结构化来源、粗 ST、逐维覆盖、实际观察和价格截点，导出同一语义。目标浏览器未验证。
- 必要门禁：受影响源码 ESLint、`node scripts/check-boundaries.mjs` 通过；新增文件职责局部，未提高复杂度/尺寸阈值。仅对精确写集格式化，未运行无关全仓测试。
- S5 正式入口：infra 目录 `./scripts/update.sh all`（仅因五个服务容器停止且两仓代码变化）；保留数据默认模式，关闭自动空间整备 `REPAIR_BUILD_CACHE_ON_NO_SPACE=false`，避免缺空间时自动删除旧缓存/回滚资产。需等待正式预检结果；未保存股票状态主备、价格主备或凭证，未签发准入。

### S5 执行拆分与来源核对

- S5-A 精确写集：新增 `scripts/history-data-on-demand-target.mjs`，仅将既有 `historical-trading-status-target.mjs` 的标准准备/创建/读取路径参数化，证券和日期由命令参数输入。实际读取当前路由后才创建研究任务；不保存配置、不使用临时策略绕过当前路由。复用既有策略和归一化研究模型，显式冻结假设，价格与分红不重复叠加。语法及计划模式先验，生产运行归 S5。
- S5-B：复用已有只读 `research-window-replay.mjs`，在目标运行态对实际新快照和仍存在的旧快照各重放两次，阻断 fetch/http/https/net/tls；不恢复已取消的旧缺失资产。S5-C：目标浏览器查看实际结果披露，不以 SSR 测试代替。
- 直接真实来源（尚非有效路由）：新 helper 查询 `300757.SZ`、2023-08-21～2023-09-05，21～25 日显式停牌，28 日开始交易；证券切换 `600221.SH`、2021-02-10～2021-03-02，19 日起粗 ST 标记。两次交易日覆盖字段齐全，周末仍未知；没有推导精确限制或风险类别。通过实际 wrapper 的两个在线响应均经主仓市场 Schema 解析；临时输出不作为手填样本包或生产准入。
- D0/R1 当前结论见 [有界补充核实](../reviews/2026-10-09-history-data-on-demand-bounded-followup.md)：D0 缺数字进度枚举，D 下游不启动；R1 仅景顺长城入口自动发现和换证券通过。
- 正式更新预检：首次因本次进程 Node PATH 缺失退出；补现有 Volta Node 后，host 25390 MiB 达到 20480 MiB，Docker 12274 MiB 未达到 18432 MiB，入口拒绝构建。随后在同一正式入口启用已有 `REPAIR_BUILD_CACHE_ON_NO_SPACE=true` 空间维护，未降低阈值、删除数据卷或绕过保护；预检通过，依赖层构建中。三次日志分别在 `/tmp/history-demand-update-20261009.log`、`/tmp/history-demand-update-20261009-nodepath.log`、`/tmp/history-demand-update-20261009-maintained.log`；最终结果另记。

### 正式部署、用户配置与当前真实消费

- S5-D（新增独立 DSA 叶）：用户保存并启用 HiThink 后，其实时目录为 ready、有效目标 eligible；直接既有适配器取得 `300757.SZ` 2023-08-05～09-05 的 12 条 qfq 日线。标准准备仍失败的根因是 HiThink 未加入现行研究日历入口及股票读取器要求全会话有 Bar，不能归为来源能力不足。精确写集：DSA `thesis_ledger_research_calendar.py`、新增 `thesis_ledger_hithink_stock_read.py`、`thesis_ledger_provider_runtime.py` 仅将原股票方法委派并缩小文件、专属测试及所属 Spec/Task/CHANGELOG。仅显式 `assume-untradable-no-bar` 的 HiThink 股票 none/qfq 请求复用已有研究范围；普通完整窗口和 ETF 不扩展。不保存路由/准入；定向检查后仅正式快更 dsa，再进行真实消费。
- S5-E（独立分页合同叶，依赖 S5-D）：定向 API 测试发现 runtime 已用 `hithink-stock-single-response-local-v1`，但公共分页合同查询漏登记同一精确股票目标，导致 API 拒绝合法响应。精确写集仅 DSA `thesis_ledger_market_v3_facts.py` 的分页合同登记及 `tests/test_thesis_ledger_hithink_stock_read.py` 的 HTTP/范围断言；复用既有协议，不改变上游版本、分页完整性或其他来源边界。

- `update.sh all` 最终退出 0，数据库默认 `check` 模式通过，五个容器均 healthy。镜像为 DSA `sha256:0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`、主仓 `sha256:2878d06a265a68ec8eb8e0079c82d4fa1e126a5dc4fdb06fa8226a5868f72afb`。入口自己的维护清理了可回收构建缓存及两个超出保留策略的回滚标签；没有删除数据卷、放宽门禁或手工替换容器。
- 实时目录中新 BaoStock 股票状态候选为 `ready`；初始有效策略 revision 72 只有旧状态主源，qfq 只有 HiThink。HiThink 在首次核对时因 `credential_missing` 不 eligible，不能视为本次取得价格。
- 用户明确授权后，仅通过 `PUT /api/market-data/policy` 在旧状态主源后追加 BaoStock、在股票日线 qfq 的 HiThink 后追加腾讯，保存为 revision 73/applied。两条主源保持、另外 14 条路由和 Provider 配置响应保持；没有凭证或准入写入。
- S5-A 语法和计划模式通过；实际创建研究策略 `8e6147fe-0ded-4cce-92be-a47c58cd909a` / 版本 `b4efa9fc-b9c5-4fd8-ad91-065079be9ef7` 后，标准准备返回 blocked：`incompatible-price-basis / DATA_UNAVAILABLE / backup-source-compatibility / invalid_proof`，完整价格窗口 2023-08-05～2023-09-05。没有创建新回测或伪造快照成功。既有 HiThink/腾讯备用兼容门禁保持；交换该 qfq 路由主备尚未获授权，不能擅自执行。
- S5-B 现存旧目标快照重放通过：CN `57def779-97d0-4562-9fe0-b613fe90269e` / `ae94a77d4d9cc8ef`，HK `ee7361da-a46a-4ac7-be93-895e6eff2ef5` / `b4fa70fe6a43f74e`，US `38ee3c6a-cdb0-4432-8313-86bb6466d8bb` / `d89b0082bfed48af`，ETF 原价现金 `a2274899-2d16-4a46-9b17-ad78c59c5f9a` / `5d1a7d83d42a4004`。使用现有只读脚本和目标 Worker 的实际模块，每份内部运行两次、结果与原校验和相同、fetch/http/https/net/tls 调用 0；未保存结果或恢复数据库。
- 原 P5 记录 ID `c2a25e3f-09d6-419f-9323-e17bf2d98442` 当前 API 404，未恢复或追补；原历史验收记录保留。在该次检查时新快照尚未产生，不能用以上旧重放或直接来源成功抵充 S5。
- S5-C 内置浏览器访问 `127.0.0.1:3000` 返回 `ERR_BLOCKED_BY_CLIENT`，浏览器清单调用超时；实际新结果页面尚未验收，保留未通过状态。


### 补齐凭证后的价格修复、真实回测与剩余缺口

- 用户在内置浏览器保存并启用 HiThink 后，实时配置为 `credentialSource=control`、`credentialConfigured=true`、`enabled=true`、`configVersion=3`。其精确股票 qfq 目录 ready、有效策略 eligible；原 revision 73 的存储投影仍留有旧不可用记录，但价格读取使用实时 DSA 投影。价格主源始终 HiThink，没有交换为腾讯。
- S5-D/E 已实现。修复范围是精确 HiThink 股票 none/qfq 的既有显式研究日历/缺 Bar 接缝及公共分页合同漏登记，不改变普通完整覆盖规则，也不绕过凭证、分页或数值校验。96 项定向测试、35 项受影响分页/日级测试及所属 `py_compile`/关键 flake8 通过。
- 在 infra 目录执行 `PATH=/Users/yzin/.volta/tools/image/node/24.18.0/bin:$PATH ./scripts/sync-code.sh dsa`，兼容性预检通过、退出 0、服务 healthy；复用原镜像 `0d92aaa1...`。这是容器可写层快更，重建后不保留，不作为新镜像证据。未改数据库结构、卷或凭证。
- 真实标准准备/创建入口取得两份新结果：`300757.SZ` 2023-08-21～09-05，run `677da4a6-6a1c-4eff-a7ef-f3cf64e8f1e7`，snapshot `0aa69642d2799087fcbbf305552bdcbe2f3a1c9528868c397641220d18c303d6`，checksum `aaccaddb45d93597`，6 次成交；`600221.SH` 2021-02-10～03-02，run `dc9feef7-ee5d-4da8-b093-13583f1825e2`，snapshot `fcc0ca85232fe979bad10456b17f368925581221cc3ff2d806d190dbc10617fc`，checksum `90d8cc1637c3921c`，8 次成交。两个证券只替换命令参数，实际执行/基准价格均 HiThink 主源；没有手补价格 JSON。
- 两份状态仍选中公告主源。第一份只冻结 8 月 28 日复牌，8 月 21～27 日及后续未披露日期保持未知；第二份冻结 2 份公告。首次来源读取成功即停止的既有主备语义保留，所以没有消费已配置 BaoStock 备用。验收脚本在检查 `providerId=baostock` 时失败，不能将已成功的价格回测冒充结构化 S5 通过。
- 新 `677da4a6...` 在实际目标 Worker 使用 `research-window-replay.mjs` 两次离线重放，checksum 相同，fetch/http/https/net/tls 网络调用 0。这是本次公告快照的重放；结构化 v4 真实新快照重放仍未验收。
- S5-C 已在内置浏览器 `http://localhost:5173/strategy/jobs/677da4a6-6a1c-4eff-a7ef-f3cf64e8f1e7` 查看实际结果和数据/假设：HiThink 主源、6 次成交、原公告和未知日期披露与 API 一致。页面截图保存在会话临时证据，不入仓。结构化来源界面尚没有实际新快照可验。
- 已向用户说明交换股票状态主备的理由与代价：它能验证逐日停牌/粗 ST 入快照，但现有整窗单源路径不合并公告精细规则；用户目前仅要求先解释理由，尚未批准交换。状态主源仍 official-states，BaoStock 备用；其余路由保持。S5 保留未勾选，L1 依赖未满足；不能擅自换源或隐式逐日跨源补读。
- D0 当前凭证缺口已解除；有界直接读取 `510300.SH` 返回 14 行、全部数字进度 2、条数传输校验通过，历史覆盖仍不完整；`159516.SZ` 返回 `count_mismatch`，未作为事件或零分红。数字枚举语义仍未确认，D1～D5 不启动。具体观察时钟与摘要见补充核实报告。


### S5 结构化状态闭环完成

- 用户了解交换理由与整窗单源代价后回复“继续”；本轮仅通过既有 `PUT /api/market-data/policy` 将股票状态换为 BaoStock 主、原公告源备，revision 74/applied。与保存前比较只有该路由变化，Provider 配置响应和其他路由保持；价格仍 HiThink 主、腾讯备，无凭证或准入写入。此选择不会逐日合并两源精细规则，当前粗 ST 不能替代它们。
- `300757.SZ` 2023-08-21～09-05，run `5bfdc5da-e5b2-4241-a22c-f397d5fcbe39`，snapshot `22c2e076b1091eaaec4cdea86d78ab2b6be85c8355aba5dd5940dc7bd3ae3673`，checksum `43ef084dd249aa65`；`600221.SH` 2021-02-10～03-02，run `9b088131-3874-4d32-940d-1884be271110`，snapshot `7ec8e42988fcaa4a9c733a473296312117ec3a1288ec7b366c5b3cd244013560`，checksum `8d8c305cdb65aac5`。参数化脚本两次均完整通过，未改源码或手填价格 JSON；两个价格/基准均 HiThink 主源，状态均 BaoStock 主源，冻结版本 v4。
- 第一份起点及 8 月 21～25 日明确 suspended，期间无成交，复牌后 6 次成交；第二份 2 月 19 日起 8 个日期粗 ST flagged，8 次成交，没有转为精细风险或价格限制。两份交易日状态/ST 覆盖已知，周末仍 unknown。来源摘要、原观察时钟（缓存取得）、本次请求时钟及价格截点分别冻结。
- 新两份快照在实际 Worker 各两次离线重放，结果与持久 checksum 相同，fetch/http/https/net/tls 调用均 0。主仓执行输入未再修改，前述四份旧快照保持验证证据不失效；旧资产不追补。
- 内置浏览器实际新结果展示停牌、粗 ST、覆盖、时钟和来源摘要；实际导出 `diagnostics-v2.json` 保含 `sourceRecords/structuredCoverage/coarseST/structuredResearch` 及相同响应摘要。截图在会话临时证据，不入仓。S5 通过只限所选沪深股票窗口及普通固定来源研究，不承诺全风险、精确限制、ETF/北交所或严格 PIT。


### L 精确叶与写集

- L1-A：DSA 新增 `thesis_ledger_baostock_lifecycle.py`，复用既有 BaoStock 会话、代码转换、`_result_frame/_safe_date` 按单证券 `query_stock_basic` 读取；规范化 ipoDate/outDate 与各自未知原因、独立摘要和观察时钟。所属专属测试、DSA Spec/Task/CHANGELOG；不查询全市场。
- L1-B（依赖 L1-A）：DSA `thesis_ledger_baostock_status_source.py` 只接入新基础日期 helper、来源引用与缓存修订，不改变已有日状态规范化；路由测试和缓存回归。沿用当前已选 BaoStock 状态路由，不新增或保存用户路由。失败日期保留不可用，不伪造末次交易日。
- L2-A（依赖 L1-B）：共享契约新增 `market-basic-lifecycle-v3.ts`，`market-trading-status-v3.ts`/`backtest-trading-status-v3.ts` 只挂载基础日期、引用校验和独立 v5 冻结版本，专属 Schema 测试。旧 v1～v4 不回填。基础日期独立于公告专属 listingPhase 和精确规则。
- L2-B（依赖 L2-A）：Server 新增 `backtest-basic-lifecycle-v3.ts` 负责基础边界与范围告警；`backtest-structured-status-v3.ts` 选择 v5；`backtest-trading-status-execution-v3.ts` 仅消费 helper；`backtest-v3-runner.ts` 仅消除同执行证券已取得 IPO 日期时的旧未知警告，保持其他证券和日期不明告警。专属定向及领域 Runner 测试。
- L2-C（依赖 L2-B）：Desktop 新增 `BacktestBasicLifecycleFacts.tsx`，原 `BacktestStructuredStatusFacts.tsx` 仅组合；复用原格式化/原子类，所属测试。诊断输出采用白名单，补入 basicLifecycle 并沿用清理规则；验证新字段和来源引用。
- L3：上述局部与必要包级检查通过后正式 `sync-code.sh all`（两应用源码均修改，无依赖/Schema/migration 变化），目标读取与新回测分别验收；上市边界、空 outDate、真实摘牌日期和新/旧离线重放分别报告。价格入口上市前拒绝/缺 Bar 处理保持原研究语义，不注入价格或补不存在的交易日。

- L2-B 接缝补充：`backtest-listing-disclosure-v3.ts` 接受同执行证券冻结状态，已知 IPO 时消除价格入口的未知上市警告；无日期及旧快照仍保留。L3-A：参数化目标脚本兼容新 v5 并验证基础日期来源，不修改行情输入。


### L 本地实现与检查

- L1-A/B 已实现单证券基础日期读取、身份/唯一行校验、日期独立状态、规范化摘要/时钟、原状态路由组合和缓存修订。DSA 定向原日级/基础资料/缓存/路由 56 项通过；补充 SDK 精确参数与登录失败测试后最新子集 29 项通过，关键 flake8 通过。没有重写既有 BaoStock 日状态或全窗口可交易性。
- L2-A/B 已实现独立 basicLifecycle 契约、v5 冻结、上市前和摘牌日起执行/基准排除、原价格产物保持和相应告警。共享契约与 Server 受影响 36 项通过；旧公告、旧 v4 与完整旧结果在领域 Runner 中保持。上市前唯一信号被拒绝且后续无新信号时允许零成交，测试不伪造上市后成交。
- L2-C 已实现基础日期中文披露及实际诊断白名单字段。Desktop 相关 14 项通过；Desktop build（含 typecheck）通过，原 chunk 大小警告保留。Server typecheck 与依赖方向检查通过。正式更新与目标读取/浏览器/离线重放尚未执行，L3 保持未勾选。


- L1-C（目标读取发现后追加，精确写集为 DSA `thesis_ledger_baostock_status_source.py`、专属生命周期测试及 DSA 文档）：实际 600221 窗口一次返回基础日期不可用，随后单证券直接源读取成功。避免该失败随日级有效状态缓存 24 小时：基础日期不可用的组合不写缓存，已有不可用组合触发下一次正常有界读取；不删除缓存、不改凭证/路由、不回填失败快照。定向通过后仅 `sync-code.sh dsa` 再验证正常消费。


- L1-D（定位超时后追加，精确写集为 DSA 生命周期 helper、专属测试和文档）：600221 同一 SDK 模块实际用时 47.92 秒并取得正确日期，两次登录/登出超过既有 45 秒上限；正常入口因此整窗回退公告。将日状态和基础日期读取置于同一现有 SDK 会话，并用借用会话适配器让原规范化函数保持不变，不提高期限、不回填失败快照。定向测试后仅 dsa 正式快更与当前正常入口再验收。


### L 目标验收已取得与未取得

- 正式更新：infra 目录执行 `PATH=<Node 24.18.0 路径>:$PATH ./scripts/sync-code.sh all`，退出 0，兼容预检通过，Server 及 workspace build 和 DSA WebUI build 通过；三个应用容器健康，镜像 ID 保持前述值，未改数据库结构/外部卷。这是可写层快更。L1-C 后仅 dsa 快更退出 0；L1-D 当前进入独立 dsa 快更验收。
- 真实 `300757.SZ`，2019-01-15～02-15：run `693bc8bf-236b-43bc-bbb7-2208a316526f`，snapshot `106e764d0318e3bad7ade101165fa7fd6a765f986152758cb2b2ff717893bacd`，checksum `762d38c3c1b8bb66`，18 次成交。HiThink 为执行/基准主源、BaoStock 为状态主源；v5 冻结实际上市日 **2019-01-08**、outDate 未提供及基础日期摘要 `f5e1fd4c7d89a1c458fac74d3521ad68624f102e92e44e693975850a07f1551b`。此窗口从上市后开始，仅证明字段进入正常结果，不作为上市前场景通过。
- 内置浏览器 localhost:5173（Desktop 已构建产物的 Vite preview）实际展示上述日期、空值语义和来源摘要；实际下载诊断 JSON，白名单包含 basicLifecycle、sourceRecordId、相同日期与摘要。不是 Electron Native 验收，也不是完整重放包。
- 对上述新 v5、原 S5 v4 以及旧 CN/HK/US/现金四份快照，目标 Worker 各作两次只读离线重放，持久 checksum 和 snapshot 保持，fetch/http/https/net/tls 调用均为 0；全部通过。该后续 DSA 会话改动不触及离线输入或 Runner，不重复无关重放。
- 真实当前状态入口按参数读取 `600112.SH`，取得 IPO **1997-11-27**、outDate **2024-08-15**，基础日期摘要 `378c7714437723aa64f36c0913ff50e5b7a475bad6ece8934980a144765ac785`；没有把 8 月 15 日变为最后交易日。300757/600221 单证券直接源读取分别得到 IPO 2019-01-08 / 1999-11-25、空 outDate；直接源成功与正常路由成功分别记录。
- **未通过：跨上市日回测**。300757 的 2018-12-27～2019-02-01 标准准备返回 `DATA_UNAVAILABLE`，要求的执行价格预热从 2018-12-11 开始、`coverageProof.warmupSessions` 不足；未补造上市前价格、未删除全局覆盖检查。既有准备尚未消费本次基础日期来表达上市前无行情与必要预热的关系，L3 保持开放。
- **未通过：真实摘牌窗口回测**。600112 的 2024-07-29～08-23 及扩大至 2024-04-01～08-23 均在标准准备阻断：HiThink 主源不可用，腾讯备用 `invalid_proof`；未换源或改准入，尚无这两个窗口的新 snapshot。基础日期取得不证明价格路径可用。
- 600221 初次新 v5 基础日期不可用，后续重试整窗回退公告；单证券直接基本资料可得，但日级＋基础资料两次会话测得 47.92 秒超出既有 45 秒上限。L1-C/D 按实际失败修复缓存与会话接缝，未把这些失败快照回填或记为成功。


### L1-C/D 最终正常消费与完成边界

- L1-D 单次既有 SDK 会话复用测试及相关日级/缓存/路由 **48 项通过**，关键 flake8 通过。infra 正式 `sync-code.sh dsa` 退出 0，兼容预检、DSA WebUI build 与健康检查通过；镜像/数据库/卷保持，仍为可写层快更。没有提高 45 秒读取上限。
- 之后正常参数化入口 `600221.SH`，2021-02-10～03-02：run `2a8fcb3a-e1b8-4017-94df-53f09f70dd6d`，snapshot `49a3a835f1ed0f48dcbdbf6fd80a61e55f29ae84a11b0b98ad48f8f0243bedda`，checksum `f2d1fe04027e435f`，8 次成交，BaoStock 状态主源、HiThink 执行/基准主源，v5 实际冻结 IPO **1999-11-25**、outDate 未提供及来源摘要 `bcb2f17c173a332c198e15b7ba1d298481edc8124ff10bdc2faf0e296f36a528`。无需代码或手填 JSON 换证券和跨月区间。早先不可用/公告回退运行保持原结果，没有回填。
- L1/L2 完成只表示基础日期的有界正常读取、字段冻结、执行消费、本地边界测试及页面/导出已经接通。L3 的真实上市前准备和摘牌窗口价格能力仍未通过，保留未勾选；不得按两份普通窗口成功宣称这些场景完成。
- 下一叶先只读盘点准备过程的 `coverageProof.warmupSessions` 与来源已知 IPO 的关系，再固定独立写集；不能直接忽略全部预热或删除全局覆盖检查。600112 仅对所需证券/区间核实 HiThink 价格响应及已配置备用的兼容证据；不改变主备或直写准入。D 下游仍等待 progress 数字枚举的必要证据。


G1 已按已完成 S/L1/L2 的能力核对来源、口径、覆盖、缓存、研究假设和冻结一致性，结论见补充核实报告；L3/D0及D下游保留开放，当前任务不归档，不恢复取消项。


新600221运行在目标Worker两次离线重放通过，resultChecksum `f2d1fe04027e435f` 与 snapshot `49a3a835f1ed0f48dcbdbf6fd80a61e55f29ae84a11b0b98ad48f8f0243bedda` 保持，networkCalls=0。最终五容器健康；本轮未提交或推送，保留三仓并行修改。


## L3 本轮精确叶与停止点（2026-10-09 增量）

由主代理串行执行，保留三仓 dirty 基线（主仓1000/DSA217/infra75项），不重做已完成任务。实施前已核对准备、原依赖预热、Reader/冻结视图、快照实际Bar、日历对齐及状态取得顺序。框架所有权依照统一适配层 Spec：供应商实现留DSA，Market暴露标准数据，Backtest定义研究行为。

- [x] L3-C：共享语义合同。仅新 `packages/schemas/src/backtest-lifecycle-preparation-v3.ts`、`backtest-run.ts`、`backtest-run-preparation-v3.ts`、`index.ts` 与专属schema测试。显式可选版本、固定来源股票范围、状态/价格输入绑定与信号起点一致性；旧协议、未知IPO及无效绑定测试通过后才能接执行。
- [x] L3-M：Market生命周期读取。仅新 `apps/server/src/market/market-lifecycle-reader-v3.ts`、`market.module.ts`、边界门禁及专属Market测试。沿用当前有效状态路由和标准DSA合同，无供应商分支；返回前核对路由，未知/失败保留。原价格coverageProof不改。
- [x] L3-P：Backtest准备与围栏。仅新 `backtest-lifecycle-preparation-v3.ts` helper、`backtest-run-preparation.ts/.service.ts`、`backtest-creation-guard.service.ts`、`backtest-preflight-v3-execution.ts`及专属准备/围栏测试。原计划区间和预热数不改，完整价格首次读取后推导起点，最终Reader与预检仍校验；新协议、足够/不足/未知/普通窗口、输入变化逐项通过。
- [x] L3-F：冻结绑定。仅 `backtest-snapshot-v3-builder.ts`、`backtest-trading-status-snapshot-v3.ts`、`backtest-snapshot-v3-tradability.ts` 与专属生命周期Snapshot测试。冻结准备版本，校验实际Bar/原预热/日历与新起点，准备事实变化必须重新准备；离线不查最新源。
- [x] L3-E：策略与基准。仅新 `backtest-lifecycle-execution-v3.ts`、`backtest-v2-execution-exchange.ts`、`backtest-trading-status-execution-v3.ts`、`backtest-v3-runner.ts`及领域Runner测试。信号使用真实上市后预热、原成交时序，基准同起点对齐，原估值不增加规则；旧结果完整身份保持。
- [x] L3-U：客户端披露。只读核对现有结果/诊断接缝后固定新组件/白名单的具体文件；只新增协议、原请求范围/实际信号起点、原预热数和独立来源说明，不重新设计页面。旧页面及诊断测试保持。
- [x] L3-D：摘牌源有界诊断。当前路由只读确认后，600112及两个原失败区间各核对HiThink失败详情、腾讯兼容缺口；只写证据。若发现适配缺陷先单列DSA实现叶、确定文件和测试再改；最多有界寻找三个候选真实摘牌正例，无法取得保留开放，不更改主备/凭证/准入。
每叶遇到新增责任面先在此追加精确写集；不降低预热、缩短用户请求起点、补零、跳过Reader/快照/日历完整性或改价格源coverageProof。严格入口、旧协议及取消历史任务不扩展。各叶完成状态以其责任面证据为准，L3-V 的真实验收缺口仍未勾选。

L3-F 写集补充：`backtest-snapshot-builder.ts` 仅传递 Market 生命周期读取端口，原构造参数保持兼容，旧调用不新增读取；新协议缺少端口必须拒绝。

L3-F 校验接缝补充：`backtest-snapshot-v3-calendar-alignment.ts` 仅在新协议下用冻结信号起点校验原实际预热数，并重算独立生命周期绑定；全部原日历/价格/逐日可交易性完整性检查保留。定向领域测试暴露旧起点预热假设，不能只改Builder而跳过最终冻结与重放校验。

L3-U 精确写集：新Desktop `BacktestLifecyclePreparationDisclosure.tsx` 与 `backtest-lifecycle-preparation-diagnostics.ts`，`BacktestModelDisclosure.tsx`只组合，`strategy-backtest-diagnostics.model.ts`只挂白名单，专属页面/诊断测试；不改变布局或旧数据说明。

L3-U2 显式选择叶：新Desktop `BacktestLifecycleResearchChoice.tsx`、现有 `BacktestPricePreparation.tsx` 的状态/请求最小接缝及专属测试；只在固定来源境内股票显示选择，默认保持旧准备，选择后请求 listed-bars-warmup-v1 并改变Query身份。优化实验入口暂不增加新协议，不在本轮复用实验完成状态。L3-V 参数化目标脚本只增加 --lifecycle/--ma5/--expect-blocked，结果打印冻结准备输入，不手写来源JSON。

测试所有权收敛：标准生命周期响应替身统一放在 `packages/schemas/test/fixtures/lifecycle-response-v3.ts`，Schema/Market/Backtest/Desktop测试单向复用契约替身；不让共享Schema测试依赖Server，不把测试替身带入生产输入。

测试打包边界修正：跨包TS测试源会违反Server rootDir；共用标准替身改为 `packages/schemas/fixtures/market-basic-lifecycle-v3.response.json`，Server本地Market测试helper只生成范围，Schema/Desktop直接读取JSON。未扩大运行时打包或改tsconfig门禁。


### L3 实施检查点（实施时记录，后续正式验收见下文）

L3-C/M/P/F/E 已接入显式协议、Market标准生命周期端口、完整价格首次取得后推导、最终Reader冻结视图预热校验、创建输入围栏、快照前后复核以及离线最终日历/实际Bar校验。用户区间与原预热数量不变；未知IPO或生命周期范围内来源缺失不推迟起点。策略信号、基准对齐使用冻结起点，旧协议没有新行为。合同/端口/准备/创建/领域快照定向18项通过；随后指纹增加完整provenance（排除包装fetchedAt），等待最终受影响检查。

L3-U/U2 新增显式选择、准备结果和结果页披露、诊断白名单；默认选择旧准备，固定来源境内股票可选择上市后积累模式。Desktop所属和旧页面/诊断15项通过。曾发现跨包TS测试helper违反rootDir，已收敛为共用JSON合同替身和Server本地生成，不改tsconfig或运行态打包。

L3-D 有界查询已完成：600112两个原窗口HiThink当前业务码1002，腾讯实际有价格但缺原compatibility proof/observation而未被正常选择。三个候选600122/600139/000005基础摘牌日分别2023-06-26/2023-03-27/2024-04-26，HiThink当前qfq也均1002。600112既有none主源正常Data Contract亦不可用。没有确认可安全修复的供应商请求缺陷，未修改DSA代码、路由或准入；摘牌边界真实消费正例仍未取得，不能以这些负例或本地领域测试替代。后续正式真实验收仍保持开放。

最终受影响检查：共享契约与Server九文件79项通过，Desktop相关15项通过，Server typecheck及Desktop build通过（原chunk警告）；依赖方向和文件尺寸检查通过，后者保留9项既有超阈值警告、未给其放宽门禁。ESLint发现指纹投影中的未使用变量，已只调整排除包装时钟的写法，定向重验后再正式更新。

L3-M 实际运行复核发现有效策略响应的 appliedAt 随读取重新生成（两次revision均74）；整体对象比较误报路由变化。只在原Market读取叶比较本能力路由、enabled及实质revision，包装requestId/读取时钟不作为路由版本；真实变更测试保持。首批拒绝原因不是预热不足，未作为合理预热拒绝通过。

L3-P 创建围栏补充：不只比较最新来源与声明inputHash，还复核准备响应自身的指纹；防止修改日期后重算普通config checksum却保留旧声明哈希。专属篡改测试先拒绝，不创建失败快照；仍属原围栏责任面。


### L3 当前真实验收：通过与开放分列

- [x] 跨上市日真实消费：`300757.SZ` 请求2018-12-27～2019-02-01保持，MA5原所需5个真实预热Bar保持，冻结信号起点2019-01-15；run `1ec5077b-5f3c-4a01-b827-b1953c477ae5`、snapshot `2a2f1193e469636399a236bec2072a2ec5a54c08d370bcebe744f1d03d316d78`、checksum `39457c7e7b347067`，4次成交。生命周期实际BaoStock，IPO2019-01-08；价格实际HiThink主源，无手填来源JSON。新快照使用准备取得的完整状态响应，策略/基准排除信号起点前比较日期，价格证明不改写。
- [x] 预热仍不足的合理拒绝：同证券请求2018-12-27～2019-01-10，标准准备返回 `DATA_UNAVAILABLE`，明确“生命周期窗口内真实行情始终不足原策略预热需求或没有信号日”；未创建run或snapshot。脚本同时断言拒绝原因，首批包装时间误拒绝不算此项通过。
- [x] 普通窗口真实回归：`600221.SH` 2021-02-10～03-02，新协议信号起点保持2021-02-10、原所需1个预热Bar保持，8次成交；run `34a21cda-54bd-48fb-ba13-3e085c3dad74`、snapshot `360f037f272ff5d4a6178b0a8266903f6b0951cd45347e5af2824d16280c9989`、checksum `60bb63adc67db115`。实际IPO1999-11-25，BaoStock/HiThink主源保持。
- [x] 生命周期未知的合同/准备测试：未知IPO且不足不推断上市日并拒绝；未知但原起点前预热足够时不延迟起点。此项为定向测试，没有伪称自然未知IPO样本的生产成功。
- [x] 浏览器结果与准备：用户打开正常页后完成实际准备/额外预检与结果核对；开发入口和构建产物分别验证，详见下文。
- [x] 实际诊断下载落盘：自动点击取消的观察保留；用户随后手动下载的实际文件已核对与冻结输入一致，见下文增量证据。
- [x] 新旧目标快照离线重放：两份本轮新快照、旧v5/v4及旧CN/HK/US/现金四份，各两次重放，结果与持久checksum/snapshot一致，networkCalls=0；精确记录见下文。

正式运行态更新均由infra `sync-code.sh thesis-ledger`执行，兼容预检通过、Server/workspace构建通过、Server/Worker healthy、镜像ID不变；可写层快更不作为新镜像证据，未改数据库/卷。包装比较与创建自指纹围栏修复各走正式最小快更；最终围栏更新已退出0，目标运行态拒绝篡改输入通过；不重复未改的价格源/DSA构建。

### L3 本轮收尾证据与开放停止点

- [x] L3-U2：显式选择及Query身份已实施；实际内置浏览器默认“保持起点前预热”，选择“上市后积累真实预热”后标准准备与额外预检通过。上市日未知的说明已与合同对齐：不推迟起点，原起点前不足则拒绝。原配置和研究模型只作表单验收草稿，没有重复创建运行。
- L3-F 实际写集收敛：冻结校验位于 `backtest-snapshot-v3-calendar-alignment.ts`，`backtest-snapshot-v3-tradability.ts` 未因本轮新职责修改；Builder两层只传端口，冻结状态文件只绑定准备响应。共享JSON替身及Server本地测试helper属于测试输入，不进入生产快照。
- 创建围栏真实验收：对run `1ec5077b-5f3c-4a01-b827-b1953c477ae5`原配置请求 `/api/v1/backtests/run-config/preflight`，status=ready且revisionStamp与原准备完全一致。随后仅在请求副本篡改IPO为2019-01-09并重算普通runConfigChecksum，`POST /api/v1/backtests/runs` 返回409 `PREPARATION_STALE`，未创建运行；当前价格或状态事实未修改。临时验收脚本先将Nest成功状态及错误码写错的断言已按实际合同更正，未当成应用缺陷。
- 跨上市实际首笔成交2019-01-16开盘，晚于冻结信号日2019-01-15，延续原下一有效Bar时序。策略净收益0.85%、基准39.20%、净收益差-38.35%；基准status=compatible且两者成本/来源指纹一致。页面、原API及重放结果一致，不将上市前计入基准买入日。
- 浏览器层次：`localhost:5173`实际脚本为`/@vite/client`及`/src/main.tsx`，属于开发入口；在那里实际准备/额外预检已通过。之后重新执行Desktop build，使用本轮启动的`vite preview --host 127.0.0.1 --port 5173 --strictPort`，内置浏览器`http://127.0.0.1:5173/strategy/jobs/1ec5077b-5f3c-4a01-b827-b1953c477ae5`实际加载`/assets/index-DQpV49Rr.js`，结果、价格/生命周期独立来源及预热披露通过。两层分别记录，不称为Electron Native验收。
- 诊断模型与下载分开：真实API输入经过Desktop实际`buildBacktestDiagnosticExport`后，请求范围、起点、原预热5、IPO、来源记录摘要与准备输入完全一致；inputHash=`2e15e9c096e0db48321a41c24f00d0d30fb3335cfb1a8c02e50973818710db4d`、priceResponseHash=`84037caf589cc3f5337b2e482f59dc31313cf4fa97d87a3bb00ab7112461feca`。开发/构建入口点击下载均产生20948字节诊断的downloadWillBegin，随后receivedBytes=0/state=canceled，未落盘，且一次浏览器调用异常长时阻塞。未猜测取消根因、绕过浏览器限制或修改共享下载设施，本轮下载验收仍开放；此前S/L1/L2已取得导出证据不改写。

离线重放均在本轮已正式更新的实际Worker读取已有卷，只读运行 `docker exec -i -w /app thesis-ledger-dev-backtest-worker-1 node --input-type=module - <runId> <checksum> < scripts/research-window-replay.mjs`。两份新快照和旧v5/v4先执行，旧CN/HK/US/现金四份在最终创建围栏快更完成后执行；围栏不改变Runner输入。脚本拦截fetch/http/https/net/tls；下表各两次、identicalReplay=true、networkCalls=0，命令退出0。没有回填旧快照或请求新来源。

| 快照 | run | snapshot | checksum |
| --- | --- | --- | --- |
| 本轮跨上市 | `1ec5077b-5f3c-4a01-b827-b1953c477ae5` | `2a2f1193e469636399a236bec2072a2ec5a54c08d370bcebe744f1d03d316d78` | `39457c7e7b347067` |
| 本轮普通窗口 | `34a21cda-54bd-48fb-ba13-3e085c3dad74` | `360f037f272ff5d4a6178b0a8266903f6b0951cd45347e5af2824d16280c9989` | `60bb63adc67db115` |
| 原v5 | `2a8fcb3a-e1b8-4017-94df-53f09f70dd6d` | `49a3a835f1ed0f48dcbdbf6fd80a61e55f29ae84a11b0b98ad48f8f0243bedda` | `f2d1fe04027e435f` |
| 原v4 | `5bfdc5da-e5b2-4241-a22c-f397d5fcbe39` | `22c2e076b1091eaaec4cdea86d78ab2b6be85c8355aba5dd5940dc7bd3ae3673` | `43ef084dd249aa65` |
| 旧CN | `57def779-97d0-4562-9fe0-b613fe90269e` | `52a204872a18eaab6f3011387f14e9c535518351a57dd838a3cc8b1a34b216b6` | `ae94a77d4d9cc8ef` |
| 旧HK | `ee7361da-a46a-4ac7-be93-895e6eff2ef5` | `5a64a25d507d7a5c255663fb1611aa85dfb45ca659a4f03d36e47df406a8ffc5` | `b4fa70fe6a43f74e` |
| 旧US | `38ee3c6a-cdb0-4432-8313-86bb6466d8bb` | `12baac7e8765dace81cd71e85d5434af5abfd02a847846bb01a522dc1311ac87` | `d89b0082bfed48af` |
| 旧现金 | `a2274899-2d16-4a46-9b17-ad78c59c5f9a` | `0c06f2c585a46404ccc4de276cbf07dec059b1fd4d4e5c80c037819362429474` | `5d1a7d83d42a4004` |

必要检查可复核命令（主仓目录，PATH使用既有Node24.18.0，Shell经RTK）：

```sh
pnpm exec vitest run packages/schemas/test/backtest-lifecycle-preparation-v3.test.ts apps/server/test/market/market-lifecycle-reader-v3.test.ts apps/server/test/backtest/lifecycle-preparation-v3.test.ts apps/server/test/backtest/lifecycle-creation-fence-v3.test.ts apps/server/test/backtest/lifecycle-prepared-snapshot-v3.test.ts apps/server/test/backtest/backtest-run-preparation.test.ts apps/server/test/backtest/backtest-preflight-v3-execution.test.ts apps/server/test/backtest/basic-lifecycle-snapshot-v3.test.ts apps/server/test/backtest/trading-status-execution-v3.test.ts
pnpm --filter @thesis-ledger/server typecheck
pnpm --filter @thesis-ledger/desktop build
node scripts/check-boundaries.mjs
node scripts/check-file-size-guardrails.mjs
```

上述定向首次79项通过；Market包装时钟修正后该文件3项重验，创建自指纹修正后围栏1项重验，均通过。Desktop所属/旧诊断及模型15项通过，最终文案改动后build含typecheck再次通过；精准ESLint通过。边界门禁通过，尺寸门禁保留9项既有警告，未扩阈值。Server本轮源码最终由正式快更重新构建通过；没有在未变化输入上反复全量验证。

真实目标命令由主仓 `scripts/history-data-on-demand-target.mjs` 参数化：`300757.SZ 2018-12-27 2019-02-01 --run --lifecycle --ma5 --require-basic-lifecycle`、不足窗口改end为2019-01-10并增加`--expect-blocked --expect-insufficient`、普通窗口`600221.SH 2021-02-10 2021-03-02 --run --lifecycle --require-basic-lifecycle`。全部退出0；价格/状态由正常路由取得，没有手填来源JSON。

正式部署均从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `PATH=<既有Node24.18.0目录>:$PATH ./scripts/sync-code.sh thesis-ledger`，目标只含Server/Worker，三次分别为初始实现、包装修正、最终自指纹围栏修正，均退出0且兼容预检通过。日志为会话临时 `/tmp/history-demand-l3-sync-main.log`、`-sync-wrapper.log`、`-sync-final-fence.log`。DSA本轮没有代码变化，未重建/快更它；Desktop仅宿主构建预览，最终文案不触发无关Server更新。最后五容器healthy，policy完整对象与本轮只读基线一致，revision74/applied。未写凭证/主备/准入，未提交、推送、清理三仓修改。

历史检查点：当时 L3-V 与总 L3 因摘牌正例及诊断下载未取得保持开放；自动化记录存在取消事件。随后 L3-V-U 已核对用户实际下载文件，未发现需要修复的共享下载缺陷。当前只保留摘牌正向消费缺口，三候选不继续扩搜；未知 IPO 的合同/准备负例不冒充自然未知样本的生产通过，D0、ETF公告管线及精确涨跌停未因此扩展。

### L3 后续下载核对与摘牌诊断叶

- [x] L3-V-U：用户澄清手动点击已触发下载，并提供实际文件 `/Users/yzin/Downloads/backtest-1ec5077b-5f3c-4a01-b827-b1953c477ae5-diagnostics-v2.json`。只读解析核对通过：20948字节、SHA-256 `16e4549958271fe18f45d0b8981af511d2da8d47b2b230aef06b8196d039e2f3`，run/snapshot/checksum、请求区间、信号起点2019-01-15、原预热5、IPO、生命周期/价格输入哈希及来源响应摘要均与该运行冻结配置一致。产品手动导出通过；自动化取消记录不扩大为应用下载缺陷，不修改共享下载设施。前述“未落盘”是当时观察，当前由此项补齐。
- [x] L3-D2：只读核实HiThink原600112两窗口的供应商原始业务说明，而非仅根据本地1002映射解释；增加同日期普通股票对照，一共最多3次读取。复用现行适配器及只读持久凭证快照，传输包装只记录非敏感参数与有限脱敏业务字段；不改请求语义、路由、准入或源缓存。精确写集只为原Task/补充核实报告，临时探针在`/tmp`。若仍无已确认参数缺陷，保持摘牌真实消费开放，不循环寻找新证券。

本次启动再次只读确认policy为revision74/applied，完整对象与前次一致；三仓dirty基线1016/217/75项，未重做已通过的准备、回测或重放。主代理串行执行，不使用子代理。

- [x] L3-D3：修正已确认的HiThink业务错误分类。原两600112请求实际message均为`Unknown thscode: 600112.SH`，同参数600221对照成功30行；本地1002表将其误报格式无效。DSA精确写集：新`src/services/thesis_ledger_hithink_stock_errors.py`集中原错误表和精确身份分类，`thesis_ledger_hithink_stock.py`只委派，专属`tests/test_thesis_ledger_hithink_stock_error_semantics.py`及DSA原Spec/Task/CHANGELOG；主仓只维护原Spec/Task/报告证据。未知证券只表达来源未识别，不推断退市类别；其他1002及安全脱敏保持。定向HTTP适配器/原股票及runtime测试、语法/关键flake8、最小正式`sync-code.sh dsa`后目标同请求验证；不改变主备、请求参数、价格准入/完整性或旧快照。此叶完成不等于摘牌价格消费通过。

L3-D2/D3完成证据：原适配器及新错误语义47项、所属读取/runtime28项均通过（合计75）；精确`py_compile`及仓库`ci_gate.sh syntax`、`ci_gate.sh flake8`通过。原股票适配器524→511行，原错误表归属新26行供应商错误模块，其他在途改动保持。DSA对应Spec/Task/CHANGELOG已同步，不改变HTTP DTO或价格口径，双语首页未修改。

部署从infra目录执行 `PATH=<既有Node24.18.0目录>:$PATH ./scripts/sync-code.sh dsa`，兼容预检/DSA WebUI构建/健康通过、退出0；镜像保持`sha256:0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`，只更新可写层，未修改数据库/卷。临时日志`/tmp/history-demand-l3-continue-d3-sync.log`。目标读取2026-10-09T11:59:35Z（北京时间19:59）：同原参数两个600112窗口均分类`symbol_not_found`，上游仍1002/Unknown thscode；600221对照同窗口仍30行。直接适配器入口验证与标准回测消费分开，不称摘牌回测通过。只读凭证configVersion3、policy完整对象revision74/applied均保持。主仓快照/Runner未改，不重复已通过重放。

### 摘牌消费的新语义选择（待用户确认，尚未实施）

已有`market-route-compatibility-v3.ts`要求精确路由对/证券/整窗口、主备序列指纹、各自价格基准/固定范围及金额语义，并提供等价或转换核验证据；HiThink当前没有600112主序列，腾讯缺固定基准范围/金额语义核验，不能凭其83行签发这份证明。`market-window-selector-v3.ts`在读取备用前拒绝缺proof/observation是现行合同，并非可直接删掉的校验缺陷。现有共同价格备用分支未覆盖CN股票，不能通过增加供应商白名单绕过。

已向用户提出显式“整窗采用备用单源”的固定来源研究选择：只对本次同执行证券境内股票、归一化价格及固定快照声明，不证明与主源等价；执行、信号和基准使用同一实际来源的完整冻结窗口，来源变化重新准备。原预热、Reader、日历、来源自身coverageProof与生命周期绑定仍校验，旧协议/严格入口、主备/凭证/准入保持。它属于新增研究语义，超出本轮“只修已确认缺陷”的约束，收到明确选择前不实施。

若用户选择增加，按责任串行拆叶：C拥有`market-price-protocol.ts`、`backtest-run-preparation-v3.ts`及新独立协议helper/Schema测试；M拥有`market-bar-reader-v3.ts`、`market-window-selector-v3.ts`及新标准研究选源helper/Market测试，不增加供应商特判；P拥有`backtest-research-read-options-v3.ts`、`backtest-run-preparation.ts`及必要准备/预检/冻结测试，只传播已冻结声明；U拥有现有准备选择、模型披露和诊断白名单的最小组合及专属测试；V独立正式更新与600112原扩大窗口的真实消费、页面/导出及新旧重放。每叶开始前进一步核对ratchet及精确文件，不将全部实施揉成一项。未获选择不默认启动；L3摘牌真实消费保持开放。

### L3-D4：已退市证券的适配路径核查

用户要求先检查退市情形如何由适配层处理，未授权上述新协议。本叶只读检查代码及官方接口，并在目标DSA复用只读持久凭证快照作最多5次GET：600112完整代码/纯代码身份检索、600221身份对照、600112完全位于摘牌前的原参数价格请求，以及同窗按当前官方参数去掉offset的对照。精确写集为本Task和原补充核实报告，临时脱敏探针/证据放在`/tmp`。不遍历全市场、不猜其他市场代码、不更改路由/凭证/准入、不将检索空结果解释为不存在或已退市。若发现可靠身份映射或专用参数，再单列DSA修复叶；未发现则报告确切能力缺口，停止扩搜。既有摘牌真实消费验收保持开放。

- [x] 代码确认没有当前在市名单过滤；核对生命周期、价格请求和来源错误的独立边界。
- [x] 目标有界读取与官方参数对照，记录实际响应和请求边界。
- [x] 回写证据和当前接续指令，保留旧证据及未通过的摘牌正例。

探针首轮5次读取后，收尾完整对象比较因`effective.appliedAt`按查询时钟变化而失败，响应未输出，不用该轮断言证明来源结果或配置变化。已确认`_effective_v3`只读生成包装时钟，收敛为比较实质政策字段；即时输出每次脱敏响应，只补一轮相同5次请求，总调用上限10，不继续扩搜，不修改产品路由围栏。

L3-D4目标读取完成于2026-10-09T12:39:22Z（北京时间20:39），探针退出0，证据`/tmp/history-demand-l3-delisted-adapter-probe.jsonl`。持久凭证仍control/configVersion3，政策revision74/applied、所有实质字段前后相同；价格仍HiThink主源/腾讯备用，状态仍BaoStock主源/公告备用。

| 目标只读请求 | 实际取得 | 结论边界 |
| --- | --- | --- |
| `/api/meta/tickers/search`，q=600112.SH、asset_type=a-share、limit=10 | HTTP200、code0、item空 | 当前身份检索未返回该代码；空列表不证明不存在，也不证明零历史 |
| 同接口，q=600112 | HTTP200、code0、item空 | 未取得可核验的备用thscode；不猜代码或市场后缀 |
| 同接口，q=600221.SH | HTTP200、code0、1行，身份600221.SH/SH/a-share | 此凭证和身份检索接口正常；list_date/end_date/last_trade_date均null，不补推日期 |
| 600112.SH，2024-03-16～07-19，qfq/forward，既有offset0 | HTTP200、code1002、精确`Unknown thscode: 600112.SH`，适配错误symbol_not_found | 此窗完全早于已取得的2024-08-15摘牌日；失败不是跨摘牌边界触发的缺价格校验 |
| 同价格区间，按当前官方参数去掉offset | 同样HTTP200、code1002/Unknown thscode | offset不是该失败的已确认原因，不能凭对照修改生产请求 |

代码路径：HiThink股票适配器先做完整代码/日期/复权输入校验，直接请求历史端点；没有引用当前证券索引、在市列表或outDate。成功响应后才解析价格并做独立覆盖检查。标准研究读取不会因缺摘牌后价格将源覆盖伪装完整；生命周期来源负责明确IPO/outDate，Backtest排除outDate当日及其后的交易并冻结事实，来源缺失和已知停牌保持各自含义。腾讯同样直接映射沪深代码查询原生日线，没有当前在市过滤；其历史价格可得与备用兼容资格分开。

当前官方[股票行情接口](https://fuyao.aicubes.cn/docs/api-reference/prices/)未公开退市开关、历史证券身份版本或另一退市行情端点；[标的检索](https://fuyao.aicubes.cn/docs/api-reference/ticker-search/)可查身份，但本次没取得600112映射；[股票基础信息](https://fuyao.aicubes.cn/docs/api-reference/stock-basics/)仍为规划中。未检查供应商内部实现，不把本次现象扩大为所有退市证券均不支持。尚无已确认本地适配缺陷可再修；本叶是实际来源诊断通过，仍不是摘牌回测消费通过。产品源码本轮无变化，不重复测试、构建、部署或旧快照重放；主代理未使用子代理，未改三仓并行代码或配置。

### 当前停止点：差异留待统一适配层处理

用户明确要求先记录差异，后续统一处理适配层。已将HiThink退市身份/历史覆盖、腾讯实际价格与兼容资格、BaoStock独立生命周期、来源错误语义和CN股票备用合同差异记录到[统一适配层Task](../../tasks/2026-10-09-unified-data-capability-adapter.md) §8.2，并映射到其已有责任叶；本Task保留真实来源证据和L3业务验收状态。当前停止扩搜及适配改造，不实施尚未授权的整窗备用协议，不改变主备/凭证/准入。摘牌真实消费正例保持未完成，已通过的跨上市、普通窗口、导出和新旧离线重放保持；不以记录或后续框架计划代替验收，不归档当前任务。

### D0-B：必要分红语义的有界增量核实

用户选择继续当前可执行D0。精确写集为本Task和原补充核实报告，临时来源证据放`/tmp`；源码只读，不启动D1～D5或统一适配层。先沿当前官方基金分红文档核对数字进度和条数含义，再复用现有有界读取器对510300.SH、159516.SZ各一次读取（单次15秒、1MiB、2000行），只读持久凭证及有效政策。包装传输仅记录安全业务字段、摘要、条数/占位统计及510300一个已知事件，保留原读取器校验结果，不绕过count_mismatch交付事件。将2024年已核对公告对应的金额/登记/除息/支付日期逐字段比对；样本不作为数字枚举的普遍证明。最多核对当前文档及其直接官方字段来源，不重做全历史调查。仍无数字进度直接依据时报告具体缺口并停止D下游；若找到明确语义，先完成本叶证据再单列D1精确写集。

- [x] 官方字段说明与现有normalizer差异核对。
- [x] 两证券目标读取、条数/占位诊断及已知事件对照。
- [x] 回写实际取得、仍未知及下一可执行叶，保持原义务状态。

D0-B完成于2026-10-09T12:54:15Z（北京时间20:54），目标只读探针退出0、两次请求。持久凭证control/configVersion3、政策revision74/applied，全部实质政策字段前后保持；ETF分红仍HiThink主源/公告备用，未写准入或缓存。510300读取成功14行/条数14，progress全为字符串"2"，historyComplete=false；159516原读取器仍拒绝count_mismatch，实质形状为元数据count0、item一条所有业务字段均null的占位，不能形成事件或零分红结论。

已知510300事件原始per_ten_cash_before_tax=0.69，Decimal每份换算0.069；上海日期公告2024-01-11、登记01-17、除息01-18、支付01-23，四字段与既有上交所公告一致。仅支持该事件数值和日期，不证明响应完整，也不证明数字进度的通用实施状态。当前官方字段文档确认每10份单位、上海毫秒日期及count含义，示例为文字“实施”，仍没有"2"的枚举定义；MCP说明及直接官方聚合文档也未补齐。详见[原补充核实报告](../reviews/2026-10-09-history-data-on-demand-bounded-followup.md)的D0-B增量证据。

精确证据文件`/tmp/history-demand-d0-bounded-probe.jsonl`；记录业务白名单和响应摘要，不含凭证。有限断言核对目标原始金额/四日期、占位形状及政策保持通过；属于来源和字段诊断，不是产品测试或现金回测验收。源码未改，不运行构建/部署/旧重放。D0总体仍开放，D1～D5未启动；后续只需要数字进度直接语义及占位计数的正式适配合同，不继续无界采样或猜映射，原完整覆盖/现金资格保护保持。

用DSA现有`.venv/bin/python`将这条真实510300目标行原样送入既有normalizer，实际明确拒绝“分红进度口径未经核验”，未产生事件；未替换progress或注入假设映射。两份增量文档相对链接与`git diff --check`通过，无提交/推送/配置写入。

### D0-C：数字进度的直接官方定义追溯

用户明确选择继续D0。仅追溯当前官方开发工具页直接链接的SDK/CLI源仓中基金分红字段/schema和进度映射，不重复D0-B两证券读取、公告样本或全站来源调查。精确写集为本Task和原补充核实报告；下载的公开源码只读分析，临时证据放`/tmp`，不安装/运行SDK、不读取新凭证、不调用业务价格/分红接口。先定位源仓当前head与确切路径，再最多检查基金分红相关定义/字段说明及其直接依赖；来源中无映射时保持未知，不凭其他供应商枚举移植。找不到直接依据则记录已检查版本、路径及具体缺口，停止D下游。

- [x] 当前官方源码入口、版本及基金分红字段定义定位；发布包可得，Python当前源不可得分开记录。
- [x] 判断是否取得数字进度直接映射，并回写事实与边界；没有取得，不代表D0整体通过。

D0-C实际取得官方开发工具页指向的CLI `@hithink-tech/hithink-finance-cli`，npmmirror本次latest元数据返回0.1.13、gitHead `998e43a17a9c15f57ae7e61cccfd8a0674ce6b18`。仅下载127356字节发布包并比对元数据sha512完整性，未安装、执行CLI或运行postinstall；也不称已核实供应商当前main的head。官方Python源入口/root及直接README、固定上述gitHead的client原文件返回404；旧索引目录只作为定位线索。

只读核对发布包内基金分红说明、能力定义、通用query和HTTP client：`fund.dividends`使用`fundDetail`及`itemOutput`，item条目是`record<string, unknown>`；无progress专用输出或枚举，业务读取链透传响应。三个直接source map虽在JS注释中引用，但没有随包发布，不声称读取到源TS注释。必要schema/路径静态断言通过。证据摘要`/tmp/history-demand-d0-c-source-evidence.json`，包SHA256 `44fbaaa4bee883e0a04dc750eabaecb5e47b1ca01c36d5d42eeaf0cc6df6c030`，具体文件及各自摘要见该文件与[原补充核实报告](../reviews/2026-10-09-history-data-on-demand-bounded-followup.md)。

本叶继续未取得"2"的直接语义，D0总项与D1～D5状态保持。下一必要证据应明确这个端点的progress值、已实施/预案等状态及适用版本；官方CLI可透传"2"不是语义证明，其他供应商类似枚举不能移植。没有再次读取分红样本、凭证、政策或目标容器，没有源码/部署变化。当前公开文档与已取得发布包路径已检查，不循环重复该调查。

### D0-D：跨证券样本检验与进度含义推测

用户明确允许用几个示例验证并推测进度含义。本叶复用D0-B的510300已取得响应，对510050.SH、510880.SH各增加一次有界只读读取（每次15秒、1MiB、2000行）；检查返回的全部进度值分布，选各一至两条有真实金额/日期的事件与发行人或交易所公告对照。额外业务调用上限2，不做全市场扫描；公告只用于样本检验，不建设逐事件PDF门禁。精确写集为本Task与原补充核实报告，临时脱敏证据放`/tmp`。明确区分样本事实、推测与供应商直接定义；不改进度映射、路由、凭证、准入、缓存或覆盖检查，不启动D1～D5。核对后给出最合理候选含义及未排除的反例，记录停止点。

- [x] 两次目标读取及实质政策保持核对；3证券共51行的进度分布已记录。
- [x] 5条独立公告与真实金额/四日期断言通过，给出候选及未覆盖对照。
- [x] 回写原Task/报告和接续Prompt；D0总项未勾选、D1～D5未启动。

D0-D完成于2026-10-09T13:23:15Z（北京时间21:23），目标只读探针退出0，额外业务GET共2次，无子代理。510050 available/18行、510880 available/19行，均无全空占位，progress全部为字符串"2"；与D0-B的510300 14行合计51行。原读取器仍返回historyComplete=false。持久凭证configVersion3、政策revision74/applied实质字段保持，未写主备/凭证/准入/缓存。

5条独立原文对照：510300在2026-01-12和2025-06-11公告的1.23、0.88元/10份事件；510050在2025-12-10和2024-11-25公告的0.80、0.55元/10份事件；510880在2026-01-16公告的1.43元/10份事件。各条公告/登记/除息/发放日期与真实响应一致，Decimal每份换算一致。510050发行人历史分红页提供补充对照。510880 2025公告索引可见、原PDF两次超时，不列入这5条原文核验，不继续重试。具体日期、原始值和链接见[原补充核实报告D0-D](../reviews/2026-10-09-history-data-on-demand-bounded-followup.md)。

当前推测“2≈实施阶段”有跨基金样本及官方文字示例支持，但不是供应商直接定义。样本都已过发放日，未取得公告后发放前、预案或撤销状态，不能据此断言“2=现金支付完成”或猜其他值。用户允许本轮推测不等于授权将未知进度改为生产事实；D0整体仍开放，D1～D5未启动，必要后续输入按更新后的Prompt执行。

临时来源证据`/tmp/history-demand-d0-progress-samples.jsonl`，5条独立公告值与真实响应的核验清单`/tmp/history-demand-d0-d-progress-comparison.json`；定向样本金额/四日期、51行分布、historyComplete=false及实质政策保持断言全部通过。只更新两份原文档及接续指令，不改Spec稳定合同或任何产品代码，不运行部署/回测/无关门禁，旧结果和快照保持。文档相对链接与`git diff --check`作为本叶收尾检查。

D0-D收尾：两份文档14个相对链接全部有效；D0/D1～D5未勾选状态及5条核验清单断言通过；仓库`git diff --check`通过。未提交或推送。

### D0-E：用户固定研究语义及D1执行包

用户明确选择“当做实施方案已公布”。本次不将它改写为供应商已证实枚举；以`hithink-plan-announced-v1`、`research-assumption`固定其研究解释，原Spec先行更新。D0按本次有界研究的必要语义收敛，原供应商直接定义未取得的历史证据保留。依赖评审：金额/四日期已有直接样本对照；全空占位形状已确认；未知覆盖保持；D1可以执行，现金消费仍依赖D2明确协议。

D1拆为两个共享文档串行、单一执行面的叶，主代理直接执行：

- [x] D1-N：已公布方案规范化。写集为DSA新`data_provider/hithink_fund_dividend_semantics.py`、既有`hithink_fund_dividends.py`、新`tests/test_hithink_fund_dividend_research_semantics.py`及DSA原Spec/Task/CHANGELOG；主仓仅维护原Spec/Task/报告。显式版本允许字符串"2"、保留原值/原每10份单位/独立日期，只生成方案观察；默认入口、文字实施经济事实、未知进度拒绝和覆盖状态保持。验证版本隔离、未来发放与过去发放均不变已支付事实、缺金额/公告或除息日、冲突、未知值、全空占位及真实响应本地消费。停止点：不接入准入/路由/API或回测，不重启旧映射门禁。
- [x] D1-P：有界传输占位兼容。N后串行写既有`hithink_fund_dividend_reader.py`和新`tests/test_hithink_fund_dividend_placeholder_read.py`；复用N的纯字段语义，不新增平行读取器。仅显式研究版本且count0/一条齐全全空占位时返回零有效记录，保留响应摘要/原条数/忽略数/complete=false；默认入口及其他count冲突仍拒绝。验证近似空行、非空未知字段、错误计数类型、多占位/混合行、默认入口和byte/item上限不放宽。

D1整体验证：先各叶定向测试，再原normalizer/reader/mapped-read/契约回归及所属语法/关键flake8；以D0-D取得的51条真实业务响应和D0-B全空行作本地规范化消费，禁止联网以验证转换确定性。部署与标准生产消费独立归D3/D4/D5：本轮新增显式参数未接入运行时消费者，不为未使用的接缝触发部署，也不称生产读取或回测完成。D1通过后再固定D2执行包，不删除全局现金覆盖检查，不改用户配置/凭证/准入。

D1-N本地完成：新研究语义31项与原规范化16项合计47项通过，默认未知进度拒绝和文字实施事实保持；生产接缝尚未接入。接续D1-P，仅修改声明的reader与专属测试。

### D1完成证据与当前停止点

D1-N/P串行本地完成，精确源码为新`data_provider/hithink_fund_dividend_semantics.py`、原normalizer/reader和两个专属测试。显式`research_semantics=hithink-plan-announced-v1`解释原字符串2为实施方案已公布；保留原值、研究假设依据、每10份原金额、每份Decimal金额和各日期，不生成数字进度的现金事实。公告日不能晚于观察时点；缺必要金额/公告/除息日、其他未知进度、日期或同日记录冲突仍拒绝。传输只兼容count0/单条齐全全空占位，保留原响应摘要、原条数/忽略数；默认入口和其他count冲突保持。

验证从定向到所属回归：N首次31+原16共47项，P18+原reader17共35项；最终新增公告时点校验与准确错误文案后，6文件合计106项通过（32研究语义、18占位传输、原normalizer16、reader17、mapped-read10、来源契约13）。DSA目录命令：`.venv/bin/python -m pytest -q tests/test_hithink_fund_dividend_research_semantics.py tests/test_hithink_fund_dividend_placeholder_read.py tests/test_hithink_fund_dividends.py tests/test_hithink_fund_dividend_reader.py tests/test_thesis_ledger_hithink_mapped_dividend_read.py tests/test_thesis_ledger_hithink_dividend_contract_v3.py`。所属`ci_gate.sh syntax`、`ci_gate.sh flake8`退出0；最终消息修正后5个所属Python文件`py_compile`及精确关键flake8再次通过，未跑无关全量。

已取得真实响应的确定性本地消费：D0-B/D0-D的510300/510050/510880合计51行均输出方案观察；有界窗口分别2024-01-01～2025-06-30、2024-11-01～2025-12-31、2025-01-01～2026-01-31，各2条；159516全空行忽略1条。数字进度现金事实为0，覆盖始终false；阻断requests与socket连接、实际网络调用0。证据`/tmp/history-demand-d1-real-response-normalization.json`绑定原响应SHA256、观察时点和研究语义。不是当前生产端点读取或回测；reader占位兼容通过传输形状测试，不声称在目标已部署。

DSA原Spec/Task与CHANGELOG已同步，主仓原Spec/Task/报告及交接Prompt已更新。D0供应商直接枚举缺口仍保留，但本次研究约定已确定，D1具备本地接缝。D2～D5继续开放：尚无标准能力/准备/快照/结果使用这条语义，部署未执行，现金真实消费与新旧快照重放未执行。当前新增可选参数未被运行态调用，正式更新归D3起实际接入后的最小目标，不以本地单测或真实行转换冒充生产通过。无主备、凭证、准入、数据库或快照修改，无子代理、提交、推送或清理。

### D2执行包（2026-10-09）

- [x] D2-C：共享合同。精确写集为`packages/schemas/src/backtest-known-cash-research-policy-v3.ts`、`backtest-known-cash-research-v3.ts`、`index.ts`及`packages/schemas/test/backtest-known-cash-research-v3.test.ts`，另同步本Spec/Task。固定显式假设、境内ETF/CNY/原价固定快照、独立来源与覆盖未知、金额原单位、日期/观察时钟和控制版本一致性；旧价格/运行配置/准备合同不改。定向新合同与原价格协议回归，再Schema类型检查/构建；失败时不进D2-P。
- [x] D2-P：纯冻结与研究记账投影。精确写集为`apps/server/src/backtest/backtest-known-cash-research-v3.ts`、对应`apps/server/test/backtest/backtest-known-cash-research-v3.test.ts`和`scripts/check-boundaries.mjs`。复用规范化摘要及现有现金时点投影，校验十进制单位、记录/整包摘要和准备预期摘要；不读来源、不修改原覆盖检查。测试有效登记/除息/发放、期末应收、开盘/登记日缺失拒绝、输入变更拒绝、异供应商与离线确定性；必要Server类型/构建及仓库门禁后停止。已取得真实响应只作离线接缝验证，不冒充运行态消费；未接入入口不触发部署。

共享文件串行，主代理直接执行。D4发现公开协议、快照、Worker或结果披露变更时，先按各责任面追加精确叶，不借D2扩大成一次跨运行时实施。不得恢复旧HiThink全历史准入追补、取消任务或供应商业务特判。

- [x] D2-V：Desktop测试类型修正。门禁发现同主题L3披露测试仍有`Record<string, any>`，使`lint-workspace.mjs --guardrails`在Desktop阶段退出。精确写集为`apps/desktop/test/backtest-lifecycle-preparation-disclosure.test.tsx`该类型声明及本Task，改为`Record<string, unknown>`；不改UI实现、样本或断言。2项定向测试及文件lint通过，不触发部署。
- [x] D2-VS：Server测试声明修正。前一门禁继续到Server时发现两份L3快照测试的未使用变量/类型；单独拥有`apps/server/test/backtest/basic-lifecycle-snapshot-v3.test.ts`、`lifecycle-prepared-snapshot-v3.test.ts`及本Task。明确丢弃比较中剔除的标识符、删除未使用类型导入，样本与断言保持；6项定向测试、文件lint及Server类型检查通过，不触发部署。
- [x] D2-V2：分组门禁到Schema时，既有证券静态资料测试的超安全整数裸字面量触发`no-loss-of-precision`。只拥有`packages/schemas/test/market-security-static-info.test.ts`这一测试值及本Task，改为显式`Number('9007199254740993')`构造相同不安全number，保持“拒绝数值证券ID、保留精确字符串ID”的原断言和运行值。定向9项及该文件lint后，按仓库脚本相同参数续跑Schema/shared/dsa-adapter三组；此前已通过且输入未变的Desktop/mobile/Server/api-client/domain五组不重复。不改静态资料实现或适配层语义。

### D2完成证据与停止点

D2-C新增25项合同测试：所有假设显式选择，境内ETF/CNY/原价/实际份额/固定快照与旧现金时点协议同时满足，覆盖始终未知；日期、来源观察截止、策略版本、证券/区间、重复/顺序及旧入口隔离校验。Schema包一次863项通过，包含新25项与原价格协议6项；首次命令误用`test --`展开全包，后续改用`exec vitest run <精确文件>`，不重复全包。Schema类型检查、构建通过。

D2-P新增16项冻结/投影测试，连同原事件记账8、依赖计划12、预检7及快照依赖10合计53项通过；既有Domain现金资格/应收/发放模型5项通过。来源、控制版本、区间、观察时间、原进度、占位数、覆盖原因及记录摘要均影响冻结身份；已重算新包摘要仍必须匹配准备阶段预期摘要。每10份与每份金额使用既有Decimal精确校验，复用现有交易日及开盘要求，缺失即拒绝。Server类型检查/构建通过；新增源码与测试精确lint/格式检查通过。首轮Server测试因测试引用路径多写两级失败，改为真实仓库相对路径后53项通过，未修改业务算法应付测试。

D2-V/VS三份L3测试分别按Desktop/Server责任面只修静态类型/未使用声明，Desktop2项和Server6项定向通过；D2-V2静态资料number测试值改用显式转换，运行值与拒绝断言保持，9项通过。仓库边界、8包依赖图、尺寸门禁通过（尺寸有9条既有告警）；复杂度/lint门禁按原脚本清单8组1917文件分段覆盖，前5组在`/tmp/history-demand-d2-guardrails-final.log`无错误，后3组以相同规则续跑于`/tmp/history-demand-d2-lint-remaining.log`退出0。保留已有警告，未提高阈值、忽略文件或关闭规则；原整脚本最后一次停在已修复的旧number测试值，不宣称存在整脚本退出0记录。

真实方案离线接缝：`/tmp/history-demand-d2-real-observation-projection.json`复用D1已取得的3证券/6条日期、金额、原单位、原进度/语义、响应摘要和观察时间，冻结输入均通过，内容改动均拒绝，网络0。510880.SH的2025-01-01～2026-01-31两条在测试日历/开盘时点投影并重复一致，包摘要`fb1d8e649ae8e17da9777222775a246598a27b7125679aa896f4af20004acc88`；510300.SH的2024-01-01～2025-06-30与510050.SH的2024-11-01～2025-12-31因测试日历仅覆盖2025/2026而合理拒绝，不放宽或伪造日历。该探针的价格协议、开盘时点、控制版本及绑定版本元数据明确为测试输入，不是生产价格读取、真实回测或新旧实际快照重放。

D2的独立合同/纯投影完成后停止；未修改运行配置、公开准备入口、普通事件覆盖门禁、Worker或产品结果披露。无新增真实快照/run，无部署；D3标准读取、D4各消费面及D5真实回测/页面/新旧离线重放继续开放。纯接缝未被运行态使用，不为未使用代码触发正式更新。三仓并行修改保留，用户路由/凭证/准入保持，无子代理、提交、推送或清理。

### D3执行包（2026-10-09）

当前只读状态：有效/所需策略74，ETF现金路线HiThink主源、公告备用；主源凭证来自control，config3/credential1且已配置。旧完整事件主源`not_admitted`，公告备用`admission_expired`。不修改或追补该准入；只为本次明确研究合同建立方案观察读取。主代理直接执行，所有共享文件串行。

- [x] D3-C：共享方案观察交换合同。只拥有`packages/schemas/src/market-known-cash-record-v3.ts`、`market-known-cash-wire-v3.ts`、既有`backtest-known-cash-research-v3.ts`的通用记录归属/查询绑定扩展、`index.ts`、`packages/schemas/test/market-known-cash-wire-v3.test.ts`、跨语言样例`packages/schemas/fixtures/market-known-cash-v3.exchange.json`、记录所有权门禁`scripts/check-boundaries.mjs`及本Spec/Task。通用记录由Market合同拥有，旧Backtest记录名称保持兼容；定义严格研究请求/响应及双向绑定，明确CNY研究范围/请求查询身份依据、未知覆盖、完整规则与源时钟。默认旧事件入口不改。新合同、D2及旧事件/价格合同定向测试，Schema类型检查/构建后停止。
- [x] D3-R：DSA 标准研究读取已由 D3-RH、D3-RE、D3-RE-F、D3-C2、D3-FP 的规范化、鉴权/控制及交换样例子叶完成；真实标准读取由 D3-T 验收。原父步骤已被下方精确责任叶承接，不再实施第二遍。
- [x] D3-A：Server 能力读取已由 D3-A1/A2 的标准传输和通用 Market 选择完成；查询绑定、错误和旧入口回归及 D3-T 目标消费证据齐全。原父步骤不再是待执行任务。
- [x] D3-T：部署及真实标准读取（依赖D3-R/A）。按实际代码变化选择infra正式最小目标与预检，通过后最多读取三只既有正例和一只占位证券的有界区间，保存源/日期/版本/摘要/覆盖与实际拒绝；不写配置/准入、不创建现金回测。跨语言交换合同读取、换证券跨月与零有效记录未知覆盖是本叶验收，D4/D5生产消费保持开放。

执行预检：D3-C为当前依赖就绪叶，共享合同/记录所有权变化可独立验证；D3-R/A先拆责任面再动各自代码。查询身份与CNY研究范围依据新增后，D2冻结输入增加可选查询绑定元数据并校验，旧已冻结本地输入仍按原内容校验；D4的新入口必须要求来自本标准读取的绑定元数据，不能用旧输入缺元数据逃避披露。整套统一适配框架、旧HiThink准入追补与产品现金回测均不属于D3-C。

D3-C完成：28项新交换合同、25项D2合同、29项旧事件及6项价格协议共88项通过；受影响Server D2投影16项通过。Schema类型检查/构建、新文件lint、边界门禁通过。通用方案记录移归Market合同，Backtest名称兼容且原文件116→87行；查询依据和非敏感配置/HMAC凭证修订可选绑定到旧冻结合同，新交换合同强制提供。没有Provider名单、普通事件/运行入口或目标部署变化。

- [x] D3-RH：HiThink通用方案观察读取。只拥有DSA新`src/services/thesis_ledger_hithink_known_cash.py`、`tests/test_thesis_ledger_hithink_known_cash.py`及DSA原Spec/Task/CHANGELOG。复用D1传输/normalizer，显式研究语义、完整代码查询、税前每份金额与独立日期、区间筛选、非敏感来源版本/摘要/时钟；身份与币种为请求绑定/显式研究范围依据。失败不变空结果，源时钟和原条数/占位不补造；该叶只接收已固定凭证快照，不拥有策略或路由选择。定向成功/空/格式与语义拒绝、旧D1回归及精确编译/lint后停止。
- [x] D3-RE：DSA鉴权标准入口与读取前后控制校验（依赖D3-RH）。只拥有新`src/services/thesis_ledger_known_cash_v3.py`、`tests/test_thesis_ledger_known_cash_v3.py`、现有`api/thesis_ledger_events_v3.py`的显式协议分派及DSA原Spec/Task/CHANGELOG。按协议固定注册读适配器，复用有效策略/目录/Provider注册表/不可变凭证/HMAC；校验目标位置与版本、启用/删除/凭证/依赖状态，读前后安全/配置变化拒绝。仅本显式观察协议按配置读取，不使用旧完整事件准入声明；普通事件分派完全保持。共享JSON样例与真实FastAPI鉴权端点测试、旧事件回归、所属语法/关键flake8后停止。

- [x] D3-C2：共享安全失败原因（D3-C后的窄合同增量）。只拥有`market-known-cash-wire-v3.ts`及对应新测试，新增显式研究错误包和标准原因枚举；Provider业务码映射仍留DSA，不接受上游原始正文作为原因。D3-RE错误输出与新HTTP断言同其责任叶同步；旧错误包不变。新错误/交换、旧事件合同定向及Schema类型/构建后停止。
- [x] D3-A1：Server标准能力传输（依赖D3-C/C2/RE）。只拥有新`apps/server/src/integration/dsa/dsa-known-cash-v3.ts`、现有`dsa-data-capability-reader-v3.ts`的显式方法、`dsa.client.ts`既有`dataCapabilities`只读getter的公开可见性、`dsa-v3-protocol.ts`/`DsaError`兼容的可选安全原因透传，以及新`apps/server/test/integration/dsa-known-cash-v3.test.ts`。DsaClient原594行不增加每能力重复facade；复用现有认证、期限、单次请求及解析器，提供强类型安全失败原因。新传输与旧事件/Client回归、Server类型检查后停止。
- [x] D3-A2：通用Market选择（依赖D3-A1）。只拥有新`apps/server/src/market/market-known-cash-selector-v3.ts`及对应测试、必要`scripts/check-boundaries.mjs`。固定有效策略/目录版本，以已保存主备顺序最多尝试两目标；研究观察不使用旧完整事件ready声明，但拒绝凭证/禁用/依赖等物理不可用状态，并由DSA前后校验执行授权。无Provider名单，返回原交换与每目标标准失败原因，不接受未知覆盖为完整事实，不读最新数据以重放。选择/错误/旧选择器回归、必要包级与门禁后停止；不接入Backtest。

- [x] D3-RE-F：直达DSA入口的目标状态校验收尾。只拥有DSA`thesis_ledger_known_cash_v3.py`及其专属测试与原文档。首次真实读取后自审确认Server已跳过禁用/额度状态，但DSA直达入口只核对Provider与目录，未独立校验所选有效目标的状态原因。补上eligible/reason一致性和物理不可用状态拒绝；仅本显式协议接受旧完整覆盖/有效期缺口，不保存旧准入。定向拒绝/旧入口回归、精确编译/flake8后只用正式`sync-code.sh dsa`更新，再对已有一个正例定向复验；不重复四窗口或新增证券，不改用户状态制造负例。

- [x] D3-FP：共享测试样例发布。自审确认新DSA测试直接读取主仓相邻路径，会破坏DSA单仓验证。只拥有DSA发布副本`tests/fixtures/thesis_ledger_known_cash_v3.shared.json`、上述两份新测试的样例读取/安全原因断言、主仓`market-known-cash-wire-v3.test.ts`的发布副本一致性断言及原文档。由主仓原JSON与错误枚举生成副本，不独立发明规则；DSA单仓从自身副本验证，组合工作区检查副本与主仓契约一致。源实现不因发布副本改动；生产JS无变化，不触发主仓部署。

### D3完成证据与停止点

共享方案观察及错误合同：新30项（包括发布副本一致性）通过，D2合同25、旧事件29、旧价格6项先前同次88项通过；契约安全原因增量后新/旧事件58项通过。Schema类型检查/构建通过。通用记录、查询依据、配置/HMAC修订和严格请求/响应绑定已就绪；旧事件入口不接受新字段。

DSA新读取24项、新控制/HTTP46项；最终连同旧事件15、旧HiThink11共96项通过，原mapped-read/控制11项先前同次101项通过且输入未变。D1语义/占位50项在读取叶同次74项通过。首次syntax/flake8仓库入口通过，后续控制/错误/样例收尾精确编译及关键flake8通过。DSA自身发布副本支持单仓测试；主仓30项中实际执行了组合副本/错误枚举一致性断言，没有以缺相邻仓库跳过当前验收。必要币种/身份为显式研究范围/请求绑定，不标成供应商回显或已验证历史身份。

Server新传输8、选择12项与旧Client13、事件9、选择9、多窗口4、D2投影16合计71项通过。类型检查/最终build通过；边界、依赖图、尺寸门禁通过，尺寸保留9条旧告警。受影响Schema包及Server文件的原规则lint通过，新增选择器的物理状态判定、失败整理与编排按职责拆函数，新测试按交换/金额冻结语义分组，最终新文件无复杂度/尺寸警告；未放宽阈值或跳过文件。此前D2全仓分组检查的未变输入不重跑，不声称本轮整仓全量测试通过。

正式更新：在`thesis-ledger-infra`执行`./scripts/sync-code.sh all`（Node24 PATH，目标Server/Worker/DSA），兼容/结构/空间/运行态预检及脚本退出0，随后三个服务healthy，镜像不变；日志`/tmp/history-demand-d3-sync-all.log`。控制收尾只修改DSA，用最小`./scripts/sync-code.sh dsa`，先校验物理目标状态，再收敛标准错误原因；两次脚本均退出0，最终日志`/tmp/history-demand-d3-sync-dsa-reason-final.log`。没有依赖、Schema/migration、Dockerfile或镜像变更；仅容器可写层更新，重建后消失，不称镜像/生产发布完成。

目标Server正常DsaClient能力读取器→已部署DSA鉴权标准接口→HiThink：2026-10-09T15:30:08～15:30:09Z，策略74/applied、目录307004781873887、HiThink config3，四请求均使用保存主源位置0，前后策略/目录一致。510300.SH（2024-01-01～2025-06-30）、510050.SH（2024-11-01～2025-12-31）、510880.SH（2025-01-01～2026-01-31）各2条方案；159516.SZ（2025-01-01～2026-10-09）0条/忽略1占位，全部coverage=false。完整交换、实际源摘要和观察时间在`/tmp/history-demand-d3-target-reading.jsonl`及补充报告；零有效不换源/证明零分红。旧普通事件在同一目标仍422/control-rejected，证据`/tmp/history-demand-d3-legacy-entry.json`。

收尾复验：2026-10-09T15:56:34.149745Z，510300相同窗口仍2条/coverage=false，原响应SHA256为`4584613617b6103f98d0419abfc07f7ad4e03dc40c8c43969ae079f7af204f1c`，前后策略74/目录一致、stderr空；证据`/tmp/history-demand-d3-target-final-reading.jsonl`。供应商真实调用合计5次（首次四证券各一次，控制修正后只补既有一正例），未重复来源调查、扩证券或写配置制造负例。读取验收截止明确为每请求启动后60秒；实际观察时钟保持，不作为用户回测时钟默认。

首次四份实际标准交换离线解析/序列化/规范摘要一致，变更查询身份拒绝、网络0；`/tmp/history-demand-d3-offline-exchange.json`保存四包摘要和源摘要。这是标准响应消费/replay，不是现金快照、结果或旧实际快照重放。D3标准读取闭环完成后停止；无新run/snapshot、持仓记账或页面改变，D4/D5保持开放。

## D4 执行前沿（2026-10-10）

本组保持D4总项开放；AC4的显式研究范围/未知覆盖/准备绑定归D4-C/P，快照与结果归后续责任叶，AC6实际新旧快照重放仍归D5。D2/D3和股票历史证据不重跑。主代理直接执行，共享文件串行。

- [x] D4-C：独立生产准备包合同。只写`packages/schemas/src/backtest-known-cash-preparation-v3.ts`、对应`test/backtest-known-cash-preparation-v3.test.ts`、`src/index.ts`及原Spec/Task。依赖D2输入/D3交换；固定显式请求截止和取得后冻结收据、必需生产身份、交换与冻结输入的精确绑定。只验证独立合同；不新增旧RunConfig/公开入口字段，不部署。定向校验跨证券/区间/规则/记录/来源/控制/时钟差异、缺身份、空占位、微秒越界及旧入口拒绝，再做Schema类型检查/build。合同不满足或需要扩大旧入口时停止并另拆叶。
- [x] D4-P：标准读取到冻结包的纯准备接缝。依赖D4-C，只写`apps/server/src/backtest/backtest-known-cash-preparation-v3.ts`、`test/backtest/backtest-known-cash-preparation-v3.test.ts`、`scripts/check-boundaries.mjs`及原Task/Review。消费注入的通用标准读取端口，取得前固定范围/规则/版本/上限；用真实完成时钟生成收据并复用D2冻结/校验，不解析供应商字段。价格协议由已验证价格准备提供，价格完整性不在这里被取代。失败保留原因，不变成空包；冻结包与准备摘要双校验，无网络离线重放。定向测试→必要Schema/Server类型与build→边界/规模/复杂度门禁。仅独立接缝，无API/UI启用、部署或现金run；消费者变化另拆叶。
- [x] D4-I1：公开选择合同。只写Schema既有`backtest-run-preparation-v3.ts`及专属测试；显式`knownCashResearch`必须选择D2全部假设，搭配原现金时序/原价/固定来源/CN ETF/CNY；原包仍由Server生成，旧选择不默认切换。合同负例及必要构建后推进I2。
- [x] D4-I2：来源取得编排。只写Server新`backtest-known-cash-acquisition-v3.service.ts`、既有纯准备/准备Service/Module和专属测试。价格取得后按同一控制版本读取保存现金顺序，60秒只是显式取得上限，完成时刻冻结；原包保存后进入已有价格/预热/日历预检。仅新模式跳过旧完整公告准备，失败保留具体来源原因。控制/范围差异拒绝；不直写供应商或主备。
D4-F为创建与快照存取责任组，依赖D4-P；不把控制复核、存取与编排合成一叶。当前创建守卫使用只支持bar的`MarketRouteRevisionService`，公开Provider配置Schema只有配置版本；D3观察中的凭证HMAC修订尚无创建前消费接缝。此项是待实现合同，不是凭证失效或用户授权缺口。

- [x] D4-FC：只读控制身份复核共享合同（Ready）。已核对DSA已知服务`_controlled_state`，可复用控制快照而不调用READERS；当前Provider配置公开元数据无HMAC，独立协议补其只读复核。精确写集：`packages/schemas/src/market-known-cash-control-v3.ts`、`test/market-known-cash-control-v3.test.ts`、`fixtures/market-known-cash-control-v3.exchange.json`、`src/index.ts`，以及D3的`market-known-cash-wire-v3.ts`仅导出已有范围校验函数（不改规则），原Spec/Task/Review。复用D3完整请求范围、通用控制身份及安全错误枚举，显式`known-cash-control-v1`/expected身份；绑定目标顺序、独立checkedAt及只读无上游声明，不新增RunConfig字段。定向覆盖身份/顺序/版本/请求响应/旧入口拒绝，再做Schema包级类型/build、边界/精确lint。只交付合同，不以样例证明DSA已执行；合同就绪后推进FD，不部署契约孤立变化。
- [x] D4-FD：DSA只读复核执行面（Ready）。依赖已通过的D4-FC。精确写集为DSA新增`src/services/thesis_ledger_known_cash_state_v3.py`（控制快照及通用安全异常的概念所有者）、`src/services/thesis_ledger_known_cash_control_v3.py`（复核编排）、`tests/test_thesis_ledger_known_cash_control_v3.py`、`tests/fixtures/thesis_ledger_known_cash_control_v3.shared.json`；现有`thesis_ledger_known_cash_v3.py`迁移控制快照调用、`thesis_ledger_hithink_known_cash.py`仅消费通用异常、`api/thesis_ledger_events_v3.py`追加明确协议分支；旧`tests/test_thesis_ledger_known_cash_v3.py`安全原因库存覆盖新增所有者；主仓新控制合同测试核对发布副本一致。原两仓Spec/Task/主Review、DSA CHANGELOG同步。迁移原控制函数而不重复校验器，供应商研究读取不调用。前后状态、预期配置/HMAC、目标序列和权限均校验；配置变化/禁用/不可用/未知处理器/鉴权中途撤回拒绝。共享样例/实际FastAPI及新旧研究读取/旧事件定向回归、精确编译、必要flake8/包级Control检查独立验收。公共准备/快照消费者不启用，正式部署与实际端点核对另列D4-FG，不用本地测试替代。
- [x] D4-FD-T：存量Control目录断言修复。新旧方案定向98项通过后，必要Control组17通过/1失败：`test_v3_route_catalog_is_exact_complete_and_independent_of_policy`固定总量56落后于当前工作区真实68条。只拥有DSA此测试函数及原Task记录；已只读核对原生日线库存为CN38、港美30（包含既有长桥none/qfq、富途三口径及Yahoo有界窗口），不修改任何适配器/来源库存。以独立完整港美期望集合及68总量替代旧总量，原CN精确集合/就绪/唯一性断言保持。该Control组重新通过后收尾，不扩大来源验收或修改业务代码。
- [x] D4-FR：Server标准复核读取端口。依赖D4-FC/FD；精确传输写集在下方执行包固定。沿用DsaDataCapabilityReaderV3鉴权/期限，不增加DsaClient重复facade；严格核对请求响应、预期身份与完整目标顺序，保留安全原因和stale/unauthorized。市场/创建消费者在D4-FB接入，不修改行情路由复核。定向真实传输组件/标准响应拒绝与旧读取回归、Server类型/build和边界门禁；正式只读端点消费归D4-FG。
  - D4-FR执行包（Ready）：只写`apps/server/src/integration/dsa/dsa-known-cash-control-v3.ts`、现有`dsa-data-capability-reader-v3.ts`追加标准能力方法、`apps/server/test/integration/dsa-known-cash-control-v3.test.ts`及原Task/Review。主仓DsaClient已有公开dataCapabilities，保持大文件不增长；正常认证/期限复用，不增加通用网关。严格请求/响应和安全错误映射，非法请求在传输前拒绝；实际控制复核的版本/目标检查由FD负责，不提前创建现金run。
  - D4-FG执行包（Ready，待上述全部门禁退出0）：目标执行面同时修改DSA与Server标准读取器，使用infra目录既有`./scripts/sync-code.sh all`，默认参数、Node24，兼容/结构/空间预检不得绕过；不改infra源码。先只读记录容器/镜像及有效策略/目录，再从目标Server当前编译DsaClient正常能力方法，以D3既有510300标准响应中的范围/身份请求已部署复核接口；只改请求expected配置版本构造configuration_changed负例，不写Provider。保存实际响应、版本/顺序、前后控制一致及客户端安全错误。复核分支代码无供应商调度，配合FD零调用测试；不将其称为现金准备/快照/结果通过。镜像保持、可写层更新边界明示，复核证据后本叶收尾。
- [x] D4-FG：复核能力正式更新及实际只读消费。依赖D4-FD/FR；按实际源码变更选择最小正式入口。只读确认有效配置后，以当前冻结身份作正例、请求中改预期版本作拒绝负例，不改用户状态；核对返回来源/顺序/版本及未请求供应商。与现金Run/快照联验D4-G和D5分开，未完成保留开放。
D4-FA为独立资料存取组，按单一责任串行推进。

- [x] D4-FA1：独立现金资料Artifact编码/校验（Ready）。精确写集`apps/server/src/backtest/backtest-known-cash-snapshot-v3.ts`、`test/backtest/backtest-known-cash-snapshot-v3.test.ts`及原Spec/Task；只消费已验证准备包/只读复核，产生metadata/known-cash-preparation-v1.parquet和knownCash/events-v1.parquet，双向严格核对原包、复核绑定及资料行。不进入旧完整事件包，未知覆盖单独标记，空记录保留占位；真实LocalArtifactStore Parquet读写、篡改/预期摘要/零网络定向验证。暂不接运行入口。
- [x] D4-FA2：Server原始准备包的不可变有界缓存（Ready，依赖P）。精确写集`apps/server/src/backtest/backtest-known-cash-preparation.repository.ts`、专属测试及原Task。复用既有BACKTEST_SNAPSHOT_ROOT、规范化摘要和独立包校验；按hash精确路径独占写原包，重复相同内容幂等，差异/缺包/非法hash拒绝。只有正常读取后保存，创建按原包校验客户端提交，不能靠自校验授信；无DB/schema/镜像依赖变更，Nest注册归FB。
- [x] D4-FA3：运行配置/快照资料引用合同（Ready）。精确写集`packages/schemas/src/backtest-known-cash-binding-v3.ts`、`backtest-run.ts`、`backtest-run-preparation-v3.ts`（仅omit原包字段）、`backtest-snapshot-manifest-v3.ts`及专属绑定测试/index/原Task。RunConfig兼容optional knownCashPreparation绑定独立原包，范围/证券/币种/固定截止/价格协议全部一致，Snapshot引用known-cash-snapshot-v1及prepared hash/coverage=false。用户原始准备意图不得注入原包；新公开选择待I。旧无字段协议保持，Schema定向+类型/build；不得在消费者齐备前部署。


D4-FB为创建/冻结接入组，拆为规划、受信原包/当前控制守卫、快照编排三叶。

- [x] D4-FB1：已知协议的依赖规划（Ready）。只写`backtest-dependency-events.ts`、专属定向测试及原Task；只有严格RunConfig已绑定knownCashPreparation时不请求旧完整raw-accounting现金，策略公司行动信号仍保留原完整依赖并明确拒绝本模式。原covers/completeCoverageRequired/PIT及普通窗口保持。定向验证新旧分支。
- [x] D4-FB2：Server受信原包与当前控制守卫。依赖FA2/3和FR，只写新增`backtest-known-cash-guard-v3.service.ts`、创建守卫接入、BacktestModule注册（Worker只重放已完成快照，不需要当前状态端口）及专属测试/边界门禁；正常DSA只读能力核对Server原包、精确scope/版本/源身份，跳过旧公告前置仅对已知协议。注册模块写集执行前核对，不改业务异步生命周期。
- [x] D4-FB3：快照Builder/存取完整性接入（Ready）。精确写集`backtest-snapshot-builder.ts`、`backtest-snapshot-v3-builder.ts`、`backtest-snapshot-v3-artifact-writer.ts`、`backtest-snapshot-v3-completeness.ts`/`-checks.ts`、`backtest-snapshot-v3-input-plan.ts`及新现金Snapshot集成测试/原Task；FA1 codec追加类型化ref/资料匹配接缝。只由Server原包守卫生成当前复核收据，两个独立Artifact/资料版本/来源修订进manifest与完整性检查；原价格/日历/Artifact集合及beforeFinalize围栏保持，finalize前再次当前控制核对。Worker只重放，原快照不改。定向验证新快照冻结/重放及当前控制变化拒绝，必要Server类型/build；消费者全部就绪后再正式同步。
D4-W为冻结消费组，先补登记资格接缝，再接Worker投影。

- [x] D4-WE：登记日已结算数量的可选领域接缝（Ready）。只读确认原Ledger在除息开盘乘当时settledQuantity，开盘T+1结算先于公司行动；因此登记日尚未结算的新买入可能在除息开盘误获资格，与D2明确规则不符。精确写集Domain `simulation-cash-dividend-entitlement.ts`、`simulation-ledger.ts`（纯金额/资格解析提取，超尺寸文件不增长）、`backtest-corporate-actions.ts`、`backtest-engine.ts`及新定向资格测试。新增optional eligibleQuantity及领域回调，仅新已知协议提供登记日冻结数量；旧调用默认数量/时序保持，不重建账本或修改SourceFact原金额。负数/非法资格拒绝，已卖出但有登记资格仍获现金，normalized不重复分红。定向领域测试/类型/build后推进W1。
- [x] D4-W1：Worker只读冻结资料的现金投影（Ready）。精确写集`backtest-known-cash-accounting-v3.ts`、`backtest-known-cash-entitlement-v3.ts`、`backtest-v2-execution-exchange.ts`和专属冻结投影/资格测试；已知记录从两个独立Artifact重校验后复用D2投影，原完整事实只作原信号/原账本。仅已知模式提供领域资格回调，按冻结日线收盘决策捕获登记日settledQuantity（不依赖用户估值时间），窗口前且初始只有现金为0，缺窗口内登记记录明确拒绝。旧大Exchange函数提取原accounting拼装后净缩小，禁止加最新来源调用。定向真实本地Snapshot/Runner与资格/缺日历开盘负例后必要包级检查，结果披露归R。

D4-R为结果消费组，分共享合同/结果投影、诊断/UI两面。

- [x] D4-R1：已知现金结果合同与Ledger投影（Ready）。只写Schema新增`backtest-known-cash-disclosure-v3.ts`/index/result可选字段，Server新增`backtest-known-cash-disclosure-v3.ts`及Runner结果选择和定向测试。保留完整政策、来源/身份/CNY依据、未知覆盖、原单位/进度、原准备摘要及资格/税前现金。paid状态必须叫simulated-paid，仅为方案计划时点模拟；资格取新领域显式eligibleQuantity，不取除息日新增已结算持仓。旧cashDividendDisclosure/sourceDocuments保留，结果checksum包括新披露，基准净收益/超额仍不可用。
- [x] D4-R2：诊断/导出一致性。依赖R1，只写Desktop新`backtest-known-cash-disclosure.model.ts`、既有`strategy-backtest-diagnostics.model.ts`及专属测试。严格解析结果披露后保留同一政策、原单位/来源/控制、资格、金额和模拟状态；安全文本复用现有脱敏函数。结果页/UI由U拥有，旧结果保持，离线不访问最新来源。

- [x] D4-U1：UI显式选择。依赖I/R；已读取shadcn、项目配置和锁定组件文档。只写新`BacktestKnownCashResearchChoice.tsx`、既有`BacktestPricePreparation.tsx`及专属测试。默认旧完整模式；仅CN ETF/CNY原价固定来源显示选择，以一项明确选择冻结D2全部列明假设。沿用TanStack请求和已取得后冻结，配置变更使准备失效，显示独立现金实际来源/数量及未知覆盖；不保存路由/凭证。
- [x] D4-U2：结果页披露。只写新`BacktestKnownCashDividendDisclosure.tsx`、既有`BacktestPriceDisclosure.tsx`及专属测试；同一结果显示原金额单位/日期、登记资格/应收/模拟计划发放、来源与未知覆盖。旧无字段不显示新协议，旧公告披露保持；基准净收益/超额不可用说明保持。真实页面/导出归D5，不由静态渲染替代。
- [x] D4-G：正式更新及准备/创建/Worker/页面有界联验。依赖上述消费者全部就绪，依实际变更选择最小`sync-code.sh [all|dsa|thesis-ledger]`目标，兼容预检通过才执行；失败则按既有规则选择`update.sh`，不绕过。与D5真实持仓/结果及新旧实际快照重放分开记录。

### D4-FC/FD/FR 本地证据（2026-10-10）

共享只读复核合同新增32项（含发布副本一致性/未知时钟拒绝）；Schema全包85文件947项、类型检查/build通过。只导出D3既有范围校验函数供复核复用，原范围规则保持；新请求/响应绑定完整研究范围、预期配置/HMAC及保存目标序列，独立当前checkedAt不替代历史截止，旧资料请求不接受复核载荷。公开现金准备入口和RunConfig仍未新增选择。

DSA将原控制快照及通用安全异常放回明确的已知现金状态所有者，资料读取/复核共享；控制服务校验预期配置/HMAC、前后控制及权限，完整目标序列连续且唯一，处理器存在但不调度供应商。新28项与旧资料/供应商研究70项共98通过；真实FastAPI正例、配置差异安全422、前后撤权401与旧入口分派通过，测试中供应商调度替换为必失败断言而正例仍verified，调用0。旧事件/Control组初次17通过1失败，原因是已存在并行行情库存68与测试写死56不一致；D4-FD-T只修测试的独立港美精确期望集合，CN/就绪断言及适配器全部保留，最终18项通过。没有扩大源码或来源资格。

Server正常DsaClient.dataCapabilities追加knownCashControl，经同一认证/期限/一次传输；大DsaClient未增长。新14项及旧观察8项共22通过，绑定/身份/顺序/源资料错配拒绝，safe reason与stale/unauthorized保持，非法输入在HTTP前拒绝，原始上游正文不透传。Server类型检查/build通过；DSA精确Python编译、ci_gate.sh flake8及目录测试增量编译/critical lint通过。主仓精确ESLint无警告，边界/规模/全仓复杂度门禁通过（8组/1932文件，新文件无警告；存量规模警告保留）。

日志分别为`/tmp/history-demand-d4fc-{tests,package-tests,final-type,build-final}.log`、`/tmp/history-demand-d4fd-{migration-tests,tests,control-regression,control-regression-final,flake8}.log`、`/tmp/history-demand-d4fr-{tests,type,build}.log`和`/tmp/history-demand-d4f-{lint,boundaries,size,guardrails}.log`。未执行无关Server/DSA全量门禁、来源查询或取消任务。D4-FC/FD/FR仅本地实施验收完成，正式复核能力消费归FG；现金快照/Worker/公开入口/结果仍开放。

### D4-FG 正式更新与实际复核证据（2026-10-10）

执行目录`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，正式入口`./scripts/sync-code.sh all`，Node24、默认非敏感参数，目标包含DSA/Server/Worker。空间/并发、依赖兼容及数据库结构预检通过，脚本退出0，三服务健康；未更新镜像/数据库结构/外部卷。DSA镜像`sha256:0d92aaa1dd21d708d170fcee5270859c5f143f29413ca66fb58d81f39c45a0c9`、Server/Worker镜像`sha256:2878d06a265a68ec8eb8e0079c82d4fa1e126a5dc4fdb06fa8226a5868f72afb`保持；仅容器可写层同步，重建后不保留。本次入口未修改infra源码；完整日志`/tmp/history-demand-d4fg-sync-all.log`。

2026-10-09T19:21:56.518254Z（北京时间2026-10-10），目标Server当前编译DsaClient.dataCapabilities.knownCashControl经已部署鉴权market/events实际返回verified/readOnly=true/upstreamRead=false。510300原D3窗口2024-01-01～2025-06-30、原读取截止2026-10-09T15:57:33.855Z不改，当前复核checkedAt独立；使用D3已取得控制身份并独立核对当前版本，没有读取最新分红。保存顺序为hithink/fund-corporate-actions-dividends位置0、official-dividends/cn-etf-cash-notices位置1；desired/effective74、catalog307004781873887、配置3与原观察身份/HMAC相符。

同一次有界验收仅将请求expected配置版本改为4，实际得到客户端stale-revision/sourceReason=configuration_changed；没有改用户配置。前后有效策略/顺序/目录一致，stderr空；`/tmp/history-demand-d4fg-target-control.{mjs,jsonl,stderr}`保存探针及实际标准响应/拒绝证据。复核执行代码只作控制快照，两次捕获无READERS调度，配合FD强制零供应商调用的FastAPI测试；不将响应布尔声明单独作为实际分红读取证据。

D4-FG复核能力真实消费完成，无新现金run/snapshot、资料查询、账本、结果页或旧快照重放。D4-FA/FB、W/I/R/U/G和D5仍开放。旧完整事件/准入、用户主备/凭证保持，不启用未就绪公开选择。

### D4-C/P 完成证据与停止点

2026-10-10：独立`known-cash-acquisition-v1`收据及`known-cash-preparation-v1`生产准备包已实现；价格协议、标准交换、范围/选择/控制身份、原始来源、未知覆盖/占位及内外摘要严格绑定。新生产身份必需，D2旧本地可选元数据不变。价格与时钟/范围在来源调用前校验；读取端口参数复制保护原请求，端口偷换范围拒绝；来源错误保留原因，不转空包。请求截止与实际完成/上限独立，微秒未来来源、倒退、超时以及超过60秒上限拒绝。尚未新增公共选择/RunConfig字段，旧准备入口有效输入仍通过、附加新选择明确拒绝。

定向：Schema新增22项，D2/标准交换合计77项首轮通过；原准备合同与新合同33项通过，最后仅加强缺生产身份断言（保留有效标准响应、只删除冻结输入字段）后22项再通过。Server新增13项，旧准备/已捕获股票窗口回归合计36项通过；D2冻结/应收投影16项在首次同次26项中通过。Schema必要包级84文件/915项通过。Schema类型检查/build、Server最终类型检查/build通过；精确ESLint无警告，边界门禁、规模门禁（9个既有大文件警告）及仓库复杂度门禁（8组/1928文件）退出0，新文件无复杂度警告。先前精确lint发现一次未使用解构目标，改为删除校验用临时字段后复验通过，没有放宽规则。

命令输入为上述D4四份新源码/测试及共享导出/边界规则；Node24、原包依赖不变。日志`/tmp/history-demand-d4-{schema-package-tests,schema-binding-final,server-final-tests,server-final-typecheck,server-final-build,final-lint,boundaries,size,guardrails}.log`保留结果。不跑Server无关全量测试、Docker镜像或旧来源探针。

断网集成只复用D3四份已取得标准响应（510300 2024-01-01～2025-06-30、510050 2024-11-01～2025-12-31、510880 2025-01-01～2026-01-31、159516 2025-01-01～2026-10-09）。经当前编译的准备接缝保留实际2/2/2/0方案、原响应摘要/时钟/查询与配置身份、未知覆盖/占位，序列化后内外摘要验证一致，篡改查询身份拒绝。HTTP/HTTPS/socket/fetch禁止，网络0；`/tmp/history-demand-d4-offline-preparation.{mjs,json}`为探针和证据。价格协议来自显式测试输入，仅证明响应准备/绑定，不证明真实行情准备、现金快照、持仓或生产回测；没有run/snapshot。

D4-C/P在各自本地停止点收尾。D4-F当前状态复核、Artifact/Builder、D4-W/I/R/U/G及D5仍开放；不把新导出、断网校验或构建当作部署/实际消费。源码未进入任何服务入口，部署本次不适用；DSA/infra源码、主备/凭证/准入均未修改。

## 最终一致性 Review

本节保留 D3、D4 各阶段的历史评审，包含当时尚未接通的接缝与下一步；当前 D1～D5 已按[最终有界验收](#d-line-closeout)完成，不执行这些历史接续指令。摘牌正向消费继续由 L3/L3-V 保留。

### D3 历史评审


本轮评审D3共享合同、DSA规范化/控制/HTTP、Server传输/通用选择、发布样例及正式标准读取。依赖D1/D2已就绪，按责任叶串行修改共享文件；供应商字段/进度解释留DSA，Server无新增证券或供应商业务特判。AC1换证券/跨月的方案读取、AC4单位/日期/占位/未知覆盖与显式研究依据、AC6标准响应离线一致性在D3范围通过；现金资格/账本、新快照、产品结果及实际旧快照重放仍属D4/D5，没有删去或转移。

结论：D3标准读取实施及目标有界读取通过。首次四证券及最后单正例均由目标Server正常能力组件消费已部署标准接口，再取得真实HiThink响应；没有以样例/健康检查冒充取得。CNY/身份依据、未知覆盖和实际支付缺口明示；旧准入仍not_admitted/expired，旧事件入口拒绝保持。D4公开选择/准备/创建/冻结/Worker/结果未接入，D5现金生产回测未执行。三仓在途修改保留，infra只执行已有脚本、无源码变化；无子代理、提交、推送、配置保存或准入写入。

上一阶段D2卫生证据：三份主题文档21个相对链接有效，主仓`git diff --check`及5份新文件空白检查通过；当时状态主仓1016→1021、DSA224、infra75，原状态条目无移除。本轮D3最终核对为五份原主题文档24个相对链接有效，主仓/DSA `git diff --check`通过；主仓1021→1030（8份声明的新源码/测试/样例及1份此前干净的协议文件变为修改），DSA224→230（5份声明的新文件及原API变为修改），infra75条不变，三个基线状态集合无移除。未执行Git清理、覆盖、提交或推送。

整项history-data-on-demand未完成：L3摘牌正例仍待用户后续统一适配处理，D4/D5尚无公开现金准备/消费、新快照回测与结果/旧实际快照重放证据；完整分红覆盖、实际到账、币种回显/历史身份及严格PIT仍未取得。供应商数字进度直接定义缺口保留；本次只将其按用户约定用于方案观察。下一阶段D4，先固定其单一职责叶与公开/冻结版本合同；当前实现已收尾，无未结束测试或部署进程。

### D4-C/P 历史一致性评审（2026-10-10）

结论：D4-C/P本地实施验收通过；D4-FC进入有界合同盘点，尚未取得运行态完成证据。D4其余责任叶与D5保持开放，不作整项完成或部署通过结论。

独立共享准备合同与Server纯接缝已按两个责任叶实施和本地验收，原Spec/Task/启动Prompt同步；生产来源元数据与时钟不被本地缺省/未来读取上限替代。原窗口、价格来源、现金来源、单位及未知覆盖保持，旧公共入口仍拒绝未就绪选择。通用接缝不import市场/集成/Provider，边界门禁已固化；没有供应商枚举/证券业务特判。

AC4准备范围/假设/未知覆盖/绑定与AC6独立包断网一致性在本地范围通过；实际运行时和现金记账验收没有转移。D4总项、D5与L3摘牌正例仍开放；下一责任前沿D4-FC，控制身份复核及存取/编排分叶，之后再接Worker和公共选择。未提交/推送/清理三仓；本轮无部署、配置保存、凭证读取/写入或供应商新调用。

卫生核对：三份原主题文档21个相对链接有效，主仓`git diff --check`及四份新文件空白检查通过。主仓1030→1034（仅四份声明的新源码/测试），DSA230、infra75条不变；三个基线状态集合无条目移除，原并行修改保留。相关检查/构建均已退出0，无未结束部署进程。

<a id="d4-fcfdfrfg-当前一致性评审2026-10-10"></a>
### D4-FC/FD/FR/FG 历史一致性评审（2026-10-10）

结论：共享控制合同、DSA只读执行面、Server正常传输和正式实际控制消费在声明范围通过。来源映射/凭证HMAC由DSA控制状态所有者取得，主仓无新增供应商或证券分支。旧观察读取复用迁移后的控制快照，定向回归有效；唯一扩大Control测试的失败由存量精确库存总量陈旧引起，仅按独立完整期望集合修测试，来源库存与并行代码未动。合同、发布副本、API分派、异常语义和客户端一致，未来复核不变成资料/覆盖/准入。

AC4控制身份/顺序/版本围栏在本地和目标实际复核范围通过；单证券正例及请求版本差异负例不代表任意Provider、真实现金准备/持仓/结果或快照重放。D4总项与D5、L3摘牌正例继续开放。下一责任前沿D4-FA，公共准备字段仍未启用；创建Guard/快照绑定待FB，Worker/结果/UI按已有责任叶推进。正式同步仅更新可写层，未声称镜像发布。双语README未涉及首页行为，无需同步；三仓修改保持，无子代理、提交、推送、清理或用户状态保存。

最终卫生核对：五份两仓原主题文档24个相对链接有效，主仓/DSA git diff --check及七份新源码/测试空白检查通过。主仓1034→1039（五份声明的新源码/测试/样例），DSA230→234（四份声明的新文件），infra75条不变，三个基线状态集合无条目移除。测试、构建、门禁和正式同步均已退出0，无未结束部署/验证进程；保留三仓原并行修改，未提交、推送或清理。

用户2026-10-10明确要求连续完成D1～D5；已有D1～D3及D4已通过叶保持，后续叶完成后自主推进依赖前沿，不以叶收尾结束整个执行。D4消费者全部就绪后最小正式同步一次，D5分真实回测/持仓与应收/计划发放、页面/诊断导出、新旧实际快照离线重放各验收叶，失败按当前能力保留具体缺口并继续修复可实施项。

FA1/FA2定向9项通过：真实Parquet矩形列先暴露混合行缺列转null差异，编码明确固定列并再验证通过；没有跳过严格行匹配。不可变Server缓存原包按hash原子link发布，同包并发幂等，损坏/缺包拒绝。新增可复用测试输入拥有`test/backtest/known-cash-test-fixtures.ts`，无真实来源或部署。后续连续推进FA3/FB/W/I/R/U/G/D5。

FB2实际核对：冻结发生在Server创建阶段，BacktestProcessorModule只拥有Runner，无DSA/SnapshotBuilder；因此只在BacktestModule注册受信缓存与守卫，保持Worker模块的离线边界。新已知RunConfig必须同时携带冻结窗口/价格绑定，防止走旧partial快照支路。公开准备消费者待I，当前不部署。

FB3定向快照冻结/离线重放与finalize前控制变化拒绝2项通过；fixture先后暴露必须按策略实际预热窗口取得、CN事实仍需逐日可交易性证据，已补合法固定输入后通过，未放宽生产门禁。FA3与FB1/2定向通过，领域登记资格问题按WE独立修正后再跑完整Worker验收。

I2职责收敛：既有准备函数已超过函数尺寸阈值，新增取得/冻结职责不能继续内嵌。增加精确写集`backtest-run-preparation-protocol-v3.ts`，拥有实际价格协议、配置组装、注入现金取得端口的稳定输入、完成截止与观察校验；原准备只调用并消费结果，供应商/控制编排仍留独立AcquisitionService。FB3同样将独立资料的重复围栏/版本/manifest引用组装放回资料所有者`backtest-known-cash-snapshot-v3.ts`，Builder只按已有取得/写入/finalize时序调用，不增加大函数职责。R1结果额外校验冻结范围/身份/观察与税前数量金额乘积，负例归专属披露测试。

### D5连续验收执行包

- [x] D5-WC：周一起点预热取数兼容合同。实际2025-06-16起点被拒绝，确认价格计划从06-14周六开始，未请求06-13真实参考行情；缺口是取数计划，不宣称供应商无数据。只写Schema RunConfig/准备意图omit、专属测试和原Spec/Task。新增Server拥有的`frozenPriceWarmupPolicy=cash-reference-calendar-buffer-v1`，只用于已绑定已知现金研究，新准备冻结7个自然日缓冲；未标记旧RunConfig/快照维持原规划。原策略所需交易日数、请求区间、日历/价格完整性不变。
- [x] D5-WP：版本化价格预热规划。依赖WC，只写Server既有`backtest-dependency-price.ts`、准备编排/协议组装和定向规划/准备/快照测试；按显式新标记取较早价格窗并在新RunConfig冻结，Snapshot/Guard按同一版本重算。旧已保存现金快照断网重放不得改日期/字段，长假仍不足明确拒绝。最小正式同步后，原失败周一窗口及登记日买入T+1真实验收；不通过降低数量或跳过校验。

首次真实510300窗口2025-05-15～2025-07-04，正常准备已取得腾讯none价格及HiThink主源方案（0.88元/10份，2025-06-17登记/06-18除息/06-27计划发放）；完整预检ready，但RunConfig摘要与准备戳不一致，未创建Run。确认新配置组装把可选lifecyclePreparation保留为undefined，JSON传输删除该键，规范摘要随之改变。只修I2既有协议组装、补真实JSON往返摘要断言；不改规范hash全局算法/旧快照、不跳过围栏，不拿取得成功勾选D5。保留首次`/tmp/history-demand-d5-510300-paid.{json,log}`证据，修复后最小正式同步并新验收。

- [x] D5-E：正常HTTP准备/创建及Worker。只新增`scripts/known-cash-research-target.mjs`（证券/日期/持有或有界退出策略由参数选择，默认只出请求，显式执行才创建正常研究策略和Run）及原Task/Review。不保存路由、准入、凭证或手工快照。至少510300/510050跨月含事件、期末应收、支付日才买入及159516全空占位；原价/复权、缺假设、版本/原包篡改负例分别记录。真实Source、窗口、Run/snapshot/result与现金语义逐项冻结。
- [x] D5-L：独立账本核对。读取上述实际新快照/结果，只新增`scripts/known-cash-research-independent.py`；用独立Decimal核对登记日收盘已结算数量、税前每份换算、应收/计划发放及逐日权益，包含除息后卖出仍持有应收/发放、支付日买入不获资格。不调用供应商或改冻结数据。
- [x] D5-U：内置浏览器正常页面与实际诊断下载。主代理操作已有页面，核对准备显式选择、来源/覆盖/单位/模拟状态和基准不可用，下载JSON与同一结果比较；只写证据，不修改UI绕过产品操作。
- [x] D5-O：新旧实际快照断网重放。只读执行正常SnapshotStore/Runner，禁用最新来源访问，匹配已保存结果checksum；已知新快照及旧现金/股票生命周期/普通研究至少各一，差异不改写旧快照。三仓在途变化核对、文档/最终统一验收后再勾选D4/D5总项。
<a id="d-line-closeout"></a>
## D4/D5 最终有界验收与统一评审（2026-10-10）

结论：D1～D5在本次明确研究范围内完成。D4新增正常公开选择、实际取得/不可变Server原包、价格与现金独立来源绑定、创建/冻结三道当前控制围栏、独立Parquet、登记日已结算资格、Worker冻结投影、完整结果及诊断/UI；旧完整事件覆盖函数与策略公司行动信号要求保持。字段自洽重算不能授信；未取得、不支持及未知继续区分，复权现金叠加拒绝。股票日期/状态接缝复用，未恢复旧全历史/PIT/M32/指定资产追补。

本地验证：独立Artifact/缓存9项、绑定19项、依赖/守卫3项、快照/控制变化2项、Domain新增与旧现金8项、正常Runner/资格及新旧缓冲版本3项、生产取得编排1项、准备/旧入口19项分别通过；中间组合Server69项含原完整快照回归，职责提取后28项通过。新增缓冲规划及准备/快照组24项、Schema准备/披露31项（披露最终9项，坏十进制安全拒绝）、最后准备19项通过。Schema必要包级最终87文件964项，Desktop最后22项；Schema/Domain/Server/客户端所需类型/build通过。静态图边界/依赖/尺寸及复杂度门禁通过：第一次全组在Server出现5个新增lint错误，修复后受影响59文件严格lint及相同参数6个余组续跑通过，未重跑未变的Desktop/mobile；缓冲后精确lint、边界/规模再通过。保留9个旧尺寸告警，未放宽阈值/增加ignore；670行Ledger未增长，大准备/Builder新增职责已回归各自所有者。

正式更新目录`thesis-ledger-infra`，三次最小`./scripts/sync-code.sh thesis-ledger`：初次D4消费者、JSON往返修复、最后Schema坏金额拒绝/版本化预热。Node24、默认非敏感参数；每次兼容/结构/空间/运行态预检及脚本退出0。Server/Worker镜像始终`sha256:2878d06a265a68ec8eb8e0079c82d4fa1e126a5dc4fdb06fa8226a5868f72afb`，DSA未重启/改代码，最终服务健康；没有Schema/migration、依赖或数据库/卷变化。只更新可写层，未声称镜像或正式生产发布。日志`/tmp/history-demand-d4g-sync-thesis-ledger.log`、`...-d5-json-roundtrip-sync.log`、`...-d5-warmup-sync.log`。

真实消费与独立验收详见[原补充核实报告末尾](../reviews/2026-10-09-history-data-on-demand-bounded-followup.md)：七个真实新Run包含两证券跨月、期末应收、除息后卖出、支付日才买、全空占位及周一/登记日T+1；价格腾讯none、现金HiThink主源，控制74/配置3，没有换主备。七窗184个实际权益点、金额/资格/应收/结算现金与期末权益独立Decimal全部匹配；不是用生产投影函数返回期望值。六个早期本任务未标记现金快照和新版本快照均当前代码断网重放不访问最新来源，保存checksum一致；旧公告现金/股票/跨上市/普通窗口实际旧结果一致，快照未回填。新Snapshot/RunID及实际来源摘要在报告表、`/tmp/history-demand-d5-*-{replay,json}`证据记录，不以健康或fixture称生产通过。

实际浏览器：新结果显示源、未知覆盖、原每10份金额/每份金额、四日期、登记资格、税前现金/按计划模拟发放、现金基准净收益/超额不可用；点击下载的真实JSON与同一完整结果披露、Run和checksum严格一致。前端正常再次运行默认完整事件，显式选新协议后真实准备/完整预检及创建按钮就绪；最终缓冲版本周一窗口再次从前端取得成功。草稿取消，没有额外创建UI任务。下载首次安全自动审批超时，按工具允许重试及正常按钮完成，不绕过安全控制、不将超时称为不安全。

实际拒绝：复权、缺假设、严格PIT HTTP400；预算0返回blocked；客户端篡改忽略数后重新计算内外摘要及配置checksum仍409/PREPARATION_STALE；来源volumeBasis=unknown的成交量策略在快照规则门禁终态拒绝，未伪造original/转换证明，该单位差异留后续适配。首次undefined往返摘要问题、周一计划遗漏周五预热、独立账本捕获分集合问题各有失败证据与修复后的验证；没有删除失败历史或降低原所需交易日数。

能力边界：供应商直接枚举未取得，继续使用用户版本的“实施方案已公布”；完整历史覆盖、实际支付/税费、历史身份/首次可见性及严格PIT未验证。事件信号、拆分及现金基准不在该协议内。未知覆盖保留，零行不证明零分红；明确不将七窗成功称任意证券/时间/供应商全覆盖。L3摘牌真实消费、ETF公告跨管理人与精确涨跌停仍按各自开放项推进，本轮不阻塞D交付。

三仓最终盘点：主仓基线1039→1072、DSA234→234、infra75→75，基线脏路径缺失0；本轮新增主仓33个源码/测试/脚本，DSA/infra在途修改保留。无子代理、提交、推送、清理，未保存用户配置/凭证/准入。原Spec/Task/交接Prompt增量更新，未改写旧证据。最终文档、diff与证据关联收尾检查后完成本次D线交付。

最后收尾：D1～D5总项和D4/D5全部实现/部署/验收叶均有证据后勾选，三份原文档相对链接及git diff --check通过；最终三仓脏路径数量1072/234/75、基线缺失0。前端最新缓冲版本周一窗口再次真实准备/完整预检通过（冻结2026/10/10 15:01:56），草稿已正常取消，新Run页面保留；实际截图`/tmp/history-demand-d5-final-cash-disclosure.jpg`和`...-cash-entitlement.jpg`记录未知覆盖/独立来源及登记资格0。无未结束的测试/部署/回测进程，本次D线已收尾，开放能力按上文边界保留。
