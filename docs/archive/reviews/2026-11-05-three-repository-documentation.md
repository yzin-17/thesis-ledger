# 三仓文档目录与归档核对

日期：2026-11-05。范围为 `thesis-ledger`、`daily-stock-analysis`、`thesis-ledger-infra` 的文档分类、导航、完成事项归档和引用修复。此次仅整理文档及相应的静态路径引用，不重新执行产品验收。

## 输入与保护边界

| 仓库 | 分支与 HEAD | 整理前文档文件数 |
| --- | --- | --- |
| ThesisLedger | `main / 41111336` | 1,419 |
| DSA | `yzin / dc6d4a44` | 184 |
| infra | `main / 172ec22` | 50 |

文件数包含文档、素材与现存隐藏文件，不等于任务数。开始时主仓已有 Review 导航修改和候选功能方案未跟踪文件；在此基础上整理。候选方案正文逐字节保持，原导航中的方案入口保留。文件整理与验证阶段未操作业务数据、运行配置、数据库或 Docker；Git 提交和推送按用户随后明确的授权执行。

## 统一目录

三仓以 `docs/README.md` 和 `docs/DOCUMENTATION-GUIDE.md` 提供导航与规则，目录按七类职责及实际内容创建，见[文档指南](../../DOCUMENTATION-GUIDE.md)。有活动 Task 时使用 `tasks/README.md`，无活动 Task 时由本仓文档中心说明接续状态。

| 目录 | 内容 |
| --- | --- |
| `design/` | 长期系统架构、领域模型和 ADR，按设计导航分组 |
| `specs/` | 需求、范围、行为与验收合同 |
| `tasks/` | 当前执行计划、状态与证据指针 |
| `guides/` | 使用、开发、部署与维护说明 |
| `reviews/` | 审查判断、差异与待评估方案 |
| `evidence/` | 验证记录、原始材料、固定样本与 `benchmarks/` 中的可重复基准 |
| `archive/` | 完成任务、结案报告、被替代合同和退役资料 |

`CHANGELOG.md`、许可证原文和 DSA 的 `INDEX.md` 保留工具约定内容，许可证归入 `guides/licenses/`。当前系统设计、领域和决策仍由各原文档维护，长期设计与需求规格分别维护正文及归档生命周期。

## 归档判断与结果

归档先检查完整范围、必要门禁、最终核对和未决义务，再看文件位置；不以日期或勾选数量代替验收。归档保留原文件名、任务 ID、原始失败和场景边界。历史记录中的“当前”“尚未部署”等按原日期理解，新增说明仅澄清归档适用性。

| 仓库 | 顶层目录数 | 当前目录 |
| --- | --- | --- |
| ThesisLedger | 7 | `design/`、`specs/`、`tasks/`、`guides/`、`reviews/`、`evidence/`、`archive/` |
| DSA | 5 | `design/`、`specs/`、`guides/`、`evidence/`、`archive/` |
| infra | 3 | `specs/`、`guides/`、`archive/` |

当前没有活动任务的两仓，其执行状态已并入各自文档中心；DSA 来源验证入口并入证据导航。原任务标识和锚点由完成任务正文保留，导航只链接当前或历史责任入口。

主仓原任务导航的阶段记录保存于[历史摘录](2026-11-05-task-index-history.md)，DSA 原产品索引保存在[历史区](../../../../daily-stock-analysis/docs/archive/legacy/INDEX.md)。两份旧 Review 跳转壳的引用直接指向原归档正文。

### 本轮归档的 Task

| 仓库与任务 | 关闭依据与证据边界 |
| --- | --- |
| [DSA 历史数据按需读取](../../../../daily-stock-analysis/docs/archive/tasks/2026-10-09-history-data-on-demand.md) | 本仓各叶已有完成记录；整体 D1～D5、S/L 和目标消费由[主仓完成任务](../tasks/2026-10-09-history-data-on-demand.md)及[10-31 最后验收](../../evidence/2026-10-31-history-demand-l3v.md)收口。其他 Tushare/RQ 条件不归本任务所有。 |
| [infra 仅代码更新](../../../../thesis-ledger-infra/docs/archive/tasks/2026-09-15-code-only-docker-update.md) | 原 T1 与 AC1～AC6、真实成功及回滚、原最终 Review 已通过；不将可写层同步解释为镜像发布。 |
| [infra 构建 context](../../../../thesis-ledger-infra/docs/archive/tasks/2026-10-05-compose-build-context.md) | B1/B2 和正式保数据更新、镜像及目标业务证据已记录。 |
| [infra 虚拟盘容量](../../../../thesis-ledger-infra/docs/archive/tasks/2026-10-05-docker-disk-capacity.md) | V1～V3 已完成后续对账；禁止继续扩容的决定保留，不重新执行容量操作。 |
| [infra 投资复盘恢复](../../../../thesis-ledger-infra/docs/archive/tasks/2026-10-05-journal-target-recovery.md) | R1～R3、真实在途恢复、禁止重发及数据保护均有证据；不推断供应商收到或计费。 |
| [infra 构建网络](../../../../thesis-ledger-infra/docs/archive/tasks/2026-10-21-docker-build-network.md) | N1～N4、正式更新、API/页面和保护对账通过；原 TLS 失败保留。 |
| [infra 已验镜像复用](../../../../thesis-ledger-infra/docs/archive/tasks/2026-10-25-update-reuse-thesis-ledger-image.md) | R1/R2 的同镜像重建与文件持久化通过；原真实上游正文缺口不属于镜像复用任务的完成义务。 |
| [infra 构建空间保护](../../../../thesis-ledger-infra/docs/archive/tasks/docker-build-space-guard.md) | 最新 T21～T25、实际保卷重建和最终一致性核对已完成；未注入真实 ENOSPC、没有 shellcheck 等原证据边界保留。 |

这 8 份任务完成本轮文档一致性核对，未发现仍由自身持有的未决执行义务。infra 的全部维护 Spec 继续留在现行目录。主仓仅将已明确被替代的 RouteTarget V2 合同归档，其现行 V3 接口与原验收责任仍有明确接续入口；其他有效产品 Spec 不因实施结束归档。

### DSA 原产品资料

[原产品历史区](../../../../daily-stock-analysis/docs/archive/legacy/README.md)承接分析、模型、告警、Bot、WebUI、客户端、旧 API 规格与关联素材。退役依据为[纯数据服务完成任务](../../../../daily-stock-analysis/docs/archive/tasks/2026-10-18-data-only-service.md)中的源码退役与 DG2/DG3；本轮没有取消新的产品需求。中文、英文与繁体原文一起移动，修复相互引用，保留原语言，并补充中文历史适用性说明。

独立证据迁移覆盖 864 份：主仓 832 份与 DSA 26 份统一位于 `docs/evidence`，infra 6 份已结案且仅属于归档任务的报告位于 `docs/archive/evidence`。其中 691 份 Markdown 只修正路径引用，173 份截图、XML、JSON、JSONL、Base64 等材料保持原始字节。Task 负责执行状态，Review 负责审查判断，二者链接独立证据正文；跨任务与 CI 共用材料只有一份。另外 4 份可重复基准归入主仓 `evidence/benchmarks/`，保留原输入及正文。

## 继续保留的当前责任

主仓[活动任务索引](../../tasks/README.md)仅保留 3 份任务，具体执行边界与授权以 Task 为准：

- [统一数据能力适配层](../../tasks/2026-10-09-unified-data-capability-adapter.md)：H07-K37e-live 真实 Tushare 现金正向消费及其父项仍开放，原账号权限和准入条件保持。
- [研究比较与复核](../../tasks/2026-10-18-research-evidence-evolution.md)：T13c/G4b.3 的观察窗口已到期，合格经济价格条件仍未满足；P3 保留单链的决策已完成，不重新列为待办。
- [基金盘中估值](../../tasks/2026-11-04-fund-intraday-valuation.md)：G2.2 仍要求真实交易日至少两个有效分钟和同日官方净值误差；失败分钟、闭市读取与受控数据不代收。

DSA 与 infra 已无活动 Task，不表示主仓上述业务门禁通过。TODO 的实施范围和验收责任没有因整理目录发生转移。

## 引用修复与验证

检查以写前文档快照和完整路径映射为基线，覆盖三仓的 Markdown 链接、图片、HTML 引用、链接定义、跨仓路径、带行号的本地链接和原本有效的锚点。新增导航另行检查目标存在。代码围栏内的语法不按 Markdown 链接判定。

- 对移动后的正文与原文进行路径投影后比较，保留原正文与所有复选框；素材和旧 API 规格按原文本或 Git blob 校验，内容保持。
- 原任务/AC、证据和授权条目未因归档改勾选；三份活动任务的勾选保持。
- 修复两处原已归档 Task 的旧链接，以及一处带行号的已移动目录来源证据链接。
- 退役源码的本地链接改为固定 Git 版本链接：主仓 `da002744bd31`，DSA `dd26571509e8`；已通过本地 Git 对象及现有远端 refs 确认路径与提交，不将旧源码解释成当前实现。
- DSA 5 份既有文档测试只更新静态文件输入路径，另更新二进制素材的 `.gitattributes` 路径及协作规则镜像中的文档引用。Python AST 和静态文档输入存在性检查通过；未重新运行已退役的产品测试。
- DSA `python3 scripts/check_ai_assets.py` 返回 `[ai-assets] OK`。
- DSA 移除排除整个 `docs/specs/` 的 `.gitignore` 条目，需求规格随整理纳入 Git；提交树中的文档链接另行核对通过。
- 三仓 `git diff --check` 通过。

最终文件链接及锚点统计由本轮一次性审计生成，见下方最终核对结果。已运行与证据读取直接相关的离线定向测试；未运行全套应用测试、原生编译、浏览器、Docker 或来源请求。目录整理不提供新的目标运行态、Provider 或费用验收证据。

## 目录归并验证

长期架构、领域与 ADR 统一存放于 `design/`，历史设计进入 `archive/design/`；`specs/` 仅维护需求与验收合同，按合同适用性单独归档。当前设计目录包含主仓 36 份正文和 DSA 16 份正文，分别用一个导航分组，保留原文件名、首次日期、任务 ID、AC 和正文事实。10 份历史设计和两个设计导航同步迁移，相关引用已更新。

使用、开发和运维说明统一进入 `guides/`，基准位于 `evidence/benchmarks/`。3 个仅承担导航的索引已并入对应文档中心或证据导航，权限与未决业务责任保持。

主仓许可证清单脚本的输出路径同步为 `docs/guides/third-party-license-inventory.md`，仅修改路径，未执行生成命令。两份冻结回测样本中的原 `source.references` 继续保留原始来源路径，未改写历史事实或摘要；当前可访问位置由文档索引和归档记录提供。归并的实际正文只修正引用，导航按当前职责重建，原始材料字节保持。许可证脚本语法检查和 4 类基准 manifest 校验通过；前述 79 项定向测试的输入未变，复用已有结果。

## 证据路径消费者验证

| 执行目录与命令 | 结果 |
| --- | --- |
| 主仓：`node --test scripts/market-split-clock-driver.test.mjs` | 6 项通过，实际使用本地已安装 Node 26.13.0 的绝对路径 |
| 主仓：`pnpm --filter @thesis-ledger/schemas exec vitest run test/market-split-acquisition-v3.test.ts` | 18 项通过 |
| 主仓：`pnpm --filter @thesis-ledger/server exec vitest run test/market/market-split-acquisition-v3.test.ts test/backtest/v3-captured-research-preparation.test.ts` | 29 项通过 |
| infra：`node --test scripts/dsa-target-contract.test.mjs scripts/dsa-target-recovery.test.mjs scripts/eastmoney-split-admission.test.mjs` | 18 项通过，使用替身，不执行 Docker |
| infra：`python3.12 scripts/eastmoney-split-admission.test.py` | 7 项通过，隔离样本与临时存储 |
| DSA：`python3.12 -m pytest -q tests/test_eastmoney_split_clock_proposal.py` | 1 项通过；原映射内容与摘要匹配；2 条既有依赖弃用提示 |
| DSA：`python3 scripts/data_test_scope.py` | 范围与原库存摘要校验通过：410 个数据文件、1 个部分文件、200 个退役文件、412 个目标；不是执行了 412 项测试 |

共 79 项离线定向测试通过。维护脚本的证据挂载路径、DSA 测试库存与 CI 过滤路径同步到独立目录，未更改准入、范围判定或摘要门槛。

首次直接使用项目 Node 入口和 `.venv/bin/python` 时，分别因本地缺少匹配的 Node 24、Python 入口失效而未进入测试。随后使用现有 Node 26.13.0 和 Python 3.12；Python 进程以一次性 `PYTHONPATH` 读取现有 `.venv/lib/python3.12/site-packages`。没有安装或替换依赖、修改全局版本或修补虚拟环境。上述结果验证文件读取及离线合同，不作为目标 Node 24 运行态验收。

## 最终核对结果

- 扫描三仓共 1,424 份 Markdown：主仓 1,252、DSA 117、infra 55。
- 校验 `docs/` 及三仓首页中的 6,508 处本地文件或目录引用，缺失目标为 0；新增入口均可解析。
- 设计分离前 1,084 处有效锚点引用在调整后继续可解析，未发现因移动失效的锚点。
- 864 个证据文件逐一核对：691 份 Markdown 保留原正文与勾选，173 个其他文件保持原字节；证据目标均未被 Git ignore 隐藏。此前已归档的任务、Review、Spec 和产品素材保全结果继续有效。
- 五份既有测试中可静态解析的文档路径表达式共 35 处，目标全部存在，Python AST 解析通过。
- 三仓 `git diff --check` 与 DSA 协作资产检查通过；原候选功能方案正文保持。

本节只验收文档整理，不改变产品任务状态。

## 恢复方式

需恢复文档布局时，按分类映射将同名文件移回原路径，并反向修正对应引用；已提交变更通过新的反向提交表达，保留三个仓库中的其他工作区修改。原 Review 导航的用户改动和候选方案须保留。归档文件的原日期、ID、正文及素材均保留，历史证据仍可追溯。
