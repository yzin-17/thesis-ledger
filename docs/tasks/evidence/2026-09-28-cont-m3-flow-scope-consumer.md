# R06.12 显式请求身份消费接线证据

## 1. 合同与结果

任务 `R06.12-explicit-scope-consumer`，按 [主 Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) §3.3 和 [主 Task](../2026-09-25-multi-source-adjustment-aware-backtest.md) §12.9 执行。沿用 [请求保护](2026-09-28-cont-m3-flow-request-scope.md) 的严格 ASCII `.SH/.SZ` 参数出口。结果 `worker_done`：两个 Manager 入口保存原输入，只将原输入传给资金流，其他财务 getter 继续接收规范裸码。

首次源码核实：`get_fundamental_context` 和 `get_capital_flow_context` 的 public stock_code 参数在 normalize 前仍为调用方原值，不需要外部查询、恢复已丢失身份或按号码猜场所。单行并行赋值保存 `original_stock_code` 与既有规范码，不改变公共签名、market/ETF过滤或非 CN 路径。

必要追加发现：完整上下文原缓存按规范裸码复用，单改传参会让显式请求成功块被裸码读取。协调者先更新 Spec/Task，明确授权 CN 缓存键纳入约束版本与原请求身份。实现只替换 owned 函数的 cache_key 赋值，追加 `|capital-scope-v1=<original_stock_code>`；公共缓存 helper 不改。非 CN 在到达该 CN 缓存接缝前进入原离岸路径，保留既有合同。

## 2. 基线与写集

DSA `data_provider/base.py` 已有 WIP；基线 SHA-256 `a7432147abd6e76ba71105769870c37bb9251d05f5d80e19ddf8634f7e544181`，3774 行。最终 SHA-256 `f1de3a1b460d4c4e8311f73afb2669119ba7a7834df13d5250dde9ea7794798f`，仍3774行，净增长0。改动严格限于 `get_fundamental_context`/`get_capital_flow_context`：两处同一行保存原参数、CN缓存键、聚合资金流参数、adapter资金流参数。

新 `tests/test_capital_flow_request_scope_context.py`，SHA-256 `60684a45a3cf351b24d2dc1aebf9b093725c95897160c6b8010e0e9a8857f5e7`。除此与本证据无其他写入；adapter/helper、其他 getter、共享缓存 helper、`_source_metadata` 均只读。没有 stage、commit、revert、子代理或 Manager 全局重构。

## 3. 调用与缓存实证

新测试未 mock `get_capital_flow_context`、adapter、guard 或 `_call_df_candidates`。伪 AKShare 注入 sys.modules，执行真实 Manager→adapter→guard→候选caller，SDK函数全部本地 mock，无网络。其他财务数据入口仅以 mock 隔离无关Provider请求。

- 完整上下文和直接资金块两路径：`600519.SH → stock="600519", market="sh"`，`000001.SZ → stock="000001", market="sz"`；individual 精确一次调用，stock_main 无调用。完整上下文的 quote、fundamental_bundle、龙虎榜和板块 getter 均收到原规范裸码。
- 两路径裸码 `600519/000001`、未知/多重后缀、小写后缀和SH前缀格式均不调用股票 endpoint，stock_flow 必为空且诊断存在。行业排名仍独立存在；没有用聚合 status 证明股票成功。
- 启用60秒缓存：显式→裸码、裸码→显式、相同裸码不同 `.SH/.SZ` 均独立缓存，不相互借用。预置旧无scopekey缓存的内容不会被读入新调用；再次同scope调用复用自身缓存，不增加individual次数。这个测试证明作用域隔离，不审核 `000001.SH` 的实际证券场所。
- 非CN `1810.HK` 继续按既有归一化 `HK01810` 进入离岸方法；未进入CN缓存/股票调用。现有相关回归同时覆盖非CN基本面行为。

## 4. 实际检查与首错

所有命令在DSA工作区执行，先新定向、再既有回归、再限定静态；没有build或全包测试。

| 检查 | 精确命令 / 范围 | 结果 |
| --- | --- | --- |
| consumer及guard | `rtk proxy .venv/bin/python -m pytest tests/test_capital_flow_request_scope_context.py tests/test_eastmoney_individual_fund_flow_request.py -q` | 首次9/9通过：consumer4项、guard5项；参数化覆盖两入口/两场所、拒绝格式、双向缓存及旧key |
| 相关回归 | `rtk proxy .venv/bin/python -m pytest tests/test_fundamental_context.py tests/test_fundamental_adapter.py tests/test_data_tools_get_capital_flow.py -q` | 首次33/33通过：21项context、9项adapter、3项工具 |
| 整文件lint | `rtk proxy .venv/bin/python -m flake8 data_provider/base.py tests/test_capital_flow_request_scope_context.py` | 未通过：95项既存未触及区域报告；首错base.py:277 E302，另有旧空白及3617–3618缩进；不改这些WIP |
| owned lint核对 | `rtk proxy sh -c '.venv/bin/python -m flake8 data_provider/base.py tests/test_capital_flow_request_scope_context.py \| awk -F: ...'`；完整报告经awk计数，仅保留新测试或base.py:3138–3505的报告 | 一次针对性核对，总报告95、owned范围0；明确只证明owned范围，不将整文件lint标为通过 |
| 项目关键lint | 核对 `scripts/ci_gate.sh:15` 实际select后执行 `rtk proxy .venv/bin/python -m flake8 data_provider/base.py tests/test_capital_flow_request_scope_context.py --count --select=E9,F63,F7,F82 --show-source --statistics` | 两个文件关键错误计数0，通过；不等于运行完整ci_gate |
| 编译 | `rtk proxy .venv/bin/python -m py_compile data_provider/base.py tests/test_capital_flow_request_scope_context.py` | 通过 |
| diff空白 | `rtk git diff --check -- data_provider/base.py`；新测试尾部空白rg无命中 | 通过 |
| 行数 | `wc -l data_provider/base.py` | 3774→3774，净增长0 |

owned lint派生命令的awk过滤条件为 `$1 ~ /test_capital_flow_request_scope_context/ || ($2 >= 3138 && $2 <= 3505)`，END打印总报告和owned数量，并在owned数量大于0时失败；未ignore或关闭任何lint规则。整文件lint未再次机械重试，无源码修复来掩盖历史报告。测试只有原依赖的两条Starlette/httpx/anyio弃用警告，无失败或重试。

## 5. 限制与交接

仅传递实际原身份并隔离缓存，不推断交易所，不将裸码提升为完整绑定。金额单位、日期/首行选择、模糊字段映射、来源响应身份、主力算法和真实准入仍未验证；完整合同skip保持，未关闭R06.12/G0-M/AC20。测试金额1.0仅为调用传递mock，不是官方raw fixture。

没有业务数据请求、账号、凭据、DB、目标容器、部署或浏览器验证。所有测试/检查进程结束；保留全部其他WIP，写权交还协调者，不继续领取其他叶。
