# R06.12 请求作用域保护实施证据

## 1. 合同与结果

任务 `R06.12-request-scope-guard`，按 [主 Spec](../../specs/2026-09-25-multi-source-adjustment-aware-backtest.md) §3.3、[主 Task](../2026-09-25-multi-source-adjustment-aware-backtest.md) §12.9 和 [请求作用域发现](2026-09-28-cont-m3-flow-contract.md) §7 实施。结果 `worker_done`：只有完整 ASCII 六位 `.SH/.SZ` 输入生成明确 stock/market 的单次 individual 请求；缺场所、来源失败或空表不请求默认证券或 stock_main。

完整金额单位合同仍为 skip；该保护不证明金额单位、日期选择、主力算法、响应身份、资产类型、覆盖完整性或真实准入。原首行/关键词值映射保持未验证状态。普通 Manager 仍剥离后缀，因此该消费者的股票资金流安全拒绝；没有自行恢复场所或按号码前缀推断场所。行业块独立保留，不能用聚合 ok 当作股票请求成功。

## 2. 基线与改动

DSA `data_provider/fundamental_adapter.py` 已有 WIP，实施前 715 行，SHA-256 `a25745a3f6676431803c49c17639bfa8c5c2fa467fa5fd608704709144ca635d`。本轮保留既有修改，仅写授权 import 和 get_capital_flow 股票请求接缝；未 stage、commit、revert 或修改其他 getter、Manager、`_extract_latest_row`、`_source_metadata`。

| 文件 | 改动 / 最终 SHA-256 |
| --- | --- |
| DSA `data_provider/eastmoney_individual_fund_flow_request.py` | 新纯函数 `resolve_individual_fund_flow_request(stock_code)`；严格匹配 `[0-9]{6}.SH/.SZ`，返回 stock/market 或 None；`3b895053f84ab9a529204851d094b4e1b9a0555f2e48e7da9d865a2227e09c3e` |
| DSA `data_provider/fundamental_adapter.py` | 新 import、单 endpoint 显式参数调用；无绑定时记录 `capital_stock:missing_explicit_exchange` 并保持 stock_flow 空；删除股票默认/变体/stock_main 兜底；最终仍715行，净增长0；`a3720810b0e9f061d741fdc1482b6c0efd5bdc0e051e9a0b9b468e0d3fc38573` |
| DSA `tests/test_eastmoney_individual_fund_flow_request.py` | 新5项离线测试；伪 SDK 经 sys.modules 注入，执行真实 `_call_df_candidates`，断言 kwargs、调用次数、拒绝及行业保留；`51a3c25b668df17dd2705c46e2f141843d5146b09381ee39ee1079e6de54bc2e` |

参数出口：`600519.SH → {stock: "600519", market: "sh"}`，`000001.SZ → {stock: "000001", market: "sz"}`。仅接受完整大写后缀，不接受裸码、前缀形式、小写后缀、空白、未知/多重后缀、全角数字或其他 Unicode 混淆字符。通过显式参数保护请求作用域，未独立审核股票真实所属市场。

## 3. 实际检查

以下命令均在 DSA 工作区执行，按定向→相关回归→限定静态顺序，全部首次通过，无失败重试。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 新请求保护 | `rtk proxy .venv/bin/python -m pytest tests/test_eastmoney_individual_fund_flow_request.py -q` | 5/5通过；包括纯解析、沪深精确kwargs、缺身份零股票请求、异常/空表/非DataFrame零股票兜底 |
| 相关回归 | `rtk proxy .venv/bin/python -m pytest tests/test_fundamental_adapter.py tests/test_fundamental_context.py tests/test_data_tools_get_capital_flow.py -q` | 33/33通过：9项adapter、21项context、3项现存工具消费者 |
| 限定lint | `rtk proxy .venv/bin/python -m flake8 data_provider/eastmoney_individual_fund_flow_request.py data_provider/fundamental_adapter.py tests/test_eastmoney_individual_fund_flow_request.py` | 通过，使用仓库setup.cfg |
| 限定编译 | `rtk proxy .venv/bin/python -m py_compile data_provider/eastmoney_individual_fund_flow_request.py data_provider/fundamental_adapter.py tests/test_eastmoney_individual_fund_flow_request.py` | 通过 |
| 存量diff空白 | `rtk git diff --check -- data_provider/fundamental_adapter.py` | 通过；新增未跟踪文件另用尾部空白rg检查，无命中 |
| 净行数 | `wc -l data_provider/fundamental_adapter.py` | 715→715，未增加 |

测试仅存在原依赖的两条 Starlette/httpx/anyio 弃用警告，无测试失败。尾部空白检查的 rg 无命中返回1是预期行为，不是代码检查失败；该组合只读命令的退出码1已单独解释，其他检查成功。

测试金额 `1.0` 是标明用途的离线 mock，只证明既有接缝输出和 source_chain 保留，不是官方 raw fixture。缺场所及失败用例均断言 stock_flow 为空，且行业排名仍存在；SDK mock 断言 stock_main 未调用，individual 参数绝不为空。没有 source metadata 改动。

## 4. 限制与交接

无业务网络请求、凭据、账号、数据库、目标容器、部署、浏览器、全包build或真实准入。当前 Manager 裸码输入的股票资金流不能成功，这是明确失败关闭合同；继续开放需独立的明确场所绑定/传递叶。金额、日期、数值关键词和工具 today 文案等既有问题保持由完整合同叶负责，不据本叶关闭 R06.12/G0-M/AC20。

仅上述DSA三文件与本证据写入；其他WIP保留。没有子代理、后台测试或未结束进程；写权交还协调者，不自行领取下一叶。
