# 权限检查限频暂停与接续验收

规格：[权限检查限频暂停与接续](../specs/2026-11-10-provider-access-rate-limit.md)。日期：2026-11-10。

## 修正与验证边界

原循环逐功能请求，即使已限频仍继续消耗本轮预算；下一轮又从首项开始。现在首次明确限频后暂停剩余请求，已确认项目保留；重复操作在60秒本地冷却内复用原记录，不更新检查时间。冷却结束后需手动补查，仅请求待确认项。Tushare 每轮最多6次、TickFlow 最多14次的上限保持，预算用尽也能分轮接续。

当前配置的冷却由长期记录恢复，草稿使用既有有界缓存；相同已保存输入的保存流程也会复用冷却结果。凭证、端点与等级改变不会复用旧配置结果。同一服务进程内同源检查互斥，异常后释放执行位置。没有自动重试、睡眠后继续请求或新增公开协议字段。

真实配置与业务数据只读，没有用真实 Key 增加权限检查；隔离样本的接口返回不作为供应商实际成功证据。60秒是本地退避下限，不保证上游配额已恢复。Desktop 当前由宿主 Vite 提供，其生产构建单独完成。

## 自动验证

- DSA：`.venv/bin/python -m pytest -q tests/test_account_access_progress.py tests/test_tushare_account_access.py tests/test_tickflow_account_access.py tests/test_tickflow_free_history.py tests/test_configured_market_routes.py tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_inventory_export.py tests/test_thesis_ledger_provider_runtime.py`，126项通过。
- Desktop：在 `apps/desktop` 执行 `pnpm exec vitest run test/provider-account-access.test.tsx test/provider-credentials-sheet.test.tsx src/features/market-data/account-level.test.tsx`，18项通过。
- Desktop：`pnpm --filter @thesis-ledger/desktop build` 通过，保留现有大块体积提示。
- 主仓：`pnpm exec node scripts/check-boundaries.mjs` 通过。DSA：能力边界、运行时输入门禁及 `git diff --check` 通过。

新增12个受控测试覆盖：首个限频即停、59秒重复为零请求、重启和启停不绕过冷却、60秒后补查、已确认及明确拒绝的时间保持、预算分轮推进、凭证/端点/等级隔离、草稿及保存复用、并行拒绝与异常释放。126项统计包含新增12项及原有114项相关回归。

首次新增测试因数据测试清单未登记而被门禁拒绝，补入既有清单后运行。初版断言按16项能力误期望一轮检查全部，实际来源每轮上限为6次；保留上限，调整为多轮接续并验证不会重复已确认项。最终全部通过，未放宽门禁或增大请求预算。

## 浏览器验收

Edge/Playwright 打开 `http://127.0.0.1:5173/market-data`，GET 使用真实目录与来源摘要；仅将 Tushare 权限状态替换为受控的16项样本：1项可用、1项实际限频、11项限频后未请求、3项等级未包含。

1440、1024、768、390 四宽通过：实际限频与暂停标签分别显示，冷却和补查文案正确，保留1/16结果，正文可滚动，底部操作栏可见，弹窗在视口内且无页面横向溢出，Escape 关闭正常。拦截全部非 GET，写请求为零；已人工检查1440和390截图。另复用前轮四宽长期记录与底部移除取消验证，通过。

## 完整镜像与实际运行态

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`；正式入口：`./scripts/update.sh dsa`；退出码0。采用默认保留数据模式、现有环境文件及恢复挂载，不清库、不打开 fixture 或放宽门禁。Server/Worker 无运行代码或公开协议改动，不在本次镜像目标中。

- 更新前镜像：`sha256:1853a4df3cf957422f6157a8a35be24ccd61a2928f0cd94534009dfb30d0f163`。
- 更新后镜像：`sha256:10a0f36f11d8ffe067d777d29d80634f960f0c7bbe0379e2eeb1e5b5c1e200b2`。
- 新容器：`69c17377129f74d92764bd64184a2296a0957b653698567524e0695f634518f2`，创建时间 `2026-11-09T17:09:00.718334672Z`（北京时间11-10 01:09:00），健康。

独立只读验证9个关键文件的 SHA-256，涵盖新接续 helper、权限编排、持久记录、配置保存、来源和逐路由门禁，全部与当前源码一致；对应文件没有可写层覆盖。挂载只有 `/app/data`、`/app/logs`、`/app/reports`，没有代码挂载，修正已在镜像中。

镜像内以 `python -B` 运行无网络、无数据库写入的受控计算，验证冷却识别、复用已确认项原时间及首个限频后停止。此计算证明实际打包模块行为，不冒充供应商请求结果；持久化重启由相同源码的隔离数据库测试验证。

实际 API GET 通过：29个来源、459项能力，政策仍为194，无 `tickflow-free` 或 `nvidia-news`。TickFlow 保持停用、配置3、页面凭证已配置；Tushare 保持启用、配置5、页面凭证已配置。没有额外权限 POST 或配置写入。重建后真实 GET 的四宽页面再次通过，底部操作和原检查入口均保留。

最终核对：AC1–AC4全部完成，无当前范围的未验收项；未执行 Git 提交。
