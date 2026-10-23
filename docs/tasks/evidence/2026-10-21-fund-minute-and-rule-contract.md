# 基金分钟缺价保护与规则结构合同验收

本轮从 [R3.I9](../2026-08-28-portfolio-snapshot-system.md)与 [T18.C3b 的合同叶](../../specs/2026-10-21-trade-rule-capability-contract.md)继续。主线程实施，保留原数据，只验 Web；真实模型继续暂停，DG3 原 TODO。基金真实日级校准 I8 仍等待[精确预案](2026-10-21-fund-calibration-plan.md)的新增写入授权。

## 基金分钟缺价保护

先用实际 `quoteSchema/fundNavSchema/fundHoldingsSchema` 的合法响应复现：零价底层证券使基金原值 100 变为 0，并把可定价覆盖标为 1；零 NAV 或 `unavailable` 锚点仍触发底层请求，部分披露中的零价也被计为损失。修复前 7 个定向用例为 5 失败、2 通过。

`performance-fund-price-evidence.ts` 承接这两个消费判断：底层价格与其锚价必须为有限正数，否则持平且不计可定价覆盖；基金 NAV 锚点必须有限、为正且不为不可用，失败保留错误和低覆盖。既有允许陈旧正数证据的读取条件保持，披露权重不归一。原服务 488→492 行，未跨过尺寸阈值。

修复后 3 文件/16 项定向检查通过；Performance 包最终为 9 文件/66 项通过、4 文件/21 项按既有独立数据库条件跳过。新 7 项已包含在 66 中，不重复累加。Server 类型、构建、定向 ESLint/格式、模块边界、尺寸和 diff 检查通过，尺寸门禁保留原 8 项警告。未改变 Snapshot 输入、正式校准、数据库结构或分钟 upsert 合同，未重复输入未变的原 PostgreSQL 验收。

此叶只证明缺价消费保护。当前目标没有基金账户，未采样或写入新的基金分钟点；真实披露、穿透、分钟产品正向和父门禁仍未完成。

## T18 规则能力结构合同

按[合同 Spec](../../specs/2026-10-21-trade-rule-capability-contract.md)新增并公开导出 `executionRuleRequestSchema`、`executionRulePackSchema`、`executionRuleResponseSchema` 及类型。

- 请求只使用精确范围和完整成交窗口；可用包须同时有来源、内容版本、数量/价格步长和精度、成交语义、有效及已核对时间。
- 拒绝范围错配、窗口越界/失效、只覆盖日期片段、同 URL 冲突摘要、缺正文、精度矛盾和额外已验证声明；不可用响应不夹带规则包。
- 20 项定向检查通过；Schemas 包最终 106 文件/1,240 项通过，含这 20 项与公开导出检查。Schemas 类型/构建、Desktop 类型检查通过，Server 消费构建正常。

测试为明确的受控合同样本，不是真实来源包。Schema 不核验外部字节或发布者资格，不计算命令的验证结果；`available` 不能升级为 `VERIFIED`。未增加 Provider、DSA 数据入口、来源/路由、LedgerEvent 或 migration。原 C1/C2 与未验证表单保持；完整规则生产、服务端判定及真实 Web 正向仍由原 T18 保留。

## 正式同步与目标只读保护

通过 infra 的 `./scripts/sync-code.sh thesis-ledger` 同步一次本轮稳定源码，Server/Worker healthy。两个运行态实际加载的编译摘要均与宿主一致：

| 编译模块 | SHA-256 |
| --- | --- |
| 基金盘中价格证据 | `8ee30ef980e5a13c16938298ac434bc7eb83b0f8da46fbc1d05b09dd3f83253a` |
| 估值走势服务 | `504c2ab7f464ace7f8f9d9509ba8ca4cc11fe5f7a5cb1ab6063431c7f39de9e9` |
| 规则能力结构合同 | `67ff731df54983a4bd3e28a433be136148e5c32a744c476a1f9753f1d1e9e28b` |
| 原 Snapshot 持仓定价 | `48e71da276bf3ca7c6c276c261c143d4518522571f14842a3566d22ab61864e6` |

首次只读核对脚本误用宿主包目录，退出失败，原错误留在 `fund-minute-target-verify-initial.log`；改为实际 pnpm 安装入口后通过。没有因此重建、重新同步或调用来源。每个容器执行 10 个纯函数/导出受控断言，无 DB 写入和行情请求，不能代替真实基金业务正向。

前后完整只读快照相同：11 张原业务表及 2 张 AI 配置表共 13 张摘要、其他资产/关联/基金数据、全部目录、57 个 V3 回测 ID/校验、结构 head、五个容器身份/镜像、原运行开关和研究相关计数保持。研究执行、工具、观察、版本、提交及调用继续为 0。27 个来源的配置状态保持，政策/DSA 同为 156、原 16 条绑定一致且 applied/non-stale。

Server/Worker 镜像仍为 `sha256:1562291459dea8079e7a3edf53ece29a9cfd7e14f38c7afad11546e314bae880`。本次只更新容器可写层，不是镜像更新或发布证据。

Web 刷新后仍为原模拟模式与原账户，`510300.SH` 原买入 100、4.35 CNY 正常读取；未提交业务表单或改偏好。截图与原受保护视图摘要相同，不作为基金正向展示。

## 私有证据索引

目录：`.recovery-artifacts/remaining-p1-2026-10-20/`。以下是实际保存文件的 SHA-256；原返回、完整保护内容和受控脚本保留在私有忽略目录，不写入 Git 事实数据。

| 文件 | SHA-256 |
| --- | --- |
| `fund-minute-before.log` | `040c0278ab63c7ade55ef570215d14f6a9be5d0fc1918aab5e9286d9891e07d0` |
| `fund-minute-after.log` | `9484cf29f19dce2771d3b6640677cefcda07761102e90538e1a76ce74dcb31a1` |
| `fund-minute-performance.log` | `8401bf57387b66ea93048b898c3d38239e7e8740a8e4bc1bbefb0666f772b17b` |
| `trade-rule-contract-directed.log` | `0aa2684f728af58fa7ca59c25985b297c57ec242e5942b54af7443ff4273ae5b` |
| `trade-rule-contract-schema.log` | `c0b272728b9f3481e3aa6d29e095bb12ce4a9341c624fc75f789d629e279062f` |
| `fund-minute-target-before.json` | `a4b7c101ae95e4d2dba82f9ce9a0da3d1f3cae6430cac32669659c623de0be14` |
| `fund-minute-target-after.json` | `68edb0bcba134219c2957dcee4fd4d71671bba03172e5bc31a28db373275dab0` |
| `fund-minute-sync.log` | `bf69480c6b91a66c42c24ed8f1667635cf4168288691347d37e850a2f591b4ed` |
| `fund-minute-web.png` | `ac341944c6f2e119cfe8083adaed7a342a5a410adfd8f274a7ea8018d98c3f89` |

原 PostgreSQL、股票点位、触屏和 C1/C2 证据按实际输入复用。此记录不改变 I8 待授权、T18 实源生产/命令判定、基金披露和其他真实事实窗口的未通过状态。
