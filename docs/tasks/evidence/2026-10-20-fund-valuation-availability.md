# 基金不可用净值的快照定价保护

日期：2026-10-20。对应[组合 R3.I7](../2026-08-28-portfolio-snapshot-system.md)。本项完成不可用/零净值拒绝与冻结输入的独立闭环；基金实源正式校准和披露父门禁仍未完成。

## 问题与修复

V3 `fundNavSchema` 允许 `unitNav=0` 和 `freshness=unavailable` 表达不可用事实。原快照定价只在正式分支拒绝 stale，可能把合法但不可定价的返回计为零市值、完整覆盖乃至正式修订。新增回归实际得到 `marketValue=0`，两个拒绝场景先失败，未收紧共享 wire Schema 掩盖消费问题。

`performance-snapshot-position-valuation.ts` 的当前与正式基金分支统一要求有限正净值和 delayed。不可定价时返回缺价；估算保留已知现金和缺价覆盖，正式捕获拒绝，原估算保留待补齐。正式分支仍只读估值日精确 NAV，不调用证券 Quote；历史接口的原日期年龄 stale 语义不变。

## 分层验证

| 检查 | 最后结果 |
| --- | --- |
| 三个基金/正式价格/冻结输入定向文件 | 14 项通过，已包含在下行包级结果。 |
| `pnpm --filter @thesis-ledger/server exec vitest run test/performance` | 8 文件、59 项通过；4 文件、21 项环境跳过，不将跳过计作通过。 |
| `node scripts/test-portfolio-valuation-postgres.mjs` | 2 文件、12 项实际 PostgreSQL 检查通过，其中基金 3 项；对应包级跳过中的 12 项已另行实跑，其他 9 项不冒充本次实跑。 |
| Server typecheck、正常 build、定向 ESLint/Prettier、边界、尺寸与 diff 检查 | 通过；尺寸保留 8 项既有 warning，未放宽门禁。 |

本次共 71 个不重复测试通过。隔离入口使用随机 `ledger-valuation-test-*`、本机回环随机端口、tmpfs、固定 `portfolio_valuation_fixture/fixture_owner`；全部 35 个 migration 应用至 `20261019020000_research_observation_versions`，结束时清理自有容器。

基金 PostgreSQL 场景使用明示合成价格 0.54/0.55 和生产 Ledger/Cash 命令：入金 1,000、买入 100 份×1.25，估算冻结现金 875、成本 125；之后卖出、取回现金并停用，再校准仍得到原份额 100、市值 55、成本 125、现金 875、总资产 930。抓取时刻变化但价格证据相同仍返回原正式 ID；原估算逐字段相同。零值/不可用两项保留原唯一估算，不追加 OFFICIAL。此处为真实数据库、合成来源输入，不冒充实源正向校准。

## 正式快更与目标只读验证

执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，入口 `./scripts/sync-code.sh thesis-ledger`，使用允许 `ps` 更新锁检查的权限，退出 0。兼容预检通过，Server/Worker 重启后 healthy；数据库、卷、来源与路由未变。镜像保持 `sha256:1562291459dea8079e7a3edf53ece29a9cfd7e14f38c7afad11546e314bae880`，本次仅更新容器可写层，不是镜像发布。

两个容器与宿主构建的 `performance-snapshot-position-valuation.js` SHA-256 均为 `48e71da276bf3ca7c6c276c261c143d4518522571f14842a3566d22ab61864e6`。分别只读加载实际编译函数，用明示受控输入验证估算/正式两种路径的六次不可用拒绝和两次合格结果；没有数据库或网络调用，不写目标快照。

快更前后原 11 张业务保护表、ProviderConfig/AiRoutingSettings、57 个成功 V3 结果、五容器身份/镜像及原暂停标志逐项相同；研究执行、调用、观察及版本/提交计数均保持 0。原政策 156、16 条绑定及其完整内容保持，未追加 NAV 路由。

Web 原成交读取正常，模拟范围及账户链接已恢复，没有提交业务表单。当前 `/accounts?includeInactive=true` 只有证券 7 个、现金 1 个，实际启用账户为 0，基金账户为 0；历史基金账户 `93337db7-a5a0-40c5-823f-63577e9e924b` 不存在于当前目标，未接管或重建该历史身份。基金产品正向需单独准备自有验收对象，不能用原成交读取替代。

## 证据位置

主仓忽略目录 `.recovery-artifacts/remaining-p1-2026-10-20/`：

| 文件 | SHA-256 |
| --- | --- |
| `fund-price-target-before.json` | `632b8c3dae70d6746bb613186e779f03faaffd71c05988463eb872e727d39172` |
| `fund-price-target-after.json` | `59031c334f846095da75325389fd1579447ac94ac2c18a3f548e4d1d85bd5890` |
| `fund-price-sync.log` | `1011196924064d82f44843de9619b295c68c37107265bc5d85a18fc0782e23b7` |
| `fund-price-postgres.log` | `4ed0d2dfcab5c119745385a2497380559790b65b458d88d18e5cf18f8164678f` |
| `fund-price-web.png` | `ac341944c6f2e119cfe8083adaed7a342a5a410adfd8f274a7ea8018d98c3f89` |

同目录保留先失败的定向日志、最终定向/包级测试、类型/构建/门禁日志、Web 页面记录及只读账户盘点。真实模型继续暂停，DG3 保持原 TODO；本项不改变其授权和验收状态。
