# 权限检查长期保留与底部操作验收

规格：[长期保留与底部操作](../specs/2026-11-10-provider-access-retention.md)。验收日期：2026-11-10。

## 实现与数据边界

当前配置的逐功能检查统一写入已有 SQLite 权限表，不再要求来源提供账号等级。长期记录移除报告与逐项 `validUntil`；凭证指纹、端点及等级仍用于匹配，启停变化保留记录。无等级来源省略 `accountLevel`，保持客户端严格校验契约。

相同草稿在有界缓存内保存时原子采用检查结果；不匹配的输入不会采用，普通来源也不会因保存凭证额外请求上游。无效凭证和配置冲突保留原失败行为。全部来源共享的移除按钮进入 Sheet Footer，确认、取消及失败恢复不变。

真实业务配置只读，没有使用真实 Key 检查、更新凭证或改变来源启停、路由及历史记录。旧版内存检查不能在重启后恢复，需要手动重新检查取得长期记录；本轮未将截图中的结果回填为真实记录。

## 自动验证

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| DSA 权限、TickFlow 历史与执行 | `.venv/bin/python -m pytest -q tests/test_tickflow_account_access.py tests/test_tushare_account_access.py tests/test_tickflow_free_history.py tests/test_configured_market_routes.py` | 76 项通过 |
| DSA 控制、目录与运行时 | `.venv/bin/python -m pytest -q tests/test_thesis_ledger_control_v3.py tests/test_thesis_ledger_inventory_export.py tests/test_thesis_ledger_provider_runtime.py` | 38 项通过 |
| Desktop 凭证、权限与派生入口 | `pnpm exec vitest run test/provider-credentials-sheet.test.tsx test/provider-account-access.test.tsx src/features/market-data/account-level.test.tsx test/market-experiment-recovery.ui.test.tsx` | 26 项通过 |
| Desktop 类型及生产构建 | `pnpm --filter @thesis-ledger/desktop build` | 通过；保留现有大块体积提示 |
| 主仓边界 | `pnpm exec node scripts/check-boundaries.mjs` | 通过 |
| DSA 能力及运行时输入 | `.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py`、`.venv/bin/python scripts/check_data_runtime_contract.py` | 通过 |
| 修改卫生 | 两仓 `git diff --check` | 通过 |

隔离 SQLite 样本覆盖：时间推进一年、重新创建运行时仍可读取；Key 或端点更换失效；无关启停保留；草稿不发布、相同草稿保存不重复请求、不同输入不复用、配置冲突拒绝、无效 Key 拒绝。样本 SDK 完全受控，不访问真实上游。Tushare 积分及独立权限原契约回归通过。

## 实际浏览器

Edge/Playwright 打开 `http://127.0.0.1:5173/market-data`，使用真实来源目录及凭证摘要，只将 TickFlow 的权限响应替换为受控样本：检查时间为 `2020-01-01T00:00:00Z`，`persisted:true`，无到期字段，4/14 项可用。

1440、1024、768、390 四种屏宽均通过：旧日期结果仍显示可用，文案说明长期保留；移除按钮仅在底部操作栏，位于可视边界内；正文可滚动，无横向溢出；点击移除后取消，凭证保持，Escape 可关闭。全部非 GET 请求拦截，实际写请求为零。已人工检查 1440 和 390 截图。

此样本验证页面投影及操作位置，持久化真实性由隔离数据库测试证明。Desktop 当前由宿主 Vite 提供，生产构建也已完成；不把该界面误记为 Docker 内静态前端。

## 完整镜像更新

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`；入口：`./scripts/update.sh dsa`；退出码：0。使用默认保留数据模式、现有环境文件及恢复挂载配置；未开启清库、fixture、拉取基础镜像或放宽检查。用户要求固化镜像，因此采用完整更新入口。Server/Worker 不在本次镜像更新目标中，Desktop 由宿主提供。

- 更新前镜像：`sha256:fba77edd608b38217e574f4320715ec094165bb8408f439d5f0cb1358c0ff6b6`。
- 更新后镜像：`sha256:1853a4df3cf957422f6157a8a35be24ccd61a2928f0cd94534009dfb30d0f163`。
- 新容器：`4c3059adec99fc76773c4464a8264777caa6f981960fff900dd688da27489ab6`，创建于 `2026-11-09T16:36:46.677895721Z`（北京时间 11-10 00:36:46），状态健康。

独立只读检查比对 8 个关键文件 SHA-256，覆盖权限检查、记录存取、配置绑定、来源声明、逐路由凭证、目录及修订/执行入口，全部与宿主源码一致。对应文件在 `docker diff` 中无可写层修改；挂载仅为 `/app/data`、`/app/logs`、`/app/reports` 三个持久目录，没有代码挂载，修正来自镜像。

新容器启动后的实际 API 读取通过：29 个来源、459 项能力，只有一个 TickFlow 来源及14项能力，已删除的 `tickflow-free` 与 `nvidia-news` 均未出现。政策版本仍为194，TickFlow 仍为停用、配置版本3、页面凭证已配置。当前14项权限为 `unknown`，符合旧版内存结果不可恢复的边界；未自动调用真实 Key 重新检查。

重建后再次用完全真实 GET 响应打开页面，1440、1024、768、390 四宽均通过：单个 TickFlow、没有积分字段、检查入口可用、移除位于可视底部、长期保留文案正确；写请求为零。长期记录跨重启本身由相同镜像源码的隔离 SQLite 测试证明，不把旧截图或受控响应当作现有账号的持久记录。

最终核对：AC1–AC4 均完成，未执行 Git 提交，未留下执行范围内的未验收项。
