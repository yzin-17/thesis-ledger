# 工具归档、界面回归与恢复修复证据

日期：2026-11-15（Asia/Shanghai）。对应[规格](../specs/2026-11-15-scripts-maintenance.md)、[实施任务](../archive/tasks/2026-11-15-scripts-maintenance.md)及[整理前审计](../reviews/2026-11-15-scripts-maintenance-audit.md)。当前使用入口见[工具索引](../../scripts/README.md)。

## 变更范围

5 个专项文件按原任务归档，保留源文件名和测试：

| 任务 | 新位置 |
| --- | --- |
| 公告准备 | `scripts/archive/2026-10-08-announcement-preparation/announcement_preparation_target.py`、同目录 `announcement_restart_target.py` |
| 统一回测 V2 | `scripts/archive/2026-08-28-unified-backtest-v2/backtest-v1-inventory.mjs` |
| 策略交叉方向 | `scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.mjs`、同目录 `strategy-cross-repair.test.mjs` |

已修正归档目录下的仓库根、相邻 infra 和源码依赖定位。交叉修复测试由 CI 显式执行，避免移出 `local-runtime/*.test.mjs` 后失去覆盖；公告脚本只验证语法，不执行其固定目标。

7 个界面脚本进入 `scripts/local-runtime/browser/`，由 `cases.mjs` 登记，`run.mjs` 统一管理临时端口、独立缓存、日志、截图和清理。Playwright 固定为 `1.58.2`，锁文件仅新增该工具及必要依赖，不升级既有依赖。

新增提供方健康历史固定样本宿主，使用真实表格组件验证 40 条数据的分页与窄屏滚动；新增移动标的选择宿主补齐 React Navigation 上下文，复用真实 Arena 创建组件。其余宿主保持原入口。业务 UI、领域源码及进行中任务未作为本次写集。

恢复入口保留 Shell 路径并委托 `scripts/database/restore-db.mjs`：默认只预检；显式写入要求 checksum、数据库/owner 精确确认及无其他连接；恢复和完整结构/head 检查同事务。完整预期表与 head 从当前 Server 结构发现能力派生，备份目录缺表在写入前拒绝。指南已删除自动 migration、integrity/E2E 的错误描述，明确后续运行态验收由对应任务持有。

## 定向验证

| 检查 | 命令或输入 | 实际结果 |
| --- | --- | --- |
| 恢复合同 | `node --test scripts/database/restore-db.test.mjs` | 8 项通过；涵盖默认不写、checksum、目标、owner、活动连接、缺表及事务临时文件清理 |
| 归档交叉修复 | `node --test scripts/archive/2026-11-12-strategy-cross-direction/strategy-cross-repair.test.mjs` | 2 项通过，输入与非修复字段保留 |
| 归档回测盘点 | 显式置空 `DATABASE_URL` 后执行归档盘点入口 | 代码只读盘点通过，未读取数据库 |
| 公告脚本 | 两个归档 Python 文件使用 `ast.parse` | 语法通过，未执行目标操作 |
| 调用目录 | 在 `/tmp` 调用绝对路径 Shell 入口，并移除 `DATABASE_URL` | 正确进入恢复实现并以“DATABASE_URL 未配置”退出，未访问数据库 |
| 冻结锁文件 | `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts --offline --registry https://registry.npmmirror.com` | 通过；锁文件最终仅新增 29 行 |
| 架构边界 | `node scripts/check-boundaries.mjs` | `Import boundaries: OK` |
| 依赖边界 | `node scripts/check-workspace-dependencies.mjs` | `Workspace dependency graph: OK (8 packages)` |
| Desktop 类型 | `pnpm --filter @thesis-ledger/desktop typecheck` | 通过；现有配置只覆盖 `src`，不将此结果扩大为测试宿主类型检查 |
| CI 界面依赖构建 | `pnpm --filter '@thesis-ledger/desktop^...' build` | Schema、Shared、Domain、API Client 构建通过 |
| 新增测试宿主 | ESLint 定向检查两个 TSX 文件 | 退出 0；解析 React Native 上游 Flow 源码时有诊断输出，无本次文件 lint 违规 |

`.mjs` 工具不在当前 ESLint 配置匹配范围，使用 Node 语法检查与实际脚本/浏览器验证，不新增 ignore 或放宽门禁。

## 隔离 PostgreSQL

命令：`node scripts/database/test-restore-postgres.mjs`。仅由此维护脚本创建唯一命名、带 `thesis-ledger.fixture=database-restore` 标签的 PostgreSQL 17 临时容器；数据库使用 tmpfs，临时备份使用独立目录，不挂载业务数据库卷、不连接目标开发库。

实际从当前全部 migration 构造数据库，结构 head 为 `20261114010000_journal_period_review_snapshots`。以下 4 个场景通过：

1. 默认预检不改变哨兵数据。
2. 当前结构备份恢复成功，哨兵恢复为备份值。
3. 错误 SchemaVersion 在事务内拒绝，哨兵与原版本均完整保留。
4. 备份缺少一个无外键依赖的 raw-owned 表时，写入前拒绝；目标原表及哨兵保留。

缺表样本最初因外键依赖先失败，后改为独立 raw-owned 表以直接验证完整性。该样本暴露出仅检查恢复后表是否存在会被目标残留表掩盖的问题，现已增加归档目录全表预检，并以实际 PostgreSQL 重新通过四场景。脚本最终输出 `passed: true`，结束后按标签只清理自身容器与目录；只读复核未发现该标签的残留容器。

## 浏览器完整回归

最终命令：`BROWSER_REGRESSION_CHANNEL=msedge pnpm test:browser-regressions`。本机 Node.js `24.22.2`，以 Edge 的 Chromium 引擎无头执行，统一入口退出 0，`interrupted: false`，7 项均通过。共享 Schema/Domain 在并行任务中更新后，重新构建全部界面依赖，再完整回归通过；结论限于执行时的工作区输入。

| 回归 | 执行记录数 | 主要断言 |
| --- | ---: | --- |
| 移动标的多选 | 8 | 两个 Arena 创建入口，连续添加、选中回显、移除、导入分组、市场切换与溢出 |
| 行内多选 | 36 | Desktop 与移动 Web 多入口、已选标签、筛选、受控失败后保留选择 |
| 提供方健康记录 | 4 | 固定 20 行分页、前后翻页、表内横向滚动、无写请求 |
| 移动风险通知 | 12 | 创建、编辑、策略设置，零冷却、提供方、失败后重试及请求内容 |
| 风险通知统一 | 20 | 手动/策略风险创建编辑与通知列表，回显、重试、保存后再编辑 |
| 策略风险监控 | 8 | 每条含 5 个状态场景：缺少持仓、日历/路由、成本/开仓时间、待评估与正常；Desktop 与移动 Web 边界 |
| 策略规则通知 | 20 | 默认、编辑、关闭及取消等原有交互矩阵 |
| 合计 | 108 | 记录可包含多个场景及断言；每项均覆盖 1440、1024、768、390，保留 129 张截图 |

最终本机回执位于系统临时目录 `/var/folders/v1/gvgmk4cx1mz59vj63jj8_9m80000gn/T/thesis-ui-regressions-QjUyv0/`，包含汇总 `report.json`、各用例 `run.log`、JSON 明细和截图；临时文件不进入 Git。首轮完整通过回执保留于同级 `thesis-ui-regressions-PjDDwr/`，已抽查其中 390 宽度的标的多选及健康表格截图。

旧脚本依赖临时 Vite 参数；统一宿主补齐 React Native Web 的平台解析、`__DEV__`、`process.env` 和导航上下文。监控保存失败断言按当前页面简化后的文案更新，保留失败后选择不丢失的验证。提供方用例从真实只读页面转换为固定数据，历史真实页面证据不变。

本机默认 Chromium 缓存缺少可执行依赖，未将启动失败当作产品失败；改用显式 Edge 渠道后完整通过。日志保留受控 503 的浏览器诊断，以及 Arena 移动 Web 的 `Unexpected text node` 诊断；用例断言无未捕获页面异常。后者未作为本次整理扩大修改业务 UI 的理由，不能据此宣称所有控制台诊断已清零。

## CI 与最终边界

最终一致性 Review：12 个源路径已移除且新路径存在；三仓最终扫描快照为 8,505 个文本文件，旧完整路径及 7 个旧浏览器文件名均无残留。13 项待复核文件逐字节等于 HEAD。16 个 MJS、2 个 Python 与恢复 Shell 语法通过，CI YAML 与锁文件登记可解析。22 份受影响说明文档共 530 处本地链接与空白检查通过；维护索引、历史引用、长期 Spec 与已结案 Task 各自保持职责。浏览器入口及其用例进程均无残留。

- quality 增加恢复合同；归档交叉修复显式执行。
- contracts-and-guardrails 增加专属恢复 PostgreSQL 演练，复用已有 PostgreSQL 17 镜像准备。
- 新增 browser-regressions job：构建依赖、安装固定版本 Chromium、执行全部 7 项、始终保留报告，排除 Vite 缓存。
- 本轮完成本地验证与 CI 配置，没有触发远端 GitHub Actions。远端 CI、目标数据库恢复、真实 Provider/通知及原生设备不在已通过结论内。
- 13 项待复核文件保持原位；进行中的源码、任务、部署维护合同及未纳入授权的工具保留原职责。原有 WIP 不重置、不暂存、不提交。
