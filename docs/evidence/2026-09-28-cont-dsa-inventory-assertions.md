# DSA 库存断言修复证据（2026-09-28）

## 范围与结果

依据主 Task §12.9 与[只读分诊](2026-09-28-cont-dsa-inventory-regression.md)，本叶仅修改相邻 DSA 仓库的三个测试文件：`tests/test_thesis_ledger_control_v3.py` 的事件 expected、`tests/test_thesis_ledger_provider_runtime.py` 的注册与通用抓取器断言、`tests/test_thesis_ledger_provider_route_v2.py` 的逐资产来源覆盖不变量。生产源码、配置、其他测试与主 Task 保持只读；保留全部既有 WIP，未暂存、提交或回退。

原三项定向在当前输入下复现为 **3 failed**：目录比 expected 多 `tushare/CN/ETF/CASH_DISTRIBUTION`，注册集合多 `rqdata`，HiThink 的 `ETF` 与 `STOCK` 分属两个 source，旧断言错误要求单个 source 覆盖并集。修复后同三项 **3 passed**。Tushare 库存、RQData 只写凭据、HiThink V1/V2 准入与错配及完整 V2 route 测试四文件合计 **60 passed**。限定 `flake8` 为 0 错误，三个文件 `py_compile` 与已跟踪 diff 的 `git diff --check` 均通过。

## 合同边界

- V3 目录 expected 增加唯一 Tushare CN ETF CASH 条目。该测试用本地临时 SQLite、fixture 模式与无准入配置，因此此处 `not_admitted` 是该 fixture 的确定状态，不表示所有环境都未准入，更不表示真实 Provider 已 ready 或历史覆盖完整。
- `rqdata` 在注册表内，但宽 `capabilities` 与其 source 宽能力均为空，且不在通用 `_PROVIDER_ADAPTER_IMPORTS`。精确事件读取走独立路径；注册与账号保存不授予通用抓取能力。
- 每个 provider-wide `capability × assetType` 必须至少有一个 source 覆盖；source 的每项能力仍须是 provider-wide 子集，source ID 保持唯一。空宽能力的 RQData source 允许空映射。未改变 V2 对 HiThink 正确配对未准入及错误配对拒绝的行为。

## 命令与输入

命令均在 DSA 根目录通过 RTK 执行，测试使用仓库 `.venv/bin/python`，只使用本地合成 fixture 与临时 SQLite。最初系统 `python` 无 `pytest`，改用仓库虚拟环境后原三项即复现；这不是源码重试或门禁通过。

| 检查 | 结果 |
| --- | --- |
| `.venv/bin/python -m pytest -q` 加三项精确 nodeid，修复前 | 3 failed / 2 warnings |
| 同上，修复后 | 3 passed / 2 warnings |
| `.venv/bin/python -m pytest -q` 加 Tushare registry、RQData credentials、HiThink legacy route 与 V2 route 四文件 | 60 passed / 3 warnings |
| `.venv/bin/flake8` 三个写入文件 `--count --statistics` | 退出码 0，计数 0 |
| `.venv/bin/python -m py_compile` 三个写入文件 | 退出码 0 |
| `git diff --check` 两个已跟踪写入文件 | 退出码 0；Control V3 测试原本为 untracked，未被该命令覆盖，限定 lint/编译已覆盖其内容 |

三个测试输入起始 SHA-256 分别为 `3f3ee575f815e19dba5cba5061f53d9633bb21c90f2f7aadcce2e5b01910cbd2`、`29da46dc31d55b1ff0387c58dc82523398031f4c573e323d100fd9335e8b0fe3`、`f12dd4338200f4e930e07dbee7bfe087b327026051464c8e62d2fe68c3944c77`；结束分别为 `414153477661bc90c0ca02f9b300026e771b857e2be6b6a5fcf3f8be1d092920`、`b91a0de57349069b6997983eb003207cf5b7d2c154da20d353924a9f20752c2a`、`944568d1a9232d832a450fd5d564a620eab01b61efa37e27bb413d5ef0e00916`，顺序为 Control V3、provider runtime、provider route V2。

生产输入 `thesis_ledger_control.py`、`thesis_ledger_provider_runtime.py`、`thesis_ledger_event_v3_adapters.py` 的结束 SHA-256 依次为 `ab21053693486ee06cd433f2a128197db0b1cced063825dd485d85afd9026b38`、`c4d82eedfe83d27b2a5fde90128e37b5c30bb4f356a5f6f5b4110af6147e87a1`、`bad2af395f112b322b3c46401cc89668c7976d3a3f9bf4217ab538ffa0d9c491`，与此前稳定门禁记录一致。

未运行官方第三次离线全包、真实 Provider/账号/外网、目标运行态或目标数据库。此前官方重试仍为 **7208 passed / 16 failed / 1 skipped / 4 deselected / 594 subtests passed**；本叶修复其中三项断言，不把其余 13 项失败或整体门禁记为通过。没有需要继续运行的进程。
