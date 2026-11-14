# 个股新闻真实读取验收

## 结论

2026-11-09 21:08（北京时间），在实际市场数据页面选择「招商银行 · 600036.SH」「最近 3 天」，通过现有 Server、DSA 和 HiThink 同花顺来源读取到 5 条真实新闻。来源调用 1 次，错误为空；显示为「部分覆盖」，保留当前一页与条数限制。1440、1024、768、390 四种宽度验收通过。

后续按用户要求增加分页，真实所选窗口已能读取 4 页、16 条，见[个股新闻分页实施与验收](2026-11-09-market-news-pagination.md)。下文保留首屏阶段的历史现场，不作为分页后的当前上限。

应用读取链路本身可执行。此前贵州茅台、宁德时代以及美股样例被拒绝，原因分别是超出当前准入标的范围或准入已过期，不能据此判断整个新闻链路不可用。本轮保留当前准入和路由，未更改应用读取代码、业务数据或部署配置。

## 原因与有效范围

通过只读 SQLite 查询核对 `thesis-ledger-dev-dsa-1` 中 `/app/data/stock_analysis.db` 的 `thesis_ledger_route_admission_v3`，并与实际 API 结果对照：

- HiThink 个股新闻目标为 `hithink / hithink-news-stock-timeline`，当前准入标的为 `600036.SH`，记录版本为 6。
- 日期范围为 2026-11-03 至 2026-11-13；有效期截止北京时间 2026-11-13 21:59:21。准入范围和有效期会随受控操作变化，此处记录的是验收现场。
- `600519.SH`、`300750.SZ` 不在该有效记录的标的范围内；有效路由不表示任意股票和日期均获准。
- Yahoo 的 `NVDA.US` 新闻准入已于 2026-10-29 15:42:49（北京时间）到期。未扩展其范围或续期。
- 以招商银行最近 7 天查询时，起点可能早于 2026-11-03；本次实际采用最近 3 天，完整落在既有范围内。

相关所有权代码为 DSA 的 `thesis_ledger_news_gateway.py`、`thesis_ledger_current_data_execution.py` 与 `thesis_ledger_route_admission_v3.py`。没有绕过范围谓词、扩大标的集合、延长有效期、切换来源或新增凭据。

## 真实响应

- 页面：`http://127.0.0.1:5173/market-data`。
- 请求：`POST /api/market-data/news`；`instrument={market:CN, assetType:STOCK, symbol:600036.SH}`，`limit=5`，`requestBudgetMs=15000`。
- 发布时间窗口：北京时间 2026-11-06 21:08:08 至 2026-11-09 21:08:08。
- 抓取时间：北京时间 2026-11-09 21:08:09。
- 来源：HiThink 同花顺；策略修订 `effective:194`；`upstreamAttempts=1`，`errors=[]`。
- 覆盖：来源检查 6 条、返回 5 条、5 组来源证据；`complete=false`、`truncated=true`。保留 `pagination_truncated` 与 `timeline_window_not_exhaustive`，没有将有限结果解释为完整历史。

示例包括同花顺返回的「招商银行泉州分行被罚90万，涉贷后管理不到位等」，来源发布时间为北京时间 2026-11-09 18:12:48，链接为 `https://news.10jqka.com.cn/20261109/c681621107.shtml`。完整的五条响应摘要与截图保存在下述本地产物中。

## 浏览器流程与复验

新增可重复脚本：`apps/desktop/scripts/check-market-news-live.cjs`。脚本访问实际页面、搜索真实目录、选中标的并点击读取；新闻 POST 直接访问真实服务，未使用响应替换或合成样本，其他写请求被阻断。

从主仓执行：

```sh
PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
MARKET_NEWS_LIVE_OUTPUT=/Users/yzin/code/thesis-ledger-workspace/thesis-ledger/.recovery-artifacts/market-news-live-20261109 \
  /Users/yzin/.volta/tools/image/node/26.13.0/bin/node apps/desktop/scripts/check-market-news-live.cjs
```

可配置 `MARKET_NEWS_LIVE_SYMBOL`、`MARKET_NEWS_LIVE_BASE_URL`、`MARKET_NEWS_LIVE_OUTPUT` 和 `MARKET_NEWS_LIVE_CHROMIUM_EXECUTABLE`；默认标的为 `600036.SH`，默认使用本机 Edge。复验时仍须满足实际准入，脚本不会自动写入准入或启用来源。

验收断言：目录名称与完整代码回显；默认最近 3 天；点击前无新闻调用；正式请求参数正确；真实响应有来源、有上游尝试且存在新闻；五条标题与链接逐项对应；中文来源和覆盖限制可见；四种宽度均保留五条记录、详情抽屉等宽且无横向溢出；窄屏内部可滚到最后一条；关闭返回原页面。

| 视口宽度 | 抽屉宽度 | 新闻条数 | 结果 |
| --- | --- | --- | --- |
| 1440 | 960 | 5 | 通过 |
| 1024 | 960 | 5 | 通过 |
| 768 | 752 | 5 | 通过 |
| 390 | 374 | 5 | 通过 |

整个响应式验收只发起一次真实新闻查询；调整视口复用已取得的响应。其他写请求为零，浏览器异常为零。脚本首次运行在异步目录返回前计数，补充等待真实选项后完成全部断言；首次未调用新闻来源。

已执行 `node --check apps/desktop/scripts/check-market-news-live.cjs` 与 `git diff --check`，均通过。本轮仅增加真实验收脚本和证据，应用代码及依赖未变，复用[查询界面验收](2026-11-09-market-query-entrypoints.md)中对应输入的类型、构建与包级测试证据，未重复运行全量测试或构建。

## 产物与证据边界

产物目录：`.recovery-artifacts/market-news-live-20261109/`，含 `1440.png`、`1024.png`、`768.png`、`390.png`、`390-news-bottom.png` 和脱敏的 `results.json`。已人工查看桌面、窄屏顶部和窄屏底部截图。

此证据证明当前已获准范围内的真实新闻链路与实际页面展示；不证明其他股票、其他日期、其他来源或完整新闻历史。外部网页工具未能直接抓取同花顺原文，浏览器验证的是接口返回链接与页面链接地址一致，未将其声明为原文网页独立可访问验证。

本轮无 Docker 状态变更，仅执行只读检查；不声明镜像更新。脚本与文档未提交；无需数据库回滚或运行配置恢复，删除新增验收脚本和本记录即可撤销本轮仓库增量，不影响现有业务数据。
