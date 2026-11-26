# 历史执行接入部署与真实资料核对

## 范围与结论

用户要求完成剩余四项：真实资料准入、部署、复用决策业务验收及新比赛追平到实时。本次沿用原模型、参数和历史记录；再次截断立即停止模型调用。四项结果由[活动任务](../tasks/2026-11-12-arena-replay-live.md)统一持有，不能用部署或受控测试代替真实成交与追平。

## 正式部署

- 目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。
- 先执行 `node scripts/infra.mjs locked -- node /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/scripts/local-runtime/arena-maintenance-queue.mjs pause /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/arena-execution-deploy-20261116/queue-owner.json`；退出 0，暂停前无在途、等待或暂停任务，不取消任何调用。
- 正式入口：`./scripts/sync-code.sh all`，通过 `rtk proxy` 执行，退出 0。目标包括 DSA、Server 及 Worker；workspace 依赖与 Nest 构建通过，三服务健康。脚本确认镜像 ID 保持不变，没有数据库结构或外部卷变更；本次为容器可写层更新。
- 独立只读核对：Server／Worker 三份关键产物与宿主本次构建逐字节摘要一致；DSA 四份关键源码与宿主一致，目标 registry 已出现独立历史执行能力。核对后仍须执行原决策运行态验收及归属队列恢复。

| 产物 | 两个应用容器共同 SHA256 |
| --- | --- |
| `market/market-arena-history-source.js` | `34f1e8891f8e00ae7225278c79d197004c12c63879be53e10658722bac655dba` |
| `market/market-arena-replay-reader.js` | `1d6de4a8b0ff75171e04e6bd94c69757a76b6b687e54b09f2c0de7c96092eaf9` |
| `integration/dsa/dsa-historical-execution.js` | `17c4ff50a13f649d4029e4b37b93b9b3f46206b65f80d71ab411538159e262ec` |

| DSA 文件 | SHA256 |
| --- | --- |
| `src/services/thesis_ledger_historical_execution.py` | `95ed04f395264532fa48ef69f0295355c738ec4a2c3bc3e3b1b40b0be8466f9b` |
| `data_provider/thesis_ledger_sources/historical_execution.py` | `a4f4ec96cb8f25bfb192c928aa19b62cdce4d37ff2d0ca2e384e421848ddf1d0` |
| `api/thesis_ledger_arena_history.py` | `c8747ad33096183b649bb9cbc4b804ec16088dc7d02c8d24a83ce66cc535151c` |
| `src/services/thesis_ledger_capability_sources.py` | `be7c7050af9d0c267b14f5eb6e5a6069cf4ee372c2cf2fdd7ef522a8f11eb478` |

## 当前真实来源覆盖

只读检查目标 DSA 的有效政策修订 `200/applied`、实际 registry 及归档目录：

| 来源 | 已有能力与结果 | 本轮不能据此证明的内容 |
| --- | --- | --- |
| 富途 | ETF 不复权历史分钟 1、5、15、30、60 分钟及日线已启用且 eligible | registry 未接入 ETF 历史盘中状态或完整执行上下文；价格不是停复牌证据 |
| Akshare／腾讯／HiThink | 当前报价、历史价格或参考资料 | 对应 registry 没有 ETF 历史盘中执行能力，不把当前快照回填历史 |
| `official-states`／本地状态材料 | CN 股票日状态及价格规则 | 不覆盖 ETF，也不能把日终状态投影为当天盘中状态 |
| `official-rules`／本地收费材料 | ETF 经手费材料 `510300.SH`，2023-08-28 至 2023-08-29 | 不覆盖 `588000.SH`、2026-11-10，且材料明确不是完整费用账单 |
| `historical-execution-archive/qualified-cn-execution` | 新能力已部署，股票／ETF 独立准入 | 生产 `index.json` 不存在；来源默认关闭，无目标证券／时点原文，不能启用或准入空归档 |

本轮没有请求 Tushare 重试、切换账户、扩展旧资料覆盖或导入人工测试费用。

## 官方资料调查

上交所[2026 年交易规则发布页](https://www.sse.com.cn/lawandrules/sselawsrules2025/fund/trading/c/c_20260424_10817739.shtml)明确自 2026-07-06 施行，并另列暂缓实施条文；[ETF 业务实施细则](https://www.sse.com.cn/lawandrules/sselawsrules2025/fund/trading/c/c_20250606_10781071.shtml)为现行有效。上交所[收费标准](https://www.sse.com.cn/lawandrules/sselawsrules2025/charge/c/c_20250610_10781461.shtml)可定位 ETF 竞价经手费条款，但单项规则不证明完整收费覆盖。

查到上交所[基金停复牌公告入口](https://www.sse.com.cn/disclosure/dealinstruc/suspension/fund/)，页面脚本配置 `fund_14527` 支持代码、关键字与日期范围。目标容器的一次后续 HTTPS 读取在 15 秒 TLS 握手边界超时，保留该失败；随后宿主携带正常浏览器请求头读取页面脚本及查询接口成功，不能把首次超时描述为当前接口持续不可达。

实际调用 `https://query.sse.com.cn/sseQuery/commonSoaQuery.do`，`sqlId=SSE_PL_JYTS_TFPXX_JJ`、`secCode=588000`、`startDate=19901219`、`endDate=20261110`，分页上限 25。响应 HTTP 200、482 字节，SHA256 为 `087735ac94e1b965c175ba5fb3af737546beb399219342c3a78cd40fd9d884a3`，`result=[]`、`pageHelp.total=0`、错误数组为空。这只证明该精确查询返回空结果；尚无保留期限、查询完整性或盘中即时停复牌时刻证据，不能用它生成“正常交易”归档。

同一官方脚本的盘中公告使用 `https://query.sse.com.cn/commonSoaQuery.do`、`sqlId=SSE_PZLSTP_ZW`、`tpType=1,3`，实际 HTTP 200、1789 字节、SHA256 为 `663f3fa45a3eedbf446c136bbbe7a7b94f5280063ebc2029a070211e5c6b91dc`；仅返回 2026-11-16 一条可转债公告，字段为 `tpType/publishDate/issueNum/title/content`。脚本没有日期或基金查询参数，不能把当前股票／债券盘中公告当成 588000 的历史状态接口。本轮没有扩展这些接口的未声明参数或把空结果准入生产。

富途[快照文档](https://openapi.futunn.com/futu-api-doc/quote/get-market-snapshot.html)包含当前停牌及状态字段；这不是历史时点状态接口。上交所 LDDS 历史参考文件规范可以提供后续采购／归档调查方向，但本轮未取得相应原文数据，不宣称已接入。

因此，`588000.SH` 在北京时间 2026-11-10 13:01 的合格盘中状态、精确价格限制及完整结算／收费证据仍缺失。下一项真实业务验收必须先取得该精确资料；从 11 月 2 日连续回放还需覆盖模型后续实际选择的证券和时点，不能预先认证全市场。

## 复用决策的验证入口

新增 `scripts/local-runtime/run-arena-historical-execution-check.mjs`，登记正式 `locked --idle` 维护入口。它只接受已有正常停止、身份通过、无自动重试的原决策，使用原冻结周期输入，重新读取历史工具并验证决策；全部业务读取在只读事务中，决策仅进入内存计算。网络只允许配置的 DSA API，拒绝模型地址及生成接口，禁止重定向；原成功模型记录及失败验证记录均不覆盖。

新增两项防误调用测试与原队列归属测试共三项通过；新入口语法、依赖边界及文件尺寸检查通过。按仓库要求核对已安装 `es-toolkit@1.51.0` 的实际导出与 `invariant` 声明；本脚本需要严格相等断言、URL 解析及哈希，保留 Node 原生接口，不添加依赖。首次运行入口被另一任务持有的正式维护锁拒绝，未执行模型、历史资料读取或业务写入，也未删除或绕过他人锁。

锁释放后正式执行：

```text
node scripts/infra.mjs locked --idle -- node /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/scripts/local-runtime/run-arena-historical-execution-check.mjs /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/arena-historical-execution-check-20261116
```

原五项工具全部读取成功：检索、报价、五分钟、MA、MACD。报价仍为 `1.343`；原十根输入的末根 MA5 为 `1.3436`、MA10 为 `1.3458999999999999`，MACD 因预热不足全部为空，没有把空值冒充计算失败。原买入决策仍被 `replay_rules_unavailable` 拒绝，未进入账户计算或持久化。命令退出 2 专门表示业务门禁阻塞，不表示模型失败或截断。回执保存在上述私有目录 `receipt.json`，没有重写旧 `send.json`。

模型调用／自动重试均为零，提供方与业务摘要前后相同：`8bdca1a6b7d09a00e1a083088e089827162767b77e9379a7d1a667fb95b94c00`。通过原归属回执正式执行 `arena-maintenance-queue.mjs resume`，退出 0，恢复后 active／wait／paused 均为 0；回执时间为 `2026-11-16T07:30:25.943Z`，没有取消任何调用。

## 运行态发现的分钟时间问题

原五分钟结果的末根时间为北京时间 11:35，但富途原始该根标签为 11:30。进一步以 `--periods` 在同一证券、日期及业务时点读取 15／60 分钟，均发现多移一个周期。该调查的原始回执为 `.recovery-artifacts/arena-historical-period-check-20261116/receipt.json`。早期调查还提交一次未在冻结工具合同中开放的 30 分钟请求，该项在工具边界拒绝、未读取来源；当前脚本已将扩展范围收窄到已开放的 15／60 分钟，不扩展模型工具合同。

只读核对真实原归档：

| 周期 | 11:30 原生根聚合的一分钟数 | OHLC、成交量及金额六项一致 | 原错误投影时刻 |
| --- | --- | --- | --- |
| 5 分钟 | 5 | 全部一致 | 11:35 |
| 15 分钟 | 15 | 全部一致 | 11:45 |
| 60 分钟 | 60 | 全部一致 | 12:30 |

根因在 `futu_minute.py`，只将 CN 一分钟声明为 `interval-end`，其他周期误用 `interval-start`。现修正 CN 全部原生分钟，保留港美原约定；非一分钟来源修订更新至 v3，原一分钟 v2 保留，隔离旧缓存。新增各周期 11:30 完成边界与港美回归，四文件定向 85 项及编译检查通过。此修复不填补执行归档，也不重写任何历史原文。

完整 DSA 门禁最初因宿主默认 PATH 无 `python` 退出 127，未进入测试；日志为 `/tmp/arena-cn-period-gate-20261116.log`。按既有虚拟环境修正执行环境后：

```text
rtk proxy env PATH=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/.venv/bin:/Users/yzin/.volta/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ./scripts/ci_gate.sh
```

在 DSA 目录执行，退出 0；8293 项测试、323 个子测试通过，1 项跳过、4 项取消选择，77 个警告，335.64 秒。完整日志 `/tmp/arena-cn-period-gate-20261116-venv.log`。最小 `sync-code.sh dsa` 首次被另一任务的正式锁拒绝；随后只等待维护窗口并重新调用同一正式入口，没有删除、抢占或绕过他方锁。正式更新退出 0，DSA 健康、镜像 ID 不变，没有结构或外部卷变更。目标 `futu_minute.py` 与 `thesis_ledger_sources/futu.py` 和宿主逐字节一致，SHA256 分别为 `b6a6d6a32ae6d2a5cb25b0ebf6ae1c4ebe3dbc9c05e4634ecb33874c03a13209`、`d1f5e0021460140b45ae6611e9e50957f0e0d93ca2071186c4d58c8d2c768def`；Server／Worker 仍健康。

正式执行同一无模型诊断入口，输出到新的 `.recovery-artifacts/arena-historical-period-fixed-20261116/receipt.json`，附加 `--periods`。七项工具全部 ready；5／15／60 分钟分别返回 24／8／2 根，末根 `timestamp` 和 `availableAt` 均为 `2026-11-10T03:30:00.000Z`（北京时间 11:30），`timestampConvention=interval-end`，完成状态为 complete。来源新修订写入新内容寻址归档，没有改写旧回执。

| 周期 | 新归档名（位于 `arena-history/`） | 响应 SHA256 |
| --- | --- | --- |
| 5 分钟 | `303937fc7d5e957cb86ddf3e406a630ca679c1943ef7208866d84000d87615b2.json` | `a29c49dd02b7e8c57593df54f030cbb100bc231a83b4e236a60628be1bbd34fe` |
| 15 分钟 | `b9da579fb2ca57f90af1da56e26e6eb4ef5ef9b8c66d07685424836feec1dd29.json` | `3540cda20d0c37f31d67bc917b57283747de14792a816dc9ac93ca624acb5cc2` |
| 60 分钟 | `9d73a66486a503dca848a406fbe846d99aa68996fea611862bec5543ca55d416.json` | `6df1c0d81722ce333a4d6f73bc59ec104c0fed4f32f20c27f1292e19143eb20b` |

模型调用及自动重试均为 0，业务与提供方摘要未变；业务摘要仍为 `8bdca1a6b7d09a00e1a083088e089827162767b77e9379a7d1a667fb95b94c00`。原调用计数为 3、事实计数为 6。决策校验仍因 `replay_rules_unavailable` 返回 blocked、`persistence=none`，命令退出 2；这是缺少真实执行资料的准确拒绝，不作为 R3 业务正向验收。

## 新验收比赛对象

只读核对当前业务列表和原 `test` 协议：原对象 `a36c2d69-1731-41fe-8750-86f89a236762` 为 `paused`，CN、全市场自主选股、开始日期 `2026-11-02`、无结束日期；协议 SHA256 为 `9abce2069603557c0310531cb5c82e2c13ce396e01920b994ccdfd3c9a3a3059`。其单一参赛者仍为原 LM Studio 模型，全部请求／令牌／费用预算及单次输入／输出额度为 null，研究步骤及总时长同为 null。

已有回放对象 `6f41c462-176a-4d6f-957e-331015e2af0f` 为 `ended`，不能复用为持续运行验收对象。后续应在真实执行资料及原决策业务验收通过后，复制原 `test` 协议建立新对象，使用与既有回放不同的标题和新 ID，保留上述全部设置。当前没有创建、启动或恢复比赛，也不把另一场美股比赛当作本轮 CN 验收对象。R4 的回放／实时正向验收保持未完成。

## 本批次一致性审查

R2 部署及附属 R2P 分钟时间修复完成；R1 的真实来源覆盖调查已执行，但所需事实没有取得，不能勾选准入。R3 已复用原成功决策完成运行态验证，准确停在执行资料门禁，尚无成交、账户、费用及结算正向结果；R4 依赖 R1／R3，尚未创建或启动。三项未完成工作保持在活动任务，不移入 TODO 或归档。

最终核对主仓及 DSA 本轮文件的 `git diff --check` 均通过，说明文档相对链接全部存在，三项防误调用及队列归属测试通过。活动任务、跨仓 H4 状态与实际部署回执一致；没有提交、归档或覆盖其他任务的在途修改。

继续条件是取得 `588000.SH` 在北京时间 2026-11-10 13:01 的真实盘中状态、价格限制、结算及完整法定收费资料，按来源、证券和时点独立准入。通过原成功决策的业务正向验收后，再以原协议新建 11 月 2 日比赛并按模型后续实际选择按需读取，任何截断立即停止模型调用。没有这些资料时继续启动比赛只会重复同一执行门禁，不能通过关闭验证、填默认规则或测试夹具完成验收。
