# 未提交代码审查报告：持仓行情详情共享读模型

## 审查范围

- 基线：`7ddb68aca2538c3a45b60fcfec7b5ae31bdfabf4`。
- 范围：基线之后全部 tracked 修改，以及全部 untracked 文件；包含 Schema、API client、Server 聚合与缓存、Desktop Dialog/请求协调器、测试、Spec、Task、ADR 和附属 Ticket。
- 工作区状态：未执行 commit、push、reset 或覆盖其他用户改动。

## 结论

最终 Standards 与 Spec 双轴复核均未发现当前 P0、P1、P2 问题，可以继续作为未提交 WIP 保留。

这不是“全部验收完成”：T7a、T8、T11 仍未完成，因为 In-app Browser 对本地 `/api` 请求返回 `net::ERR_BLOCKED_BY_CLIENT`，没有形成成功态 Network/视觉证据。

## 已关闭的审查问题

1. 策略未启用能力改为 `unavailable`，资产能力矩阵仍保留在 `capabilities.supported`；指标共同 `DAILY_BAR` 依赖也返回统一状态。
2. 最后消费者取消后，已 aborted flight 不再被新消费者复用，并吸收无消费者底层 Promise 的 rejection。
3. Desktop 的整页 `refresh` 只绑定一次显式刷新，不会永久绕过 fresh cache。
4. Quote、Fund NAV、Indicator、Chip 的刷新与普通请求共用底层 flight/lock；正常请求在获得锁后重新检查缓存，避免旧结果覆盖刷新结果。
5. 资产关联只接受 active、已确认且关联 Instrument active 的记录；无效关联不会把资产标记为 confirmed。
6. Market Detail 响应 Schema 要求每个 `requested` 能力都存在对应 section，并校验 section 的能力/状态/数据形状。
7. Desktop 增加 Dialog 的股票、ETF、基金、partial/unavailable、loading/error 确定性 UI 回归，以及取消后立即重新请求的协调器回归。

## 验证证据

| 检查                                                        | 结果                        |
| ----------------------------------------------------------- | --------------------------- |
| `pnpm lint`（包含 workspace build、边界检查、全量 ESLint）  | 通过，退出码 0              |
| Schema 测试                                                 | 39 passed                   |
| API client 测试                                             | 6 passed                    |
| Server 相关命令触发的全量 Server 测试                       | 25 files / 175 tests passed |
| Desktop 相关测试                                            | 6 files / 23 tests passed   |
| Server、Desktop、Mobile、Schema、API client typecheck/build | 通过；已由全量 build 覆盖   |
| 变更文件 ESLint                                             | 通过                        |
| `git diff --check`                                          | 通过                        |

全量 lint 仍输出既有非阻断告警：Mobile 依赖中的 React Native Flow 语法解析告警、Vite 大 chunk 告警和 Prisma 配置弃用告警；本次未把它们伪装成零告警。

## 浏览器验收记录

- 本地 Vite Portfolio 页面成功打开，持仓表显示“行情详情”入口，点击后能显示持仓上下文和详情失败态。
- 主机侧访问 Vite 代理的详情地址返回 HTTP 200，fixture API 有对应请求记录。
- In-app Browser 对本地详情 `/api` 请求报告 `net::ERR_BLOCKED_BY_CLIENT`，因此未能证明股票/ETF/基金成功内容、Network 请求去重和成功态视觉布局。
- 该环境缺口已同步写入 `docs/tasks/2026-08-21-market-detail-read-model.md`；在可用浏览器网络环境下补验前，不勾选 T7a、T8、T11。

## 未提交交付说明

- 当前没有 commit，回滚只能针对本次未提交文件执行恢复操作；本次审查未执行该操作。
- 真实 Server/Docker/Provider 在线验收未纳入本报告的通过项；需要补充运行环境变量和服务后单独记录。
