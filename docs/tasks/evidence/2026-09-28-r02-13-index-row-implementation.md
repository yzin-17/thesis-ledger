# R02.13 指数日线行选择实施证据

日期：2026-09-28。状态：`worker_done`；仅表示指定实现与局部离线验证完成，整体台账和真实准入由协调者独立复核。

## 输入与边界

依据主 Spec `docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md` §3.3、`docs/tasks/evidence/2026-09-28-m3-r02-r03-frontier.md` 的 R02.13 叶及稳定前置证据 `2026-09-28-r02-13-index-row-selection.md`。

协调者在本任务明确提供其于 2026-09-28 只读核对的[官方指数日线接口合同](https://tushare.pro/document/2?doc_id=95)：请求支持 `ts_code/start_date/end_date`，响应包含 `ts_code/trade_date`，日期格式为 `YYYYMMDD`。本 worker 未再次联网；安装 SDK 动态接口没有本地字段声明的前置事实仍然保留。官方合同仅支持字段校验，不证明账号权限、真实返回、来源时点或实时性。

本次只写 DSA 两个新文件及 `get_main_indices` 接缝，另写本证据。已有大量工作树改动完整保留，未修改 manifest、registry、共享合同、ExactDailyMixin、基金或事件路径，未写 Spec、总台账或 DSA CHANGELOG；这些文档的后续汇总由协调者负责。

## 实现与消费

- 新增 `data_provider/tushare_index_daily_rows.py`：完整遍历非空响应，要求唯一身份/日期列、精确请求身份、字符串形式的八位 ASCII 日期、真实合法日历日期、包含两端的请求窗口及日期唯一。任一坏行抛出 `ValueError`，不跳过坏行。
- 全部有效时按最大日期选择原始 Series，不排序、格式化或修改响应；空响应返回 `None`。重复 DataFrame 索引不影响按位置选择。
- `data_provider/tushare_fetcher.py` 的 `get_main_indices` 调用该 helper，保留逐指数异常隔离。六个指数映射及顺序、五日请求窗口、`safe_float` 字段与 `amount × 1000` 保持原行为；Manager → MarketAnalyzer 消费结构未变。
- 新增 `tests/test_tushare_index_daily_rows.py`，通过 mock `_api.index_daily` 调用实际 `get_main_indices`；测试内阻断 socket 与 HTTP Session，固定时间验证原请求参数。
- fetcher 修改前 1354 行、修改后 1351 行；helper 46 行、测试 121 行。

## 验证命令与结果

工作目录为 DSA 根目录，所有 Python 验证使用已有 `.venv/bin/python`，设置 `PYTHONDONTWRITEBYTECODE=1`。

| 命令或检查 | 输入范围 | 最后结果 |
| --- | --- | --- |
| `rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s tests -p test_tushare_index_daily_rows.py` | 新 helper、实际 fetcher 接缝、新测试 | 10 项通过；随后在 AST 脚本内重新运行同一 discover，最终 10 项通过，0.066 秒，0 skip |
| `rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s tests -p test_sina_index_identity.py` | 既有指数身份消费回归 | 5 项通过，0.035 秒，0 skip |
| `rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m flake8 data_provider/tushare_fetcher.py data_provider/tushare_index_daily_rows.py tests/test_tushare_index_daily_rows.py --count --select=E9,F63,F7,F82 --show-source --statistics` | 三个独占 Python 文件；沿用仓库关键 lint 选择 | 0 错误 |
| `rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m flake8 data_provider/tushare_index_daily_rows.py tests/test_tushare_index_daily_rows.py --count --statistics` | 两个新增文件；沿用 `setup.cfg` | 首次发现 3 个 E128 缩进错误，修正后 0 错误 |
| `ast.parse`，通过 `rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -` 执行 | 三个独占 Python 文件 | 全部通过，无字节码写入 |

flake8 本身不使用持久缓存、无 `--no-cache` 参数；未安装依赖。未执行存量 fetcher 全规则 lint，只执行与现有门禁相同的关键规则；两个新增文件已执行完整配置规则。

测试覆盖乱序、升序与降序相同选择、原始行与原响应保持、六指数完整数值字典及金额换算、窗口两端、整数/空/null/非法格式/不存在日历日期/越窗日期、错身份与缺列、重复日期、重复列、空响应、单指数拒绝后的其他指数保留、原地域与 API 不可用守卫。

最终输入 SHA-256：

- `data_provider/tushare_fetcher.py`：`fe0d7c99e91433571d1bbd496c734511854e8e399db3d89497f8a107a746919f`
- `data_provider/tushare_index_daily_rows.py`：`25f13b0abaa406b53c7ba8ff47e18022dbf300a5240ebecf7ea2d1fcd0f3dacc`
- `tests/test_tushare_index_daily_rows.py`：`8ee91f6d36ada53b9b4411e9b174e8e478ce7893ce1bf3ccc2512bebc822e21b`

## 未执行验收与回退

未执行全包测试、仓库全门禁、build、数据库、镜像、部署、浏览器、真实 Provider 或在线请求；本叶授权限定为离线局部验证。未因此关闭真实时点、历史完整性、权限或 G0-M 等真实门禁。全部命令已经退出，未启动后台进程。

回退时仅撤销本叶在 `get_main_indices` 的 helper 调用与数值内联改动，并删除两个新增 Python 文件；不得恢复整个 fetcher 文件或覆盖其他工作树改动。
