# M31 原始价格与现金事件目标验收

关联：[多源 Task](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md)、[本地执行证据](2026-10-07-m31-local-execution.md)。本证据完成 510300.SH、2023-01-05 起的有界现金分红闭环，保留旧 HiThink 事件资格与严格历史 PIT 的独立边界。

## 目标环境与创建修复

用户授权在空 Docker 环境建立开发目标，脚本不能完成初始化时允许直接 Docker 创建。正式更新构建 DSA 与 Server 镜像，并创建四个配置卷；默认结构检查正确拒绝空数据库。核对实际数据库及 owner 都为 `thesis_ledger`、public 表数 0、Server/Worker 尚未启动后，使用镜像中既有 `dev-database-rebuild.js` 的显式 development/rebuild、精确确认和数据丢失开关生成完整 SQL，再执行该 SQL。初始化后 80 张预期表完整，SchemaVersion 为 `20261006030000_strategy_authoring_save`；五个服务 healthy，API 的数据库、Redis、DSA 均 healthy。未删除卷，未用 db push 替代完整结构。

目标首次准备成功，但创建守卫漏传现金研究预热选项，导致相同配置被误判 PREPARATION_STALE。修复后守卫按相同现金协议检查范围；新增回归验证现金短预热可创建、旧缓冲范围被拒绝、普通协议保留 14 天缓冲。定向 9 项、Server build、局部 ESLint、边界门禁通过。通过正式 `sync-code.sh thesis-ledger` 同步 Server/Worker 可写层；这是非持久代码快更，不能当成镜像发布证据。

## 来源、冻结与业务终态

公告来源包 SHA-256 为 `924ca0ef585cbc044a34cc552ec0a17b24645a63ecbfec4df9fa01ded414cfa3`，原件及实际核验时钟见来源叶证据。infra `cash-notice-admission.mjs` 在部署锁内登记精确 510300.SH、2023-01-03..2023-02-01 现金窗口，原包存入内容寻址路径并读回核验；24 小时有效至 `2026-10-08T05:58:17.966070+00:00`，没有自动长期准入或拆分资格。

标准 `cash-dividend-target.mjs --run` 使用 API 保存策略、准备、创建、读取，不绕过任务生命周期。保留其他任务的原有来源选择，将公告源追加为现金事件备用，并新增腾讯 ETF none 路由；策略 revision 4 已 applied。价格为目标生产 Reader 实际读取的腾讯原价，事件由鉴权网关实际消费。显式零收费/滑点、真实整手/价位/份额、除息日资格及发放日开盘结算模型进入冻结配置；来源的原始时钟没有改为历史可见时间。

| 期末 | 任务 ID | PostgreSQL 终态/attempt | 结果校验和 | 现金状态 | 期末权益/总收益 |
| --- | --- | --- | --- | --- | --- |
| 2023-02-01 | `cb8c5fdb-b16b-4d2b-aba7-3e9567446930` | succeeded / 1 | `62957fa06013f9a3` | 已发放 | 102777.6 / 0.027776 |
| 2023-01-18 | `1eac4850-39b5-47aa-b6b4-3098bee72a26` | succeeded / 1 | `0e1382b3b7059adf` | 应收未发放 | 102033.6 / 0.020336 |

Snapshot 分别为 `904948b2f95aaea8167fa5d4dc0a421bf878e09bf2ee96544f44e105036c1eb4` 与 `eb3e748c2e841ef91487c801171af1dc9043d231ec0a26b26448643ebeade65c`。只读 PostgreSQL 直接核对两行 BacktestJob 的 status、attempt、结果、snapshot 与 checksum，不以队列状态代替业务终态。

每条快照通过目标 Worker 中的 `research-window-replay.mjs` 两次重放；fetch/http/https/net/tls 全部拒绝网络，实际网络调用 0，结果与持久校验和一致，全部产物读取并核验。独立 `cash-dividend-independent.py` 只读重放返回的实际原价：01-06 开盘 4.03，50000 预算按 100 份整手向下取整得 12400 份，支付 49972、余现金 50028；每十份 0.6400 换算得总分红 793.6000。发放后现金 50821.6000，两种期末的逐日权益和收益全部匹配。登记日买入及买卖资格反例另见本地 Domain/Runner 证据。

## 实际页面与下载

本机 Safari 读取 `http://localhost:5173/strategy/jobs/<任务ID>`，连接实际 Docker API。已发放页显示 2.78%、102777.60、每份 0.064、资格 12400、现金 793.6、登记/除息/发放日期、原件链接和摘要、实际观察时钟。应收页显示 2.03%、102033.60，并明确“尚未发放，保留应收”。两页展示基准现金与数量模型尚未纳入，策略自身指标保持可用；最终页面移除与该状态冲突的通用基准成交说明。该最终 UI 改动经 Desktop build 和现金披露定向 2 项通过；重启原 Vite dev/force 入口后实际页面再次核对。

从两页实际点击导出，读取 Safari 保存到 Downloads 的原文件；`cash-dividend-diagnostics-check.mts` 对比 API 结果、Snapshot/checksum、客户端完整映射、现金披露及精确来源时钟，格式仍为 2，两份均通过：

- `backtest-cb8c5fdb-b16b-4d2b-aba7-3e9567446930-diagnostics-v2.json`，7003 字节，SHA-256 `728f90bda1588c5379effc9872349cf1687060f1f1d6eafc61a048e8a8aa551e`。
- `backtest-1eac4850-39b5-47aa-b6b4-3098bee72a26-diagnostics-v2.json`，SHA-256 `5e696c91e0a628caae4f8bd74ece019d22a8b70dc0f6f064bd42a494afa60e87`。

原始日志/响应/产物在忽略目录 `.recovery-artifacts/m31-2026-10-07/`；实际下载未由脚本生成替代。

## 最终一致性与边界

PR-AC08～PR-AC10 在本有界场景的来源、鉴权选择、原价绑定、入账、持久任务、冻结重放、独立复算、页面与文件消费闭环通过。结果为 partial：基准现金及实际数量模型未纳入，净收益/超额比较不可用；拆分、税费、盘中到账、严格历史首次可见性及上市边界未验证，页面如实披露。旧环境资产不存在，用户明确要求旧结果回归另补，该门禁没有记为通过。既有普通价格协议的局部兼容回归保留，不能替代旧目标资产验收。

本组有界 M31 已完成，原严格 HiThink M31 资格不关闭，多源父 Task 继续 active。后续按用户要求推进 P6；无提交、推送、发布或其他聊天消息。
