# 富途不复权研究参考验证记录

对应[已完成任务](../tasks/2026-11-12-futu-raw-research-reference.md)，记录本次实施的历史验收范围。

## 诊断与变更

截图请求为 `00700.HK`，原价参考父窗 `2025-07-06` 至 `2026-11-11`，提交意图 `ff46627b-006a-4d22-a1b4-3969fd10e7db`。只读 SQLite 查询确认 DSA 策略修订 199、`applied`，港股股票 `none` 主源为 `futu/futu`、备源为 `tushare/tushare`；`hfq` 为 `futu/futu`。未改策略。

调用路径为 `OptimizationPreparation.prepare` → `BacktestRunPreparationService` → `readPriceResearchReference` → Market → DSA。主仓已经显式传递 `assume-untradable-no-bar`，缺口在富途股票 `none` 未声明研究日历和身份。主仓及 DSA 均有大量既有修改，本次按补丁保留；不将全工作区差异计为本次改动。

新增 `none` 参数的身份回归先复现腾讯、苹果失败：2 失败、4 通过；错误为 `unsupported_capability`。修复只扩展富途现有精确绑定的研究声明，不改公共日历、单位、路由、快照合同或客户端。未知上市信息保持 `{status: unknown}`；严格原价与实际份额仍拒绝。没有新增跨 feature 依赖或边界旁路，原自动门禁仍适用。

## 写集

- DSA：`data_provider/thesis_ledger_sources/futu.py`、`tests/test_futu_research_identity.py`；`scripts/probe_backtest_daily_sources.py`、`tests/test_backtest_daily_source_probe.py`；`docs/design/thesis-ledger-adjusted-daily-capabilities.md`、`docs/CHANGELOG.md`。
- 主仓：本专题 Spec、Task、证据及对应导航。
- 未修改 infra、Server、Desktop、Mobile 的业务代码或运行配置。中文专题没有成对英文页，不需要同步英文文档。

## 本地验证

在 `/Users/yzin/code/thesis-ledger-workspace/daily-stock-analysis` 执行：

- `.venv/bin/python -m pytest -q tests/test_futu_research_identity.py tests/test_backtest_daily_source_probe.py tests/test_thesis_ledger_futu_capability_path.py tests/test_futu_daily.py tests/test_thesis_ledger_research_calendar.py tests/test_thesis_ledger_research_instrument_binding.py --tb=short`：200 通过。覆盖港美不复权生产响应、身份、时钟、ETF/错市场/未知证券拒绝、严格模式、控制副本清理与 CLI。测试未请求真实 SDK。
- `.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py`、`scripts/check_data_runtime_contract.py`、`scripts/data_test_scope.py`：通过；439 个测试目标。
- 四份修改 Python 文件执行 `py_compile` 与 `flake8 --select=E9,F63,F7,F82 --show-source --statistics`：通过。
- DSA `git diff --check`：通过。

新增生产响应测试最初缺少隔离库中的富途启用配置，补齐副本配置后响应已通过；随后纠正未知上市事实的断言为实际合同 `{symbol, status: unknown}`。没有放宽生产校验。

诊断新开关 `--price-research-reference` 只允许 `--adjustment none`，默认不复权仍严格。显式 `--max-window-days 550` 可覆盖截图窗口，单来源次数、4.5 秒执行预算与控制库隔离均沿原合同。

## 目标运行态

从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh dsa`，无附加环境参数，兼容性预检通过，退出 0，DSA 恢复 healthy。脚本未改变镜像、数据库结构或外部卷；这是容器可写层快更，重建容器后须重新同步或通过正式更新固化。

同步前使用 `python -B` 只读调用容器现有 `_research_request`，截图原价参考请求为 False；同步后同一请求为 True。宿主和容器 `data_provider/thesis_ledger_sources/futu.py` 的 SHA-256 均为 `313ec734916b6428a559d8de801683ec71b5823b89f9df953cefd9874f358e25`。Context Mode 中的首次摘要命令退出 1、未产出容器证据，后用普通执行工具执行同一只读检查退出 0，以上结论只采用成功结果。

在 DSA 目录执行受维护入口：

```sh
./scripts/local-runtime/probe-backtest-daily-sources.sh --symbol 00700.HK --asset STOCK --adjustment none --price-research-reference --start 2025-07-06 --end 2026-11-11 --max-window-days 550 --target futu/futu
```

2026-11-12 18:50:58（北京时间）返回 `validated`、退出 0。实际和预期均为 335 个交易日，首日 2025-07-07、末日 2026-11-11，无缺日假设；一次完整隔离响应，`pagesFetched=1` 不解释为 SDK 内部分页数。输入摘要为 `f55f4f9392cc5542136a725f2e528ab77b196a46422eea73b8030f08f091a1b6`。字段单位仍为 null，上市状态仍 unknown，没有将参考价格认证为原始份额执行事实。

诊断的 `isolatedControl=true`、`productionControlUnchanged=true`。仅一次真实来源窗口读取，使用临时控制库副本，没有修改生产路由或准入；没有创建实验、回测、策略版本或模型请求。此前其他实验或来源的验收记录没有作为本次输入证明。

## 最终审查与边界

首次验收时，AC1～AC3 由 200 项生产路径/失败边界回归与静态检查覆盖，AC4 由正式快更、独立源码摘要和完整窗口实源生产校验覆盖。当时只证明不复权参考覆盖阻塞已解除，尚未实际调用实验准备接口；用户随后授权的真实接口结果见下节。没有改动页面，因此未运行浏览器布局验收。

未执行全仓离线套件或生产镜像构建。回滚只需撤回本次富途 `none` 两处声明与相关工具增量，再经正式 `sync-code.sh dsa` 同步；保留工作区其他补丁与全部业务数据。所有改动未提交、未推送。任务满足本次范围，无新增延期实现。

## 用户授权后的实际实验准备

用户追加要求：“帮我实际验证一下这个实验的配置能否准备成功，先不要启动模型调用。”本节直接请求本地运行中的真实接口，不使用受控响应，不创建实验。

### 配置与执行范围

复用截图可见配置：从零探索、`00700.HK`、港股股票、日线、HKD，整体窗口 `2025-11-17` 至 `2026-11-11`。截图中的开发、验证和封存边界分别为 `2026-05-15`、`2026-08-13`、`2026-11-11`；配置准备接口冻结整体窗口，不接收切分和模型选择。

截图没有显示初始资金及候选预热预算；执行前已向用户说明按页面默认的 `100000 HKD`、60 个预热交易日复现。历史方式为 `fixed-provider-snapshot`，后复权研究、不复权参考强制冻结，`freezeTimePolicy=after-acquisition`，估值时区 `Asia/Hong_Kong`、估值时间 `16:00`。模拟成交设置由实际 `execution-model` 接口返回，未自行拼造或修改。

仅执行以下两个 HTTP 请求，各一次：

1. `POST http://127.0.0.1:3000/api/v1/strategy-optimization/run-config/execution-model`：HTTP 201、`available`。这是模拟成交规则解析，未调用生成模型。
2. `POST http://127.0.0.1:3000/api/v1/strategy-optimization/run-config/prepare`：HTTP 201、`prepared`。请求标识为 `6366f113-6837-4c7a-9a46-e2e9e3652c8d`，检查时间 `2026-11-12T10:54:07.332Z`，采集后冻结时间 `2026-11-12T10:54:09.307Z`，即北京时间 18:54:09。

返回 Desired／Effective 修订均为 199、Catalog 为 `3175945065355000`，策略内容摘要 `48dfc8e4426f81db5095d2e549216933e36d17eaca1f8012fc3531bd7e630f96`，没有阻断诊断。

### 冻结产物独立核对

随后通过只读 `docker exec` 调用正式 `MarketWindowEvidenceV3Repository.findFrozen`，读取两个返回引用；该读取同时核对数据库证据身份和完整响应。另用 `marketFrozenWindowHashV3` 独立比对接口返回的响应摘要，均通过，没有追加来源请求。

| 口径 | 实际来源 | 完整父窗 | 行数 | 冻结身份 | 完整响应摘要 |
| --- | --- | --- | --- | --- | --- |
| 后复权 | `futu/futu`，主源索引 0 | 2025-07-06～2026-11-11 | 335 | `a3cc9a881e02168a563ba8a2d4c708d1be5463a8fb4d6a2cc25b69d2eda9568b` | `1065986df15aa5446c7cd6cee5c8908654f5a8d77de6747b3b6ee85983a5fed9` |
| 不复权参考 | `futu/futu`，主源索引 0 | 2025-07-06～2026-11-11 | 335 | `ab1b8bdd5f006a0f80ddd51bd23a129dd25f593c6051bbb151a18fb63fdfdcfd` | `fe8671fd9ca20e9ba985bc52bd3df4fff192f8e127f8a12949141bc7ebf7c8a6` |

### 未启动模型的业务证据

在两次 HTTP 请求前后，对以下十张业务表执行只读 `SELECT`，按每行完整 JSON 的稳定顺序计算 MD5；各表数量和内容摘要均完全一致：

| 业务表 | 前后行数 | 前后相同的内容摘要 |
| --- | --- | --- |
| `Strategy` | 118 | `127cecb04945dee8ee65feb1171f7b68` |
| `StrategyVersion` | 147 | `7dba268e5a0e4a2678a9d9d2e86603e0` |
| `BacktestJob` | 142 | `f9b0b82d8ac2f1c565fe134900d0ac0a` |
| `Account` | 28 | `4990b2d933a6f58ca45054b6fc7b06e9` |
| `LedgerEvent` | 138 | `ad1154170026598c9f88035094585a39` |
| `DesiredProviderPolicy` | 1 | `3b112d2af01c31058ef07af69e3eb0f9` |
| `DesiredProviderPolicyRevision` | 199 | `9ae597f3a556671c359741f934729112` |
| `OptimizationExperiment` | 18 | `5f45e8755e5fccc42b43733f1290b9df` |
| `OptimizationAttempt` | 21 | `fe26e571eea2aecc0c85b0364a990f35` |
| `AiRun` | 39 | `b018f5b983768493033af29529b46368` |

准备接口允许持久化 Market 观测和冻结证据；没有访问实验创建、重试或模型生成接口。原提交意图 `ff46627b-006a-4d22-a1b4-3969fd10e7db` 未用于创建实验。该标识属于原浏览器创建表单，此次独立接口请求不会自动把准备结果注入原表单。

结论：上述实际参数下，真实实验配置准备成功，两套冻结行情均可回读且摘要一致；没有新增实验、回测或模型调用。本轮未启动开发、验证、封存测试或候选生成，也没有据此声明全实验执行成功。
