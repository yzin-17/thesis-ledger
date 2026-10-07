# 日历发布证据实施任务

对应 [规格](../specs/2026-09-27-calendar-release-availability.md)，归属 R01.10，不缩小主任务范围。

- [x] P0：核实临时休市修订反例及实际包行为，固定 4.13.2 依赖；实际包专项 4 项通过。
- [x] P1：读取官方发布元数据，核对 wheel 摘要和宿主安装内容；93 个文件一致，记录完整源码树摘要。
- [x] P2：DSA 实现已核验发布记录与本地安装内容核验，未知或修改包拒绝；请求期不访问外网。6 项发布证据测试覆盖真实包、缺失/增加/修改/符号链接及截止时点。
- [x] P3：calendar_fact 使用发布时点及 `release-evidence-v1` 适配修订，按 dataAsOf 拒绝尚未发布的版本；未修改旧冻结快照读取或字节。
- [x] P4：实际包及 HTTP 测试覆盖发布时间前后、不同请求起日、内容损坏、未知版本和结算范围；Server 完整冻结及旧快照回归。新增实际 DSA HTTP 集成经 Client、完整 Parquet 快照、新 Store 与两次 Runner 重放通过；旧快照沿用已通过的无标记落盘兼容回归。
- [x] P5：完成官方目标更新、版本/文件核验、协议及 HTTP 正反例；更新 R01.10 状态。

## 当前部署状态

最终验收：官方代码同步进程 97305 退出 0，日志 `/private/tmp/goal-dsa-release-catalog-sync-20260927.log`。目标容器的 93 文件源码树摘要匹配发布记录，`calendar-release-http.integration.test.ts` 对实际目标 DSA 通过，包含发布前拒绝、发布后完整冻结和新 Store 双次重放。官方 V3 协议、独立 Data 鉴权及目录检查通过。日历源码新语义位于容器可写层，固定依赖位于新镜像；容器重建需按官方入口重新部署当前源码。此验收只覆盖日历，合成行情不计为 G-Run。

本地验证：发布证据/实际包/HTTP/V2 依赖共 32 项通过，V3 行情协议回归 22 项通过，关键错误 flake8 与 py_compile 通过。Server 跨服务完整冻结验收见下文；P5 的最终结果以上述目标验收为准。

本地跨服务证据：`calendar-release-http.integration.test.ts` 通过，使用宿主实际 DSA router/实际日历包及生产 DsaClient；发布前返回 unavailable，发布后事实冻结保留时间和修订，真实 Parquet 落盘后离线双次运行一致。价格、标的事实及策略仍为合成输入，不计为 G-Run。首轮修正测试策略占位哈希后通过，没有放宽校验。Server 类型及该测试 ESLint 通过；临时本地 HTTP 服务已停止。

部署过程：固定依赖后的首次 `update.sh dsa` 因沙箱禁止写 Docker Buildx 活动目录失败，脚本内重试仍失败；未替换容器。通过权限流程重新执行同一官方入口后，进程 90273 已退出 0，日志 `/private/tmp/goal-dsa-calendar-update-escalated-20260927.log`。新 DSA 镜像为 `sha256:d4a11dfbf07eba886f9b385aa028dbedde0b8f8d997e97a82f9d0163834192d0`，健康且 requirements 精确固定 4.13.2。构建上下文未包含构建期间新增的发布校验源码；随后官方代码同步进程 97305 已完成，并取得本节开头的目标验证结果。
