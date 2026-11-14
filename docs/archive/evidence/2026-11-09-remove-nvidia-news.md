# NVIDIA 官方新闻删除验收

## 变更与数据保护

DSA 删除 `data_provider/nvidia_news_rss.py`、`data_provider/thesis_ledger_sources/nvidia_news.py`、`tests/test_nvidia_news_rss.py`，清理 `src/services/thesis_ledger_capability_sources.py` 注册、来源集合断言及 `tests/data-test-scope.json` 对应项。Desktop 清理 `MarketNewsResult.tsx` 来源标签和 `MarketNewsSheet.tsx` 专属用途说明，组件结构和交互保持。

通过 `PUT /api/market-data/policy`、`expectedRevision: 193` 创建版本 194，仅删除美国股票 `NEWS_SEARCH` 中的 `nvidia-news / nvidia-newsroom-rss` 备用目标，保留 Yahoo 首选。只读回查确认 `syncState=applied`、`effectiveStale=false`，当前 routes 与 effectiveProjection 均不含该来源。版本 193 历史 routes 过滤此目标后，与当前 117 条路由进行对象键规范化比较，结构及目标顺序全部一致。历史版本、新闻和冻结记录保持原样，未直接操作数据库。

## 本地验证

在 `daily-stock-analysis` 执行：

- `.venv/bin/python -m pytest -q tests/test_thesis_ledger_provider_runtime.py tests/test_thesis_ledger_inventory_export.py`：27 项通过。
- `.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py`：通过。
- `.venv/bin/python scripts/check_data_runtime_contract.py`：通过。
- `git grep -n -E 'nvidia-news|nvidia_news' -- api src data_provider tests scripts`：无引用。

在主仓及 Desktop 执行：

- `pnpm exec vitest run test/market-news-api.test.ts test/market-news-sheet.ui.test.tsx test/market-news-ui.test.tsx`：实际匹配前两个文件，9 项通过；第三个路径未匹配测试。
- `pnpm --filter @thesis-ledger/desktop build`：通过，保留既有大包体积警告。
- `pnpm exec node scripts/check-boundaries.mjs`：通过。
- 两仓本任务文件 `git diff --check`：通过。

本地 `.venv/bin/python` 初始链接失效，使用 `uv python install 3.12` 恢复 Python 3.12.16 后通过，未改仓库依赖。首次政策写入后的比较脚本因内存对象额外含 `enabled: undefined` 而断言失败，API 写入实际成功；随后仅只读回查并规范化比较通过，没有重复写入。

## 正式运行入口与边界

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。PATH 选择本机 Node 26.13.0、Volta、Homebrew 和 Docker 工具，无额外业务开关。

- `./scripts/sync-code.sh all`：退出 1；宿主 Server 构建被其他任务未跟踪文件 `apps/server/test/quality/data-quality-postgres.integration.test.ts` 缺少 `@nestjs/testing` 阻断，未进入容器同步，未修改该文件或依赖。
- 核对执行面后采用最小目标 `./scripts/sync-code.sh dsa`：退出 0，完成 DSA 同步和重启。镜像保持 `sha256:86ace638a1fb6072e125ccd1fe9a9a0b5b469eed033cec8a668e3c671de640ed`；更新只存在容器可写层，重建后须重新同步或完整更新。

本任务未改 Server 源码；Desktop 实际页面由宿主 Vite `http://127.0.0.1:5173` 提供，其构建及浏览器已独立验证，因此无须为本次来源删除同步未修改的 Server/Worker。未声称 Server 镜像或打包客户端已更新。

独立读取 `http://127.0.0.1:3000/api/market-data/routes/capabilities?contractVersion=3`：`status=complete`，448 条目录项，无该来源引用。政策 194 已同步生效。

## 浏览器与最终审查

Playwright 使用本机 Microsoft Edge 访问上述 Vite 页面和目标 Docker API；在 1440、1024、768、390 四种宽度均确认：数据源页面不含 NVIDIA 官方新闻、总数为 29；新闻弹窗显示新说明，左右边界在视口内，Escape 关闭正常。未提交新闻查询或调用外部新闻源。

临时截图：`/tmp/remove-nvidia-news-{width}.png`，不进入 Git。浏览器结论仅覆盖本次来源删除、说明与弹窗边界。

AC1–AC3 均已覆盖。两仓已有其他未提交改动，全部保留；本任务未创建 Git 提交。
