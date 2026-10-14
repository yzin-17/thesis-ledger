# 回测公告自动准备验收

> 归档说明（2026-10-14）：本文保留原日期、输入、命令、结果、失败与未覆盖条件，供历史追溯。下文“当前”与状态仅指原记录时点；本次归档不代表未通过验收已完成。现行义务由[当前 Task](../../tasks/README.md)及其 Spec 管理，发布外部门禁仍从[发布门禁记录](../../reviews/2026-08-18-v1.0-release-gate-review.md)进入。


2026-10-08，范围为[公告自动准备规格](../../specs/2026-10-08-announcement-preparation.md)。实现、真实获取、目标运行时与浏览器验证完成；没有提交或发布代码。

## 验证结果

| 断言 | 证据与结果 |
| --- | --- |
| AC1 精确检索与缓存 | 巨潮机构定位及证券限定查询成功；隔离库存获取两家公司四份公告，三份解析成功；成功空查询复用且不生成状态，原文摘要通过后不重复下载。DSA 定向 23 项通过。 |
| AC2 持久任务 | 并发准备合并、单次领取、租约恢复、旧执行标识不能提交、三次后终态及原文／解析失败保留旧事实通过。目标重启前投递三个月份，重启后同样任务标识全部完成，无失败。 |
| AC3 配置准备与页面 | Server 定向 29 项、Desktop 定向 15 项通过。准备期间不读取价格、不创建失败回测，草稿不获取公告；直接创建返回准备中冲突。浏览器点击原有准备操作后展示 `0 / 3` 公告月份，自动轮询后继续原有价格预检；没有新增获取按钮。 |
| AC4 每日更新 | 注入上海时间 22:00 的隔离运行调用真实巨潮，执行 `2026-10-01～08` 月份查询，零匹配且无错误；当日二次调度不重复，三十天使用期限不被后台更新延长。目标进程已装配调度线程；没有把注入时钟测试称为目标服务已自然运行到 22:00。 |
| AC5 新快照与保留 | 最终目标回测 `6344d8ea-df8b-4f8d-b8d4-373509609ca5` 成功，含状态 Parquet 冻结引用。原回测 `57def779-97d0-4562-9fe0-b613fe90269e` 完整 API 内容保持一致。数据源启用标志保持；未迁移数据库、改凭证或重写旧快照。 |
| AC6 风险事实消费 | 真实 PDF `1217557800` 解析出明确撤销日期和 10% 比例；目标状态 API 返回库存引用 `cninfo-1217557800`，2023-08-18 的风险与限制正确，2023-08-22 为未知。只读取明确日期，未扩成完整历史风险状态。 |

Schema、Server、API Client、Desktop 构建与 Server/Desktop 类型检查通过；边界检查通过；文件尺寸门禁通过（九处已有大文件警告未增长）。仓库复杂度/lint 最终通过：8 组、1845 文件；三处既有测试调用换行或未使用类型的错误做了最小修复，对应 13 项 Server 与 18 项 Schema 测试通过。

## 运行态与实际限制

从 `thesis-ledger-infra` 执行维护入口 `./scripts/sync-code.sh all`，随后用 `./scripts/sync-code.sh dsa` 验证持久任务重启及最终 DSA 修复，均退出 0。DSA、Server、Worker、PostgreSQL、Redis 均健康。镜像保持：DSA `sha256:4735c6fe4aa85f0fecfc1105eeef4b58508d5e4ed29b2bd011c012da0c2c6570`，Server/Worker `sha256:87ef0df18aeb80f596f1379dc06237593e19b8d588e4e17bbcc7b99d78973499`。本次为容器可写层快更，不是镜像固化。

验收时现有 HiThink 原价主源不可用，腾讯备用源缺少该标的窗口兼容证明，原路线按既有门禁阻断。这不影响公告任务完成。两个真实新回测验收期间临时把原价行情选为单一腾讯主源，完成后恢复原选择，其他路由和启用配置保留。Desired/Effective 修订按审计正常推进 `25 → 27 → 29`，最终 `syncState=applied`；境内状态主源始终为 `official-states / cn-stock-risk-price-limits`。本任务不宣称修复 HiThink 行情或补齐备用兼容证明。

## 重复验证入口与证据索引

- `scripts/announcement_preparation_target.py`：默认预览；`--run` 创建验收策略和新回测，保留原回测和路由；`--temporary-tencent-route` 在正常结束及异常退出时恢复临时价格选择，不覆盖其他操作已修改的选择。
- `scripts/announcement_restart_target.py`：配合正式 `sync-code.sh dsa` 在重启前投递任务，验证持久任务标识和最终进度；该脚本不操作 Docker。
- 当前会话输出：`/tmp/announcement-final-target.json`、`/tmp/announcement-restart-target.json`；日志：`/tmp/announcement-focused-dsa.log`、`/tmp/announcement-focused-server.log`、`/tmp/announcement-desktop-tests.log`、`/tmp/announcement-schema-tests.log`、`/tmp/announcement-final-complexity.log`、`/tmp/announcement-auto-sync.log`、`/tmp/announcement-final-dsa-sync.log`。
- 浏览器截图：`/tmp/announcement-auto-preparation.png`，可见原有准备按钮和公告准备进度。

## 一致性核对

获取在新快照冻结之前完成，计算与冻结重放保持离线。完整检索回执和明确解析事实分开；缺资料不伪装为正常交易。查询、公告库存与获取状态分别由 DSA 拥有，Market 消费稳定进度，Backtest 单向调用 Market。当前规格继续有效，任务可归档；没有把本轮验收义务迁入 TODO，也没有将其他市场扩展带入本轮交付。
