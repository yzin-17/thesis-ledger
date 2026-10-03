# D01 多窗口执行与本地验证对账

日期：2026-09-28。范围：主 Task `CONT-D01-window-verification`，对应 Spec §8.3 的 HiThink ETF 多窗口本地合同。此次仅增强 DSA 拒绝矩阵并核对当前生产调用链；未变更 DSA/Server/Schemas 生产源码。

## 当前调用链

DSA `api/thesis_ledger.py` 的 V3 行情入口把精确 HiThink ETF/qfq/1d 路由交给 `try_hithink_multi_window_v3`。`api/thesis_ledger_multi_window_v3.py` 在首个请求前规划不超过五年的有序子窗、真实交易日交集、请求次数与总时间预算；每窗通过生产 `execute_market_bars_v3` 读取，保存起止观测时间及完整单窗响应，逐次比较全部已观测交集，失败即停止。`thesis_ledger_multi_window_response.py` 保留每窗原始证据、采用重叠日期较晚的 `availableAt`，生成绑定全部子响应的本地内容指纹。当前只读生产输入 SHA-256：调度模块 `2bfd7d778eb939a4663df62945748a7d7f5305de726764c169c774715ccf1457`，组合模块 `7f616b8299ae5bf2be491ae8b1b36ac173e867ff8a396ca7149643086d78f4a0`。

共享 Schema 的 `windowObservations` 保留非递归完整单窗响应；Server 只在协议确认、父子身份/覆盖/指纹校验成功后消费。DSA 每个生产子请求仍经过 Market V3 准入与当前适配修订核对；多窗口路径没有独立绕过准入。既有快照测试核对本地 Parquet 落盘、离线重放、证据删除或改写及执行价格篡改拒绝；它没有验证 PostgreSQL 中的原响应回读。上述本地调用链仍不授予真实 HiThink 账号、历史窗口或复权基准资格。

## 本次补充与检查

DSA 仅编辑工作树中原本未跟踪的 `tests/test_thesis_ledger_multi_window_response.py` 参数化负例，不暂存或清理该文件：子响应 `volumeBasis` 不一致、`adjustment` 不一致、实际 Bar 交易日无交集均不得合并。原价格/身份/时间/缺行/递归拒绝继续保留。该测试文件当前 SHA-256 为 `4cd3942e3b1c63f13a4bc1bb1d927ac3361a6122c31c95015a7b2452c22f2325`。

| 验证层 | 结果 | 覆盖边界 |
| --- | --- | --- |
| 新增三个精确负例 | 3 passed | 单位口径、调整口径、实际交集拒绝 |
| DSA 三份多窗口测试 | 20 passed，3 warnings | 受控 HTTP 成功、五年分窗/预算、冲突、来源失败、漏 Bar、未完成分页、晚到响应、组合与内容指纹 |
| DSA Market V3 准入运行测试 | 14 passed，2 warnings | 当前适配修订、撤销及读取前后准入核对；与多窗口共享执行入口 |
| Schemas 多窗口合同 | 14 passed | 父子身份、较晚可用时间、非递归响应、跨语言指纹与旧解析拒绝 |
| Server 协议解析及冻结快照 | 9 passed | 协议确认、父子哈希/时间篡改拒绝、Parquet 与离线重放 |
| DSA 单文件 flake8、py_compile、未跟踪文件空白 | 通过；`git diff --no-index --check /dev/null` 无空白诊断，其退出码 1 仅表示内容有差异，尾随空白 `rg` 无匹配 | 本次测试文件质量检查，不把普通 `git diff --check` 当作未跟踪文件检查 |

DSA 三条 warning 来自测试依赖弃用与测试客户端类收集提示。本次未运行 DSA 官方第三次全包、真实 HiThink 请求、目标容器/浏览器或 I01 PostgreSQL 原响应回读；不把合成重叠价格等同供应商方法版本或全局复权锚点。`D01-consumption` 的数据库原样保留、`D01-runtime` 的目标受控 HTTP/冻结、`G0-H` 和 `G-Run` 的真实授权与原标的区间证据继续开放；原重试账本不重置。
