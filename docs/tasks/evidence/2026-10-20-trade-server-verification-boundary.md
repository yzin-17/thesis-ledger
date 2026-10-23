# 交易规则服务端拒绝边界验收

日期：2026-10-20。对应[交易规则 T18.C2](../2026-08-26-trade-execution-ledger-system-follow-up.md)及[现行规格](../../specs/2026-08-26-trade-product-experience.md)。本项完成服务端拒绝边界，不关闭 T18 所需权威规则包与正向验证。

## 实际行为

新建、更正、带新载荷恢复和跨账户更正的客户端载荷均不能自行声明 `capabilityVerification=VERIFIED`。服务端在已有幂等重放命中之后、追加事件之前返回 HTTP 409、`LEDGER_VALIDATION_FAILED`。普通 `UNVERIFIED` 写入仍执行原有账户、资产身份及资产类型校验。

历史事件的验证状态不改写，旧已提交命令仍可读取和幂等重放。跨账户命令的目标载荷同样来自客户端，拒绝时源与目标账户的事件、账本版本及投影版本均不推进。界面已有 T18.C1 的草稿保护继续复用。

写入准入提取至 Ledger 自有的 `execution-write-admission.ts`，不调用来源适配器或凭证。`check-boundaries.mjs` 增加该文件对 integration/providers 的反向依赖禁令。Command Service 从本轮前 598 行收敛为 563 行，未提高门禁阈值。

## 源码与隔离运行验证

执行目录均为主仓 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`：

| 命令或检查 | 实际结果与输入范围 |
| --- | --- |
| `pnpm --filter @thesis-ledger/server exec vitest run test/ledger` | 17 文件、109 项通过；另 3 文件、13 项因没有隔离数据库变量跳过，下行单独实跑，未将跳过计作通过。 |
| `node scripts/test-ledger-current-postgres.mjs` | 3 文件、13 项通过；生产 Ledger Controller、Repository、Command Service、Query Service 和实际 HTTP，连接独立 PostgreSQL。 |
| `pnpm --filter @thesis-ledger/server typecheck` | 最终源码及测试类型检查通过。 |
| `pnpm --filter @thesis-ledger/server build` | 正常 Server 构建通过；正式快更再次构建当前 Server 与共享依赖。 |
| 定向 ESLint、Prettier、`git diff --check` | 本轮六个 Ledger TypeScript 文件通过；新增维护脚本另经 Node 语法/实际执行检查。 |
| `node scripts/check-boundaries.mjs` | 通过。 |
| `node scripts/check-file-size-guardrails.mjs` | 通过，保留 8 项既有 warning，未放宽阈值。 |

两次验证合计覆盖 20 个 Ledger 文件、122 个测试。实际 HTTP 验证包括正常创建/幂等/更正/撤销/恢复、旧空信封拒绝、伪报新建拒绝，以及历史 `VERIFIED` 的读取/幂等与新更正/跨账户/恢复拒绝。每次拒绝后比对实际事件、状态、持仓及现金行，不只判断 HTTP 状态。

隔离入口固定使用随机 `ledger-current-test-*` 容器、`postgres:17-alpine` 本地镜像、tmpfs、回环随机端口、`fixture_owner`，仅创建 `ledger_current_fixture` 和 `ledger_envelope_fixture`。不接受目标参数。按目录顺序在两库应用全部 35 个 migration，head 为 `20261019020000_research_observation_versions`。失败与成功均经 `finally` 清理本次容器，未把业务容器、数据库或卷作为操作目标。

历史验证夹具经存储层追加，不更新已有 LedgerEvent、不关闭 append-only 保护。新脚本是可复用隔离验证入口，不是目标部署入口。

## 正式目标更新与独立核对

执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口与目标：

```sh
./scripts/sync-code.sh thesis-ledger
```

默认沙箱首次因不能查询 `ps` 在取得更新锁及任何 Docker 修改前退出；使用允许进程查询的权限重执行同一正式入口，保留全部检查，最终退出 0。兼容性预检通过；脚本构建并同步 Server/共享包，重启并确认 Server/Worker healthy，没有修改数据库结构、外部卷或 DSA。

Server/Worker 镜像仍为 `sha256:1562291459dea8079e7a3edf53ece29a9cfd7e14f38c7afad11546e314bae880`。本次仅更新容器可写层，重建容器后该更新会消失；不将快更表述为镜像已发布。

分别读取两个实际容器编译文件，并与本地构建产物 SHA-256 相等：

| 编译文件 | Server、Worker 与本地相同的 SHA-256 |
| --- | --- |
| `ledger-command.service.js` | `0c50b2faf00ea316784d3806312eb7cf0ee503397e4c923c95d14ee157cea70a` |
| `execution-write-admission.js` | `90d4e297f1f9ea3033ef5bfe13ad933c472159b156771fac7c02c582b2835794` |

在两个容器内直接调用编译后的拒绝函数，以没有 transaction 对象的上下文证明伪报在数据库访问前得到 409。该检查只读取代码并执行纯拒绝分支，没有向目标账本发写请求；生产 HTTP 写入语义由隔离 PostgreSQL 验证，不冒充目标写入验收。

快更前后独立摘要逐项相等：原 7 张业务保护表，加 Position、Trade、CashBalance、CashSettlement 共 11 张；ProviderConfig、AiRoutingSettings 两类配置；57 个已成功 V3 回测结果的身份与 checksum；五个容器身份、镜像与原暂停标志。AiRun、AiToolCall、ResearchObservation、ResearchObservationVersion、ResearchObservationSubmission、AiInvocation、AiInvocationFact 均保持 0。没有启用模型或新执行用途。

数据策略仍为 revision/dsaRevision 154，原 16 条绑定保持；基金临时路由尚未执行。Web `http://127.0.0.1:5183/accounts` 实际读取目标 API，显示系统已连接及原 `510300.SH` 买入 100、4.35 CNY 的成交。本轮 Web 仅导航与读取，未提交表单，未验证 Electron。

## 证据位置

原始文件位于主仓忽略目录 `.recovery-artifacts/remaining-p1-2026-10-20/`：

| 文件 | SHA-256 |
| --- | --- |
| `target-before.json` | `ea440c7e130d188deb32b204d3692c717e80194a4bab1b16aff34ced8656117c` |
| `target-after.json` | `ee51a612e17a9de080b869c8d692f23edf18ab9e26c956e993fa594c18e231cd` |
| `sync-code.log` | `190da72d2de7dcab93b49e5fe4a16c8d66b7ae942fcbaee53ab4400d7baab31b` |
| `t18-postgres.log` | `6abf5c667f5e4a195b66940c02987233ccbb7217a07306d90b4b895ea0b29787` |
| `web-account-read.png` | `ac341944c6f2e119cfe8083adaed7a342a5a410adfd8f274a7ea8018d98c3f89` |

同目录保存 Ledger 回归、类型、构建、lint、格式、边界、尺寸及 Web 完整页面记录。完整规则包的权威来源、版本及市场/标的/成交时间有效范围仍缺，T18 父项保持未完成；当前每手参考、目录 ready 和本拒绝测试均不能替代正向验证。
