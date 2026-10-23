# Automation 真实行情与正式快照消费回执

接续[共同消费者 G1](../2026-10-09-unified-data-capability-adapter.md#market-consumer-acceptance)，按[精确预案](2026-10-21-automation-market-consumer-plan.md)完成正常受管任务 → RuntimeHandler → Performance/Market → 真实基金来源 → 正式修订的独立目标差集。只验 Web，主线程直接执行，真实模型零调用，DG3 原 TODO 保持。

## 正常目标链与新事实

首次及执行前全局待校准均为零，受管任务 `00000000-0000-4000-8000-000000000013` 无在途运行。新建自有基金实际账户 `2ded5c96-5e9f-4271-9331-000bd83dfa41`，名称 `基金正式校准验收-20261021-29913e6c`；正常入金 1000、买入 100×1.25 后以真实 `161725.OF`、2026-10-20 NAV 0.5406 生成估算。随后先正常卖出、取回 1000、停用，受管校准继续消费估算冻结的 100 份与现金 875，不重读清空后的仓位。

触发前全局唯一待校准恰为本案估算 `3f2946a7-a106-4ef2-ae1f-fae5eaa7662c`。正常 POST 立即运行既有受管正式校准任务一次，持久运行 `46cd299a-e609-4e7b-b478-1964334e0d8f`：

- `status=succeeded`，handler attempt=1、owner attempt=1、trigger=manual，完成后 leaseUntil=null；没有脚本重试或故障恢复。
- 扫描 1、正式化 1、待补齐 0。实际开始 `2026-10-20T22:59:49.286Z`，完成 `22:59:50.393Z`。
- 新正式修订 `2774bee0-bd2a-484c-b59e-db48ef2bcf06` 为 revision 2、OFFICIAL/COMPLETE，正确引用原估算；市值 54.06、现金 875、总值 929.06、成本 125。
- 正式位置来源为 efinance，`valuationEvidence.kind=fund-nav`、date=2026-10-20、unitNav=0.5406；冻结经济输入与估算完全相同，原估算原始 JSON 未改。
- 原受管任务配置、cron、启停、计划时间、全部旧运行与旧租约逐项相同；全局待校准重新为零。

Web 自动化历史显示“正式净值校准 / 成功 / 2026/10/21 06:59:49 / 扫描 1 个槽位，正式化 1 个，待补齐 0 个”。仅只读查看，没有再次点击立即运行；恢复数据源页签及原模拟账户成交页。

## 保护和产物绑定

账户份额/现金归零并停用，保留四条新账本事件、两份自有快照及一个正常自动化运行/租约。原十二账户、13 张业务/AI 配置保护表、57 份成功回测、旧快照/历史、默认与凭据不变。精确排除新自有账户后，保护 JSON SHA-256（含换行）仍为 `180a3cb12aea2b8e6f3f0b79cbd1959b74aa09be5f5f3932ccb8159f38ce88ff`；含新事实的完整新基线为 `20ac5252350b379035ec4c22e0791f29c1997502decda8753a3e1a14e69ccfbb`。

临时两条 NAV 路由已恢复，政策/DSA revision 164、applied、非 stale，原十六条路由指纹仍为 `0117cfac907d941645be4134dd2f96a3e6cba30ba3b24fe00f8828eb2db49ea9`。来源启停、凭据与镜像未变；正常缓存可复用，不强制刷新已合格来源。

当前本地与两个实际容器的全部 Server JavaScript 649 个和 Schema JavaScript 164 个一致：Server 树 SHA-256 `fc3305af8b450a8657a04b69a751a76e38535c623c3e543d2c8462566832aea9`，Schema 树 `15632bc323846c3d613810266718d4eee3bd54b1818d11d8b7c8a1ef74247ff7`。原一次只读探针误用宿主目录布局，未触业务；改用实际依赖解析路径后通过，没有借此重新构建。边界门禁通过。

`automation-market-consumer-contract.test.mjs` 的 13 项保护测试通过：旧账户待校准、在途、配置/旧历史变化、额外运行、重试、租约、owner、旧估算、清空仓位、金额和伪造来源均拒绝。生产代码和原已过基金/Scheduler 输入未改，不重复其高成本测试。

## 原始证据

私有案例目录 `.recovery-artifacts/fund-calibration-20261021-29913e6c/`：

| 文件                     | SHA-256 / 指纹                                                     |
| ------------------------ | ------------------------------------------------------------------ |
| 原执行计划               | `ef2654850c902d703a34bca6cde63c465fb4283503ac6c01c09dfbfce3248867` |
| `automation-record.json` | `5b59ebb795a83a94d4f58f246313ed2d5eeb5af22895897495053a1de331adaf` |
| `automation-final.json`  | `98e53b46c89c5ae7d142be16388cbf09f1d63a4de3bd399441839ecb9c8eda37` |
| `automation-web.png`     | `08d3c752f80268ca8e74e945067cb1648d59a724529ee1877f9931eb61878471` |
| `automation-web-ax.txt`  | `a7a8f8a2181922be956394eb164f3fa3455fbbaf388b2fc1a7397fb2a8366e18` |

维护入口 `scripts/automation-market-consumer.mjs` 默认只读，显式执行绑定计划与脚本摘要，写入仅正常 API 和既有自有账户维护入口；收尾由 `scripts/automation-market-consumer-final.mjs` 只读核对真实 Web、账户、任务、版本和保护状态。首次 SQL 探针曾误将 Prisma 关系当物理列，未写入；改用真实仓储关系谓词后预检为零，才建立和执行本案。

共同消费者 G1 的五个消费面现已有各自实际链及当前产物证据，可以关闭本门禁。失败切源、权限、合格历史规则、实际新闻/模型、通知等仍由原任务持有；本叶不是现场开市自动采样或其他来源的性能结论。
