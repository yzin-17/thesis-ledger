# 个股新闻分页实施与验收证据

## 结论与范围

2026-11-09 21:42，北京时间，招商银行 `600036.SH` 最近 3 天在实际抽屉通过「加载更多」读取 4 页，依次返回 5、5、5、1 条，共 16 条、无重复，最后显示「所选时间范围内的来源新闻已加载完毕」。前端 1827 项包级测试、后端最终 63 项定向与独立 HTTP、3 项准入保护测试、适用工程门禁及四种宽度浏览器验收通过。

规格：[个股新闻按所选范围分页读取](../specs/2026-11-09-market-news-pagination.md)；任务：[归档任务](../archive/tasks/2026-11-09-market-news-pagination.md)。原范围内的其他来源仍保留实际分页限制；本轮不证明全网新闻或来源未提供的历史完整性。共享工作区已有路由、来源、规则监测等修改保留，三仓改动均未提交。

## 根因与实现

- HiThink 官方 [个股分时新闻](https://fuyao.aicubes.cn/docs/api-reference/news-stock-timeline/) 声明首屏 `offset=first`、后续原样回传 offset，单页 1–100 条。原适配器固定 first 并丢弃 offset，公共执行器统一拒绝 cursor；首屏取 `limit+1` 后只投影 limit 条，还会在直接使用来源下一页时漏掉末条。
- DSA 单页取数现在与请求条数一致，保留 offset；对外返回不透明继续点。继续点绑定标的、时间、条数、数据库、来源、策略及凭据/配置代次，30 分钟有效，容量 512 条、总量 8 MiB；单项 256 KiB、继续历史最多 10000 个 offset，达到边界明确失败，不伪装耗尽。
- 继续点可重复使用以支持失败重试；无效、过期、跨条件、来源变化和控制撤销在新取数前拒绝。重复 offset、未知时间、时序异常与源失败不会被解释为完整结果。
- Desktop 使用 `useInfiniteQuery`，固定首次请求窗口，只在「加载更多」或「重试加载」时读取下一页；按条目 ID 和规范 URL 用 `es-toolkit@1.51.0` 的 `uniqBy` 去重，保留首次条目。合并视图单独投影，未扩大单页合同上限。
- 个股与快讯复用同一客户端追加消费；当前只有 HiThink 提供本轮验证的后续游标，其他来源不凭空生成分页。条件改变、关闭时取消请求，下一页失败保留已有页；加载圈覆盖可见列表区域。

## 时间窗口收敛与完整性边界

最初按「直到 `has_more=false`」遍历完整来源历史。实测超过 20 页后持续返回所选三天以前的记录，显示页已为空；稳定预览中继续到 150 页仍未源结束，验收主动失败，未把这次尝试标为通过。

最终将适配器按当前个股时间线语义收敛到所选窗口：逐页校验页内与跨页时间非递增；全部已读时间已知且无时序异常、末条严格早于所选起点时停止，或来源明确无后续页时停止。闭区间起点本身仍被包含，时间未知和逆序时不使用提前结束条件。

官方文档确认 offset 翻页，但没有声明全历史排序或完整性保证；窗口结束依赖适配器的时间线倒序契约和逐页观测校验。此处的「加载完毕」表示当前来源时间线的所选范围读取结束，不认证来源没有遗漏新闻。未来若该来源改变排序，已观察到的异常保留为 `timeline_order_unknown`，不能认证完整覆盖。确定性测试覆盖未知时间、逆序、空页、重复 offset 和边界。

## 本轮代码所有权

- DSA：`data_provider/hithink_news.py`、`data_provider/hithink_news_pagination.py`、`data_provider/thesis_ledger_sources/hithink_news.py`、`src/services/thesis_ledger_news_execution.py`、`src/services/thesis_ledger_news_pagination.py`、`src/services/thesis_ledger_news_query.py`、两份同花顺新闻测试、测试范围登记及 `docs/CHANGELOG.md`。
- Desktop：`MarketNewsSearch.tsx`、`MarketNewsFeed.tsx`、`MarketNewsPages.tsx`、`useMarketNewsPages.ts`、`market-news-pages.ts`、`MarketNewsResult.tsx`、对应 UI/投影测试、真实分页浏览器脚本及本主题文档。Server、Mobile 和共享 UI 组件未作本轮生产修改。
- infra：`hithink-news-pagination-admission.mjs`、`hithink_news_pagination_admission.py`、其保护测试与 README 操作说明。

## 本地验证

| 检查 | 命令或输入 | 结果 |
| --- | --- | --- |
| 初始后端定向回归 | DSA `.venv/bin/python -m pytest -q tests/test_hithink_news.py tests/test_hithink_news_pagination.py tests/test_thesis_ledger_news_execution.py tests/test_thesis_ledger_news_gateway.py tests/test_thesis_ledger_news_feed.py` | 71 项通过 |
| 最终窗口收敛回归 | DSA `.venv/bin/python -m pytest -q tests/test_hithink_news.py tests/test_hithink_news_pagination.py tests/test_thesis_ledger_news_execution.py tests/test_thesis_ledger_news_gateway.py tests/test_thesis_ledger_news_http_acceptance.py` | 63 项通过，包含独立 HTTP 及关闭回收 |
| DSA 工程门禁 | `.venv/bin` 加入 PATH 后执行 `./scripts/ci_gate.sh syntax`、`flake8`、`deterministic` | 语法、关键 flake8、能力边界、运行打包输入、登记清单、代码与 yfinance 确定性检查通过；最终源文件改变后已重跑 |
| Desktop 定向测试 | `pnpm exec vitest run test/market-news-pages.test.ts test/market-news-sheet.ui.test.tsx test/market-news-api.test.ts test/market-news-time-range.test.ts` | 4 文件、26 项通过 |
| Desktop 包级测试 | 在 `apps/desktop` 执行 `pnpm test` | 287 文件、1827 项通过 |
| 类型与构建 | 主仓依次执行 `pnpm --filter @thesis-ledger/schemas build`、`pnpm --filter @thesis-ledger/api-client build`、`pnpm --filter @thesis-ledger/desktop build` | 通过；先前并行规则监测引入新导出，重建依赖后消除陈旧 dist 错误 |
| 静态门禁 | 六个分页生产文件 `pnpm exec eslint ... --max-warnings=0`，主仓 `node scripts/check-boundaries.mjs`、`node scripts/check-accessibility.mjs` | 全部通过，无障碍静态检查 13 项通过 |
| infra 保护测试 | `.venv/bin/python ../thesis-ledger-infra/scripts/hithink_news_pagination_admission.test.py`，Node 入口语法检查 | 3 项及语法通过 |
| 三仓 diff | 各仓 `git diff --check` | 通过 |

ESLint 输入为市场数据目录内 `MarketNewsSearch.tsx`、`MarketNewsFeed.tsx`、`MarketNewsPages.tsx`、`useMarketNewsPages.ts`、`market-news-pages.ts`、`MarketNewsResult.tsx`。构建与包级前端测试之后未修改其生产输入，因此未重复构建。

新闻子系统加额外能力与凭据回归从 `tests/data-test-scope.json` 选择正式保留的 `news` 测试及能力注册表、HiThink 凭据回归，结果为 1231 通过、5 失败。其中四项 `test_thesis_ledger_hithink_credential_admission_runtime.py` 的报价 mock 只接受 hithink，而当前目录另读 tickflow，失败栈位于账号诊断；本轮未修改这些生产文件或该测试。另一项独立 HTTP 缺少宿主机已声明的 `croniter==7.0.0`，使用 `uv pip install --python <DSA .venv/bin/python> croniter==7.0.0` 补齐后，独立 HTTP 复测及最终 63 项回归通过。目标容器原本已含 croniter。四项既有报价失败没有算作通过，也没有用 ignore 或改阈值掩盖。

## 正式运行态更新与准入

执行目录均为 `thesis-ledger-infra`：

1. `./scripts/sync-code.sh dsa`，兼容预检通过，退出 0，仅同步 DSA 并重启其目标容器；首次日志 `/tmp/news-pagination-sync-dsa.log`。
2. `node scripts/hithink-news-pagination-admission.mjs plan`，返回原记录版本 6 与摘要 `94e31a000fd0f4c22efe13f42817bf2a333960f5d816c41bd3474170ea4234e5`。
3. 使用上述版本及摘要执行 `apply`，真实读取来源前后两页并核验 offset 前进；记录升级为 7，证据摘要 `bf926296590afc41abb79da8e3bb4dcf091193a5b87dc0b2de67290b29f84aa2`。随后 `verify` 独立只读回验通过。
4. 时间窗口结束逻辑收敛并通过局部及工程门禁后，再执行一次 `./scripts/sync-code.sh dsa`，退出 0；日志 `/tmp/news-pagination-sync-dsa-final.log`。重新 `verify` 通过，准入仍为版本 7，没有再次写入。

升级适配修订为 `hithink-stock-news-offset-v2 / hithink-stock-timeline-offset-v2`；准入仍仅 `600036.SH`，日期仍为 2026-11-03 至 2026-11-13，到期时间仍为 `2026-11-13T13:59:21.577510+00:00`。凭据、路由和业务历史保持。原记录与原证据在新证据链中完整保留，SQL 在事务中核对旧版本及完整摘要。

两次快更均保持同一 DSA 镜像 `sha256:b67fd33335c64e4483904a9a7574e9c389b4fe3f6840604e45aed10ae3ae53ab`，没有镜像构建或依赖变更。本次为容器可写层代码同步，不代表镜像发布；容器重建需通过正式更新入口从当前源码构建。若回退到旧适配代码，版本门禁会拒绝新的分页准入，不能静默绕过门禁或直接恢复旧行。

## 实际页面验收

脚本为 `apps/desktop/scripts/check-market-news-pagination.cjs`。使用实际构建预览 `http://127.0.0.1:5198` 代理真实 Server，避免共享 Vite 热更新打断长时间分页；早期共享开发页在验收中关闭了抽屉，单独记录为失败，未作为通过证据。

```sh
PLAYWRIGHT_MODULE=/Users/yzin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
MARKET_NEWS_PAGES_BASE_URL=http://127.0.0.1:5198 \
  /Users/yzin/.volta/tools/image/node/26.13.0/bin/node apps/desktop/scripts/check-market-news-pagination.cjs
```

最终固定窗口为北京时间 2026-11-06 21:42:02 至 2026-11-09 21:42:02，策略为 `effective:194`。首屏真实读取，随后注入一次下一页 HTTP 503（仅该次未到真实来源），验证首页保留；点击「重试加载」使用完全相同的原窗口和原游标，后续均为真实来源响应。

| 页码 | 返回条数 | 后续页 | 窗口完成 |
| --- | --- | --- | --- |
| 1 | 5 | 有 | 否 |
| 2 | 5 | 有 | 否 |
| 3 | 5 | 有 | 否 |
| 4 | 1 | 无 | 是 |

总计检查 20 条来源记录，按闭区间显示 16 条，去重后仍为 16；所有展示发布时间在原窗口内。末页已走过起始时间，分页缺口消失并显示完成提示。不是把没有游标的任意来源误判为完成。

1440、1024、768、390 宽度的抽屉分别为 960、960、752、374px；无横向溢出。人工查看桌面与窄屏末尾截图，16 条列表可滚动，最后完成提示可见。浏览器异常为零，其他业务写请求为零，关闭恢复原页面。

产物在 `/tmp/market-news-pagination/`，含四种宽度截图、`390-complete.png`、`results.json`；最终日志 `/tmp/market-news-pagination-final.log`。脚本有 150 页验收预算，达到预算会失败而非宣称完整。

## 最终一致性检查

AC1–AC7 均有实现与适当证据；实际来源、单页合同、合并展示、时间窗口和重试语义一致。当前准入范围与有效期保持，已有冻结材料和共享改动保留，没有新增 TODO 或剩余分页义务。通过结论仅覆盖本规格的个股时间线分页，四项既有报价 mock 失败及其他来源的分页不在本次通过范围内。

## 分页正常状态的展示修正

2026-11-09 23:26，按实际页面反馈补充校正展示语义：后端以 `partial` 和 `pagination_truncated` 表示仍有下一页，原共享结果组件直接渲染成「部分覆盖」「覆盖范围有缺口」，使正常分页看起来像来源或订阅受限。

`MarketNewsPages` 现在向 `NewsResult` 传递 `hasMore`。提供加载操作且仍有下一页时，仅将临时分页原因从当前展示中排除；没有其他缺口、错误或未知时间时不展示覆盖状态徽标，计数改为「已加载 N 条」。真实限制继续显示。未传该上下文的单页详情/研究消费者沿用原展示；原始响应和覆盖事实不变。空页仍有后续时说明可继续加载，避免被读作整个范围没有新闻。

验证：`market-news-sheet.ui.test.tsx`、`market-news-pages.test.ts`、`market-news-api.test.ts` 共 18 项通过，新增正常分页、真实未知时间、无游标截断及空页提示断言；类型检查、Desktop 构建、局部 ESLint、边界、13 项无障碍静态检查与 diff 检查通过。新增无游标截断样本首次遗漏了 `truncated=true`，补齐与实际响应一致的标记后通过。

增强同一浏览器脚本，首屏明确断言「已加载 5 条」可见、「部分覆盖」和覆盖缺口警告均不可见；保存四种宽度首屏截图后，继续受控失败恢复和真实分页。使用当前构建预览 `http://127.0.0.1:5198`，查询窗口为北京时间 2026-11-06 23:26:57 至 2026-11-09 23:26:57，结果仍为 4 页、16 条，正常结束，浏览器异常与其他写请求均为零。

本次截图与回执在 `/tmp/market-news-pagination-display/`，含 `1440-first-page.png`、`1024-first-page.png`、`768-first-page.png`、`390-first-page.png`、最终四种宽度截图和 `results.json`。已人工查看桌面和窄屏首屏，正常分页不再出现覆盖缺口警告。仅变更 Desktop 展示、回归测试、验收脚本和本文档，不涉及 DSA、API、准入或 Docker 状态变更。

## 新闻条目展示精简

2026-11-09 23:44，按用户要求将共享新闻列表收敛为标题、来源与发布时间。移除列表头的独立证据计数、每条记录的来源首次可用/抓取时间，以及列表概况的抓取时间；保留已加载条数、查询范围、必要限制和分页操作。只修改 `MarketNewsResult.tsx` 的展示，原始响应、历史证据及分页统计计算保持。

复用新闻 UI、分页投影和 API 的 18 项定向测试，全部通过；类型与 Desktop 构建、局部 ESLint、diff 检查通过。增强真实浏览器脚本，明确断言结果区没有上述技术元数据，同时逐项核对真实标题链接、来源与发布时间；同一真实响应覆盖 1440、1024、768、390 四种宽度，全部通过，仅一次真实新闻调用。人工查看桌面和窄屏截图，布局正常。

本次实际页面使用当前构建预览 `http://127.0.0.1:5198`，产物为 `/tmp/market-news-list-simple/`，日志 `/tmp/market-news-list-simple.log`。验收后关闭临时预览；宿主机正常开发入口和当前源码继续有效。没有新增后端、准入或 Docker 变更，未重复运行已证明无关的全仓验证。
