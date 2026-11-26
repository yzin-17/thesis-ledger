# 本地运行工具

以下维护命令从同级 `thesis-ledger-infra` 目录执行；执行仍须遵守[工作区规则](../../../AGENTS.md)。具体目标、业务保护、外部调用和授权条件以各入口为准。

## 当前研究状态备份与恢复

当前开发目标的数据库、DSA状态和冻结制品通过维护脚本备份。目录必须为本仓`.maintenance-backups/`或主仓`.recovery-artifacts/`下的全新绝对路径；备份绑定实际镜像和结构head，恢复前校验载荷摘要，镜像须仍在本机可访问。

```sh
node ../thesis-ledger/scripts/local-runtime/research-state-backup.mjs backup --target thesis-ledger-dev --output <全新私有备份绝对目录>
node ../thesis-ledger/scripts/local-runtime/research-state-backup.mjs verify --target thesis-ledger-dev --output <已有备份绝对目录>
node ../thesis-ledger/scripts/local-runtime/research-state-rehearse.mjs --bundle <备份绝对目录> --confirm-isolated --run=<成功V3任务ID>
```

恢复入口建立隔离数据库与数据副本，默认核验后自动清理。需要取用副本时增加`--retain-output=<全新私有恢复目录>`；成功输出恢复目录、隔离容器和所有权回执，用`node ../thesis-ledger/scripts/local-runtime/research-state-rehearse.mjs --cleanup-receipt <回执绝对路径> --confirm-isolated`清理。每次选1～5条成功V3代表任务，重复`--run=`指定；不覆盖当前库或卷。详见[规格](../specs/2026-10-08-current-state-recovery.md)和[真实验收](../../../thesis-ledger-infra/docs/archive/tasks/2026-10-08-current-state-recovery.md)。

观察存储的 G4a 验收使用 `node ../thesis-ledger/scripts/local-runtime/research-observation-retention.mjs --target thesis-ledger-dev --upgrade-receipt <正式升级回执目录> --compatible-baseline current --output <全新私有备份绝对目录>`。入口先核对当前源码、镜像和正式升级回执，再备份目标，在自有隔离库追加三个明确标记的观察版本，归档并实际加载对应镜像，恢复非空数据库副本并验证只读 HTTP/SDK。`current` 将当前实际通过双读和观察读取的镜像登记为恢复版本；也可传入已有且镜像仍可用的双读基线目录。镜像归档和数据库保留，隔离容器自动清理；不修改目标业务或配置，不调用模型，也不替代实源价格及 G4b 验收。


## 黑盒契约测试

当前回测 Run 的目标硬杀、Redis 短停、取消及基础生产启动使用仓库维护的[生命周期验收入口](backtest-target-recovery.md)。该入口绑定精确目标、占用更新锁、保护业务摘要并恢复原服务；应先完成主仓定向测试和结构检查。

回测实际依赖整改的隔离验证与只读目标核验由主仓维护，详情见[任务与运行边界](../archive/tasks/2026-11-20-backtest-practical-design.md)。在主仓执行：

```sh
node scripts/test-backtest-recovery.mjs
node scripts/test-backtest-price-only-process.mjs
BROWSER_REGRESSION_CHANNEL=msedge node scripts/local-runtime/backtest-practical-browser.mjs <隔离输出目录>
BACKTEST_BROWSER_SECTION=policy BROWSER_REGRESSION_CHANNEL=msedge node scripts/local-runtime/backtest-practical-browser.mjs <政策输出目录>
BACKTEST_BROWSER_SECTION=late BROWSER_REGRESSION_CHANNEL=msedge node scripts/local-runtime/backtest-practical-browser.mjs <竞态输出目录>
node scripts/local-runtime/run-backtest-practical-readonly.mjs <新的报告路径> thesis-ledger-dev-thesis-ledger-1 thesis-ledger-dev-backtest-worker-1
node scripts/local-runtime/run-backtest-practical-dsa-readonly.mjs thesis-ledger-dev-dsa-1 <新的报告路径>
```

恢复入口只创建并清理随机专属PostgreSQL／Redis和快照目录，使用当前全部migration与生产Worker；Python入口禁止外部网络，真实V3路由消费冻结Provider样本。浏览器使用实际组件与受控API，RN Web不替代原生图表或设备验收。目标只读入口读取编译产物／已有股票快照并在内存复算，禁止Provider fetch，不创建任务或改写结果；DSA入口用python -B读取源码摘要与本地HTTP能力。报告路径必须位于主仓var/acceptance下且未存在。原生包与镜像更新分别由各自正式入口处理；这些工具不提供真实模型调用授权。

先在主仓构建共享契约 `pnpm --filter @thesis-ledger/schemas build`，并通过环境注入当前 `THESIS_LEDGER_CONTROL_TOKEN` 和 `THESIS_LEDGER_DSA_TOKEN`。总入口依次运行 具名 V1 协议检查与正向业务读取：

```bash
CONTRACT_DSA_ORIGIN=http://localhost:8000 ../thesis-ledger/scripts/local-runtime/contract-test.sh
```

业务读取覆盖股票/ETF 报价、正式净值及历史、基金持仓、CNY 自身汇率、筹码和仓库固定的 ETF qfq Bar 窗口。来源未准入、权限不足或历史窗口不完整时测试失败；不要将协议检查通过记作业务通过。总入口不创建 Run，也不执行 Worker 或客户端验收。

## 契约门禁

V3 复权研究有独立协议门禁。先在主仓构建共享契约 `pnpm --filter @thesis-ledger/schemas build`，并通过环境注入已有的 `THESIS_LEDGER_CONTROL_TOKEN` 和 `THESIS_LEDGER_DSA_TOKEN`，再执行：

```bash
CONTRACT_DSA_ORIGIN=http://localhost:8000 \
  bash ../thesis-ledger/scripts/local-runtime/market-v3-contract-test.sh
```

该入口只检查 `dsa-data-v1` 能力声明、Control 握手及精确目录，并验证无效凭据与旧握手地址被拒绝。Data 使用独立令牌发送明确无效的协议版本，要求在请求解析阶段返回匹配请求身份的严格的 `dsa-data-v1` 错误，确认鉴权通过且未进入行情运行时。不会应用路由、创建目录任务、获取 Provider 行情或创建回测。输出不包含 Token 或响应体。正向来源读取使用上面的总入口。

启用 V3 之前必须通过本门禁。协议检查通过也不表示 HiThink 凭据/目标区间可用、数据库升级成功或 Server/Worker 已运行同一版本，仍需主仓 Task 中的独立验收。2026-09-29 当时目标更新因磁盘耗尽未完成，详见[失败边界](../evidence/2026-09-29-canonical-update-all-disk-blocked.md)；此前目标协议通过不能代表当前源码已部署。

三仓发布以同一份能力矩阵为准，不能只更新某一个服务镜像：

| 组件                            | 当前约束                                                                                                                                            | 门禁                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ThesisLedger 主仓               | 0.1.0；Account/Position API V1 直接切换到新账户模型                                                                                                 | 全部 migration、Prisma/raw-owned 表和动态 head 结构校验一致 |
| DSA Fork                        | `dsa-data-v1` 和 `dsa-control-v1` 分别使用独立 Token；fund-nav、Catalog 与 Provider policy 使用当前专属路由 | 本地合同测试、协议 smoke、目标正向业务读取与撤销验收 |
| Desktop / Mobile                | 与主仓同一 API schema；Mobile 只读支持 actual / shadow                                                                                              | TypeScript、UI contract 和移动端测试通过                                        |
| PostgreSQL / Redis / DSA SQLite | 由本仓 compose 管理，卷名固定且不共享                                                                                                               | PostgreSQL 存活、结构 head/表覆盖、Control Contract 检查完成后才启动应用服务   |

发布或升级时必须按“共享契约与 DSA/独立 SQLite 卷 → 保留数据的结构升级 → Server 与全部 Worker → Desktop/Mobile”顺序完成；任一 schema、结构 head、Control Token 或 capability 不匹配都停止发布，不做静默降级。DSA pytest 与真实黑盒运行需要先安装 DSA 的测试依赖。

