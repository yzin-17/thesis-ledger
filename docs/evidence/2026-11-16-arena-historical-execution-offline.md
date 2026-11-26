# 盘中历史执行与 ETF 制度离线接入证据

## 范围与结论

本轮按用户要求只修复与验证离线接入，没有调用模型、真实行情来源、真实业务数据库或比赛，没有部署、启动、重试或更改已有记录。DSA 控制测试使用临时 SQLite，跨运行时样本的审计钩子禁止网络及 SQLite 连接，并确认没有此类尝试。

新增执行归档读取、独立准入及 Market 消费代码；受控 ETF 已贯通原文字节、实际 DSA registry、临时控制库执行器、HTTP 合同与 Market。真实 `588000.SH` 在 2026-11-10 13:01（Asia/Shanghai）的合格事实仍缺失，生产归档的 `index.json` 不存在，新来源默认关闭。不能据此认定该时点可以成交或比赛可以追平。

## 接入与拒绝边界

- `HISTORICAL_EXECUTION_CONTEXT` 按 CN 股票／ETF、完整代码、模拟时点、目标与政策修订读取。状态快照精确对应时点，不使用回测日线的日终保守状态；原回测合同保持不变。
- 真实采集时间可晚于模拟时刻，但所有引用的历史可见时刻必须不晚于模拟时刻。只接受完整的交易单位、价格精度、精确价格限制／明确无限制、持仓结算、现金结算和法定收费覆盖。
- `historical-execution-archive / qualified-cn-execution` 默认关闭。既有普通查询的配置后首次使用规则不能用于执行证明，必须独立准入并匹配证券、日期和来源修订。政策、来源配置代次和准入均在读取前后检查。
- 固定源码资料目录，索引摘要进入来源修订；仅读取命中上下文和引用原文，并核验各自摘要。单件至多 2 MiB，索引至多 4 MiB、40000 项，引用至多 32 项。没有自行下载、参数路径、来源激活或默认 ETF 结算。
- 当前收费投影仅表达成交额费率及最低额。原文需要其他计费基数或舍入制度时，不能将完整收费覆盖声明为真。原 `510300.SH` 旧收费样本没有扩为其他证券或日期。
- 明确启用新路由后，缺录不会降级到旧日终接口；稳定的覆盖不足映射为原 `replay_rules_unavailable`，保留底层原因。政策变化及无效响应不伪装成可修正的普通缺录。
- Market 继续先检查分钟价格及会话，研究仅读取价格；执行／持仓才读取制度。停牌阻止买卖，结算日期取实际日历和快照日数，法定收费独立于比赛佣金。

## 验证结果

| 验证层 | 结果 |
| --- | --- |
| DSA 定向回归 | 8 文件、142 项通过；新增归档测试 27 项 |
| DSA 库存导出回归 | 7 项通过；新正式来源及 CN 股票／ETF 路由门禁已纳入断言 |
| DSA 来源注册与库存联合回归 | 2 文件、30 项通过；注册表预期及新来源默认关闭断言同步 |
| Server 定向回归 | 5 文件、46 项通过；新增执行测试 25 项 |
| 跨运行时受控样本 | 实际 DSA registry 输出经过 TS 合同进入 Market，零网络／数据库尝试 |
| Schema 完整构建 | `pnpm --filter @thesis-ledger/schemas build` 退出 0 |
| 接入范围类型检查 | 5 个 Server 根文件及其传递依赖，0 错误；新 Schema 独立检查通过 |
| 静态检查 | 目标 ESLint、导入边界、尺寸门禁和两仓 `git diff --check` 通过 |
| DSA 静态门禁 | `ci_gate.sh syntax / flake8 / deterministic` 均退出 0，501 个运行文件；451 个数据测试文件、453 个目标 |
| DSA 完整门禁 | `ci_gate.sh` 退出 0，8286 项通过、1 项跳过、4 项取消选择、323 个子测试通过；末行 `all checks passed` |
| Server 完整类型与构建 | 原批次因回测 `test/backtest/protection-snapshot.fixture.ts:29` 的 `entry: unknown` 与 `Expression` 不符而失败；后续当前工作区已不再复现，完整类型及构建退出 0，见[补验证据](2026-11-16-arena-server-build-offline.md) |
| 目标部署、真实资料、比赛追平 | 未执行、未验收 |

受控费用为人为测试数据：成交额 10000 时买侧 0.4、卖侧 0.5；不代表真实 ETF 费率。受控持仓结算可分别配置 0 或 1 个交易日，验证代码没有按 ETF 类型推定 T+0。另覆盖提前可见、规则过期、证券／类型不符、未知引用、收费覆盖不完整、重复收费、布尔结算日数、非法时钟／价格、精确小数倒置、停牌、缺录、原文篡改、索引变化、准入证券／日期／修订／有效期越界、陈旧政策及来源关闭。

## 可复现命令

Server 工作目录为 `apps/server`：

```sh
ARENA_HISTORY_OFFLINE_DSA_ROOT=/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis pnpm exec vitest run test/market/historical-execution.test.ts test/market/arena-replay-reader.test.ts test/market/arena-history-source.test.ts test/market/arena-history-indicators.test.ts test/model-arena/live-order-identities.test.ts
```

DSA 工作目录为兄弟仓库根目录：

```sh
.venv/bin/python -m pytest -q tests/test_historical_execution.py tests/test_thesis_ledger_status_capabilities_v1.py tests/test_thesis_ledger_status_query_support_v1.py tests/test_thesis_ledger_tradability_provider.py tests/test_configured_market_routes.py tests/test_thesis_ledger_admission_v3.py tests/test_thesis_ledger_status_acquisition.py tests/test_thesis_ledger_cache_context_v3.py
```

本轮执行命令均通过 `rtk proxy`。完整门禁额外使用 `/tmp/arena-execution-offline-guard/sitecustomize.py`，只允许测试临时回环 HTTP，拒绝外部连接、代理端口及非临时数据库。第一次隔离脚本误判临时库 `file:` URI，已修正；第二次拒绝了物理无模型数据进程的回环健康检查。第三次通过 5028 项后，在既有 `test_gateway_can_extend_declared_derived_capability_without_migrating_facade` 初始化默认控制库时被保护拦截，未访问该库；日志为 `/tmp/arena-historical-execution-dsa-controlled-gate.log`。随后显式指定临时 `DATABASE_PATH`，继续保留原保护，不修改产品默认值或既有测试。前三次均不认证完整门禁通过，日志保留。

第四次已显式指定 `/tmp` 测试库，但隔离脚本仅允许 macOS 系统临时目录，仍在同一测试处拦截；日志为 `/tmp/arena-historical-execution-dsa-tempdb-gate.log`（5028 项通过、1 项失败）。随后只为上述测试库的精确路径放行，没有放宽任意数据库路径，原失败测试单独通过。

第五次完整门禁通过 5822 项后，发现库存导出测试仍固定期望 29 个来源；新正式来源使该值应为 30，日志为 `/tmp/arena-historical-execution-dsa-isolated-final-gate.log`。已同步测试，并新增两条 CN 股票／ETF 执行路由均受门禁约束的断言；库存测试 7 项通过。修正只影响测试，核心源码摘要保持不变。

第六次完整执行到结束，通过 8285 项、323 个子测试，1 项失败、1 项跳过、4 项取消选择；唯一失败是 `test_provider_registry_exposes_fetchers_and_gated_sources` 的旧来源集合未列入新来源，日志为 `/tmp/arena-historical-execution-dsa-complete-gate.log`。已同步集合、非传统适配器分类，并补充新来源默认关闭和能力断言；来源注册与库存两文件联合回归 30 项通过。

最终完整门禁使用以下临时环境，日志为 `/tmp/arena-historical-execution-dsa-verified-gate.log`；隔离脚本属于本轮临时验证设施，没有部署到产品：

```sh
rtk proxy env DATABASE_PATH=/tmp/arena-execution-controlled-gate-20261116.sqlite PATH="/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis/.venv/bin:$PATH" PYTHONPATH="/tmp/arena-execution-offline-guard:/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis" PYTHONDONTWRITEBYTECODE=1 PYTEST_ADDOPTS= bash scripts/ci_gate.sh
```

该轮实际退出 0：8286 项通过、1 项跳过、4 项取消选择、77 项警告、323 个子测试通过，用时 359.87 秒。临时 HTTP 及 SQLite 只用于受控验证；该结果不证明真实来源覆盖或比赛可成交。

类型隔离使用项目原 `tsconfig.json` 选项和 TypeScript 编译 API，根文件为 `market-arena-replay-reader.ts`、`dsa-historical-execution.ts`、`dsa.client.ts`、`historical-execution.test.ts`、`arena-replay-reader.test.ts`，没有忽略诊断、放宽编译选项或修改其他回测文件。该结果不能替代完整 Server 构建。

## 核心输入摘要

以下为最终相关测试对应的源码 SHA-256，路径分别相对主仓和 DSA 根目录：

| 文件 | SHA-256 |
| --- | --- |
| `packages/schemas/src/market-historical-execution.ts` | `52953c873b7bdf12f3a064397689bf5f10d39b115139aeb18be35bd08a5642ca` |
| `apps/server/src/integration/dsa/dsa-historical-execution.ts` | `d3e330332dc343a76e7cccf6280a13c74ef0cd4e362dd8f0a4f7f488bfee8204` |
| `apps/server/src/integration/dsa/dsa.client.ts` | `395f56dcaf8b09bdf05aead0b044153d00ed760185667c2d966cfaa757fb78e6` |
| `apps/server/src/market/market-arena-replay-reader.ts` | `071a595d7aa710b9afcbe8522e26c58e1c45bc0da4e984b216fc5bced4980600` |
| `src/services/thesis_ledger_historical_execution.py` | `95ed04f395264532fa48ef69f0295355c738ec4a2c3bc3e3b1b40b0be8466f9b` |
| `data_provider/thesis_ledger_sources/historical_execution.py` | `a4f4ec96cb8f25bfb192c928aa19b62cdce4d37ff2d0ca2e384e421848ddf1d0` |
| `api/thesis_ledger_arena_history.py` | `c8747ad33096183b649bb9cbc4b804ec16088dc7d02c8d24a83ce66cc535151c` |
| `tests/test_thesis_ledger_inventory_export.py` | `33bb89d9ee31ac3f77b85fa3e53329437562d3a103bf88b9f081feb5bfb2780e` |
| `tests/test_thesis_ledger_provider_runtime.py` | `0319594559e0be8665cc02ef17051d497a32efc072f8691c698bc9525e146a86` |

## 离线范围一致性审查

- [x] AC03、AC08、AC11 的本轮接入范围、时钟语义、严格合同与控制门禁有实际消费和拒绝证据。
- [x] DSA 拥有来源及原文，Market 拥有可见性与执行准入，Arena 没有新增来源或费用默认逻辑。
- [x] 旧日线回测、研究／执行分离、历史失败和用户已有修改保留。
- [x] 受控资料只在测试目录和临时控制库，没有被复制进生产资料目录或保存为真实准入。
- [x] 后续完整 Server 类型与构建、4 个依赖包重建及 60 项离线回归已补验通过；最终以全部根输入的固定编译快照收口，完整诊断和生成均通过。输入原文、摘要及原失败分别保留，详见上方补验证据。
- [ ] 完整包级与运行验收全部通过。
- [ ] 真实历史状态和 ETF 制度已取得并覆盖目标时点。

结论：受控离线接入、定向验证及 DSA 完整门禁通过，Server 完整类型及构建后续已补验通过；目标部署、真实资料及业务闭环按上表独立保留，父任务继续活动，不将样本成功认定为真实比赛可成交。
