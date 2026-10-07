# M3 指数身份与行选择最终 Review 证据

日期：2026-09-28。任务：`M3-index-review-0928`。状态：`worker_done`。结论：限定源码与消费链路未发现需要修复的代码问题；这只表示本 Review 叶完成，不表示全 M3、AC20 或整体验收通过。

## 检查边界与基线

主仓 HEAD：`fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`；DSA HEAD：`f497b6dad0e5519bbbcce1e51a2889d2c2634009`。读取时主仓 537 个、DSA 160 个 dirty 条目。所有既有 WIP 保留，只创建本文，没有 source/test/config/Spec/Task 修改，没有 reset、stage、commit、clean 或 fetch。已读取实际两仓 AGENTS、RTK、Codex 与 codex-cost 指令；作为最终只读叶直接执行，没有创建子代理。Context Mode 在本会话没有可调用工具，使用 Python 有界提取。

依据主 Spec §3.3（第 76–82 行）、AC20（第 506 行）及 DSA 能力 SSOT 第 228/230 行的 R02.11/R02.13。Review 两个新 helper、两个新测试，以及两个存量 fetcher 仅 `get_main_indices` 的实际源码与相关窄 diff；未评审整个大型 fetcher 的其他 WIP。

## 代码与消费结论

- 新浪 helper 第 12–21 行只接受 DataFrame、单一“代码”列及完整字符串精确匹配；匹配不是唯一行时拒绝，不做数值别名、错市场、大小写转换、包含匹配或首行兜底。AkshareFetcher 第 2003–2011 行保持六指数映射顺序，第 2023–2048 行保留原字段、单位和振幅计算。单个重复身份被拒绝时其他唯一指数仍保留；空响应返回空列表，源异常返回 None。
- Tushare helper 第 10–17 行要求八位 ASCII 字符串与有效日历日期，第 29–46 行完整检查每行请求 ts_code、窗口两端及日期唯一，坏行拒绝整个指数；按最大日期返回原始位置行，不依赖 SDK 返回排序或 DataFrame 索引、不拼接多行字段。Fetcher 第 819–836 行保持六指数映射、请求顺序和原五日窗口，第 843–858 行保持字段以及 amount 千元转元；第 860–872 行仍逐指数隔离失败，无成功结果时返回 None。
- DataFetcherManager 第 2486–2510 行保留 TickFlow 优先与既有 fetcher 顺序，仅非空返回成功；空列表、None 或异常沿原 fallback，全部失败返回空列表。MarketAnalyzer 第 460–492 行按原字段构造 MarketIndex，第 435 行写入 MarketOverview；第 804 行序列化、第 1113–1136 行生成指数表格、第 1280–1285 行参与市场灯号、第 1425–1427/1663–1687 行进入复盘呈现。Agent 工具 `src/agent/tools/market_tools.py` 第 33–45 行仍保留空结果错误与成功原列表包装。
- 新测试直接调用实际 fetcher 接缝，新浪还通过实际 Manager → MarketAnalyzer 校验成功与拒绝；Tushare 覆盖顺序无关、原行/原响应、映射字段、窗口、坏日期/身份/列、重复日期和其他指数保留。没有发现契约漂移、来源准入扩大或将请求本机时间新解释为来源时点的变更。既有“实时行情”泛化注释不构成本轮新增实时能力，日线包装仍须保持真实实时性待验证。

## 复用验证与未执行项

已读取 `2026-09-28-m3-index-local-regression.md`，实际重新计算六个源码/测试 SHA 与其最终记录全部一致：复用 46 项 unittest + 41 项 pytest，共 87 项通过、0 skip、0 网络尝试；四个新增文件完整 flake8 与两个存量 fetcher 关键规则 flake8 通过。这里的 SDK 调用为 mock 接缝，不是真实 Provider。未重跑测试、lint、build、runtime、数据库或浏览器。

协调者提供最终稳定 checkpoint 的 Server 1736 通过/88 跳过、typecheck/build、59 TS 严格 lint 与 HEAD 尺寸检查完成信息；本文仅记录前置条件，不将这些范围外结果重复审查或扩大为指数真实准入。

读取 `2026-09-28-r02-13-index-row-implementation.md` 第 9 行记录的官方接口声明：`https://tushare.pro/document/2?doc_id=95` 支持请求 ts_code/start_date/end_date，返回 ts_code/trade_date，日期 YYYYMMDD；安装 SDK 动态接口无本地字段声明。该声明只支撑字段校验，不证明权限、真实响应、时点或实时性。本叶没有联网或真实 Provider 调用。

## 目录状态对齐建议

非代码缺陷：DSA `docs/thesis-ledger-source-capabilities.md` 第 228/230 行仍为实施前描述，未记录本轮局部身份/行选择完成。请协调者在原 R02.11/R02.13 行内更新输出状态并引用本文及组合回归证据：R02.11 写明“完整代码唯一精确身份选择和现有消费者离线接缝完成；source/as-of/交易阶段与真实 G0-M 待验证”；R02.13 写明“精确身份、合法窗口日期、唯一日期与最大日期原行选择、五日窗口和千元转元离线验证完成；日线收盘包装，真实权限/时点/G0-M 待验证”。保持原 116 ID 顺序、来源与能力分类，不新增 Source 准入或 PIT/as-of 字段，不把 worker_done 改成真实准入通过。

## 稳定输入 SHA-256

以下为本叶实际读取与最终复核的 DSA 输入；前六项与组合回归证据相同。消费者为只读当前身份，未声称本叶重跑其测试。

| 文件 | SHA-256 |
| --- | --- |
| `data_provider/sina_index_identity.py` | `c65f98eb974c98d7b3c364ff8193aa3e9cd8e0f45fca33cfdc5b3c21ad6204ed` |
| `data_provider/akshare_fetcher.py` | `abb60ee7c54661f53e81babf6186bf183aa5aae4d455e3e8d5c820cc09da566c` |
| `data_provider/tushare_index_daily_rows.py` | `25f13b0abaa406b53c7ba8ff47e18022dbf300a5240ebecf7ea2d1fcd0f3dacc` |
| `data_provider/tushare_fetcher.py` | `fe0d7c99e91433571d1bbd496c734511854e8e399db3d89497f8a107a746919f` |
| `tests/test_sina_index_identity.py` | `bb3d82cf6e6549ee44173336af1d15eacca4c1cea22d7380d0e74cb2051461f9` |
| `tests/test_tushare_index_daily_rows.py` | `8ee91f6d36ada53b9b4411e9b174e8e478ce7893ce1bf3ccc2512bebc822e21b` |
| `data_provider/base.py` | `a7432147abd6e76ba71105769870c37bb9251d05f5d80e19ddf8634f7e544181` |
| `src/market_analyzer.py` | `6c8680fbbd64c8638e5ea016844d48baf4fd3217862bd9aeb8f0292f7b2a9167` |
| `src/agent/tools/market_tools.py` | `4af4d30719c47e559b8334cce32d7520351e6c2bfb1857761a102b383ba500fc` |

## 交接

本叶没有代码 finding；无需修复委派。唯一写入为本文，全部命令已经退出，未启动后台进程，会话不复用。真实 Provider、身份可用性、来源时点、交易阶段、历史完整性、账号权限、业务 Source 准入、目标 Docker/Server/Worker、浏览器与整体 M3 门禁仍保持未验证。撤销本叶仅删除本文，不回退任何 DSA WIP。
