# R02.13 指数日线行选择前置核验

状态：`needs_split`，在返回身份字段的本地声明缺失检查点结束本会话，实施留给新 Task。日期：2026-09-28。

## 范围与合同

本叶对应主 Spec `docs/specs/2026-09-25-multi-source-adjustment-aware-backtest.md` §3.3，以及 `docs/tasks/evidence/2026-09-28-m3-r02-r03-frontier.md` 第 68–74 行。目标是完整核验 `index_daily` 响应的精确 `ts_code`、严格合法且位于已请求窗口内的 `trade_date`、唯一日期，再选择最新原始行，交现有数字字典消费。不得跳过身份校验或从请求代码推断返回身份。

## 本地接口定位与发现

- DSA `data_provider/tushare_fetcher.py:806` 的 `get_main_indices` 是现有入口；第 842 行调用 `_api.index_daily(ts_code=ts_code, start_date=start_date, end_date=end_date)`，第 844 行直接读取 `df.iloc[0]`，第 860 行保持 `amount × 1000`。
- 现有消费链为 `data_provider/base.py:2486` 的 Manager `get_main_indices`（第 2503 行调用 fetcher），再到 `src/market_analyzer.py:452` 的 `_get_main_indices`（第 460 行调用 Manager）。
- 当前安装 SDK 为 `tushare 1.4.29`，来自 `.venv/lib/python3.12/site-packages/tushare-1.4.29.dist-info/METADATA`。
- `.venv/lib/python3.12/site-packages/tushare/pro/client.py:33` 的 `DataApi.query` 接收通用 `api_name/fields/**kwargs`；第 48 行直接读取响应 `data['fields']`，第 50 行以这些列构造 DataFrame；第 54–55 行通过 `__getattr__` 与 `partial(self.query, name)` 动态提供接口。
- 安装包全文检索 `index_daily|INDEX_DAILY` 无命中（退出码 1）；SDK 不包含该接口的本地字段声明。存量 fetcher 第 550 行的字段注释属于通用日线标准化，不能作为 `index_daily` 返回身份字段的独立证明。

因此当前 SDK 本地证据不能确认 `index_daily` 返回 `ts_code/trade_date` 字段；这不表示接口没有这些字段。frontier 第 74 行明确要求不能确认返回身份列时退回待拆分；本叶按此前置要求停止，未编造响应字段、未省略身份验证。

协调者随后通知：已于 2026-09-28 只读核对[官方指数日线接口文档](https://tushare.pro/document/2?doc_id=95)，输出明确包含 `ts_code/trade_date`，输入包含 `start_date/end_date`。本叶未自行访问该网页；这份新增前提由协调者在新 Task 与新会话记录并继续实施。协调者明确要求本会话在当前阻塞检查点终止，不新增实现。

## 改动与验证

- `data_provider/tushare_fetcher.py` 会话前后均为 1354 行，本叶未改动；新增 helper 与测试均未创建。存量工作树改动和其他代理改动保留。
- 本叶只新增本证据文件；未写 Spec、任务台账、manifest、registry、DSA CHANGELOG 或其他路径。
- 只执行本地源码、SDK 元数据和调用链检查；未执行定向 unittest、lint 或编译，因为尚未实施代码。未运行全包测试、构建、数据库、镜像、部署、真实 Provider 或网络请求。
- 已完成命令：`rtk rg -n 'index_daily|INDEX_DAILY' .venv/lib/python3.12/site-packages/tushare`（无命中），以及本地短输出 Python 读取 SDK/query/调用链定位。未启动后台进程，全部命令已退出。

## 恢复条件

新 Task 应记录协调者取得的官方字段前提，并在新会话实施指定 helper 与实际 `get_main_indices` 接缝的 mock 定向测试。本叶禁止网络和真实 Provider 调用，不能自行扩大执行范围。测试通过也不授予实时性、收盘时点、真实权限或历史完整性。
