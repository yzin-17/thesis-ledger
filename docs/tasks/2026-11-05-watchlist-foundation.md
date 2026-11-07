# 自选与共享标的详情实施任务

任务标识：watchlist-foundation。首次建立：2026-11-05。[对应规格](../specs/2026-11-05-watchlist-foundation.md) · [任务总入口](README.md)

## 当前状态与接续

已进入实施。名单存储、管理 API、行情读取及两端自选入口已接入。隔离 PostgreSQL 验证并发添加、修订冲突、跨身份分组拒绝和删组保留成员。HTTP 用例使用两个登录身份，由父进程注册两名用户，经真实 HTTP 添加后退出并新启 Nest 子进程核对重读，移除后再次重启确认为空。目标部署记录见下文。

可复跑证据：从主仓执行 `node scripts/test-journal-review-postgres.mjs test/watchlist/storage-postgres.integration.test.ts`，以及 Server build 后的 `node scripts/test-journal-review-postgres.mjs test/watchlist/http-postgres.integration.test.ts`，存储两例、HTTP 一例通过。定向行情用例 `apps/server/test/watchlist/prices.test.ts` 验证 50 项混合页、单批报价、基金并发上限 8 和单项故障隔离。Desktop 两例组件交互验证切组取消、详情跳转及报价失败后仍能管理、冲突重读。Mobile 五例验证自选／研究／浏览选择零确认写，持仓录入保留确认，报价失败后仍能移除。两端通过类型检查，Desktop 生产构建通过。DSA 公告查询与路由七例通过，完整代码与日期范围先于分页过滤。受控组件与部署后页面分别记录。

隔离 Edge 已从自选分组进入详情，验证新闻有结果、空窗口与读取失败，打开公告及标的研究报告。由日线点位进入模型后可返回同一标的和分组。双登录身份的关系隔离另经实际 HTTP 验证。

W06 的招商银行标的新闻已通过目标 Desktop 验收。Edge 从本机目录打开 `600036.SH` 详情，同花顺首屏 5 条新闻逐项核对了标题和原文链接，页面显示“部分覆盖”。同批条目也已在竞技场研究材料中核实。[双端验收](../evidence/2026-11-06-watchlist-arena-target.md#招商银行正式新闻接入与双端验收)

W06 场外基金公告已通过 DSA 目录、正式 API 和 Desktop 四宽度验收；华夏成长混合可直接打开两份 10 月 27 日的官方披露。已找到免密钥的历史相关报道入口；近三天新闻仍待具备可核验基金身份、发布时间和来源范围的正式准入。[验收记录](../evidence/2026-11-06-watchlist-arena-target.md#场外基金公告与免密钥新闻核对)

目标库已保数据升级，8 张业务表逐表核对，Desktop、Android 和 iOS 模拟器均已从同一分组进入标的研究。临时关系已清理，保护表摘要复核一致。WG1 的目标结构和读写已取证，依赖项 W06 尚待完整验收。[本机开发环境验收](../evidence/2026-11-06-watchlist-arena-target.md)

[本地验证记录](../evidence/2026-11-06-watchlist-arena-weekly-local.md) 汇总本轮使用的环境、命令和验收边界。

## 执行入口

先读 [Instrument 目录](../../apps/server/src/market/instrument.service.ts)、[图表详情](../../apps/server/src/market/market-detail.service.ts)、[Desktop 标的研究选择](../../apps/desktop/src/features/ai/ResearchInstrumentPicker.tsx) 和 [Mobile 选择器](../../apps/mobile/src/features/market/InstrumentPicker.tsx)。W01 先核对 owner 取得方式、目录失效语义及现有 API Client 的导出结构，在 packages/schemas 建立关系与冲突的正反样本；通过后再进入存储。

每行拥有一个结果及相应定向测试。先执行所属包的定向用例，再运行受影响包测试与 build、仓库依赖和结构门禁；以真实场景验证对应行的最后一列。沿用工作区 AGENTS.md 的 RTK、原生编译和 Docker 入口约束。涉及新表时以新增 migration 保数据，维护 migration matrix、打包输入和必要的 raw-owned 登记，隔离 PostgreSQL 通过后才可通过相邻 infra 的 `./scripts/update.sh thesis-ledger` 更新获准目标。跨 feature 的新增依赖同步维护 `scripts/check-boundaries.mjs`。保持现有未提交工作与业务数据。依赖未就绪、超出写集或缺少外部条件时，记录受影响的叶与下一次可验证条件。

## 任务、依赖与验收映射

| 任务 | 启动依赖 | 对应标准 | 主要写集／交付 | 完成条件与验证 |
| --- | --- | --- | --- | --- |
| [x] W01 | 实施获准 | W-AC1、W-AC2 | 公共 Schema：关注、分组、修订与目录身份 | 解析两市场同代码、重复添加、分组移动、冲突和失效读取；请求不可指定 owner |
| [x] W02 | W01 | W-AC1、W-AC2、W-AC6 | 主仓 Prisma 新 migration 与 Watchlist repository | 隔离 PG 证明 owner＋instrument 唯一、跨身份分组无效，既有记录及数据库结构仍可读 |
| [x] W03 | W02 | W-AC1、W-AC5 | Server Watchlist 管理接口、API Client 对应调用 | 以真实 HTTP 和隔离 PG 完成无账户添加→进程重启重读→移除→再次重启确认已移除；两身份负例并核对既有账本、资产与修订 |
| [x] W04 | W03 | W-AC2 | 分组、原子移动／删组、修订排序接口 | 并发两个旧修订只有一个成功；删组保留成员、置顶顺序稳定 |
| [x] W05 | W03 | W-AC3、W-AC5 | 列表只读编排、名称与权限投影 | 50 项混合页计数验证批量、并发、去重、局部失败、持仓读取权限及基金日期；上游未访问历史 |
| [ ] W06 | W01 | W-AC4、W-AC5 | 详情／研究调用合同与只读选择器的用途区分 | 同一 instrumentId 能定位新闻窗口、公告、报告与研究预填；基金资格失败保留原因；研究选择零确认写 |
| [ ] W07 | W04、W05 | W-AC1、W-AC2、W-AC3 | Desktop 自选导航、列表和管理交互 | 组件交互验证分组、排序冲突恢复、切页取消、换身份清缓存，行情失败仍能添加 |
| [ ] W08 | W04、W05 | W-AC1、W-AC2、W-AC3 | Mobile 市场中的自选列表与管理交互 | 同一账户身份跨端重读，移动端排序、停用目录与局部失败正常 |
| [ ] W09 | W06、W07 | W-AC4、W-AC5 | Desktop 共享详情和研究助手跳转 | 从目录／持仓／自选打开同一标的，区分资讯空与失败，报告返回原筛选 |
| [ ] W10 | W06、W08 | W-AC4、W-AC5 | Mobile 市场详情及研究导航 | 覆盖报告与资讯入口、市场快讯隔离、基金资格和原持仓确认回归 |
| [ ] WG1 | W02、W03、W04、W05、W06 | W-AC5、W-AC6 | 目标结构与 HTTP 验收证据 | 保数据升级后核对结构 head、服务和实际关系读写，逐项核验保护对象 |
| [ ] WG2 | WG1、W09 | W-AC3、W-AC4、W-AC6 | 目标浏览器验收证据 | 无账户与有持仓各走实际入口；记录股票／ETF／OF 及港美股代表样本、来源、币种和不可用原因 |
| [ ] WG3 | WG1、W10、W09 | W-AC1、W-AC2、W-AC4、W-AC6 | 移动宿主和跨端验收证据 | 两端使用同身份保存再重读、关闭详情返回；两身份互不可见。分别留 Android／iOS 结果 |
| [ ] WG4 | WG1、WG2、WG3 | W-AC1 至 W-AC6 | 自选与详情最终核对 | 逐条核对证据、实际写集与支持范围，记下仍未通过的门禁 |

目标验收时将实际输入版本、命令、结果与环境写入证据文档并回链。每个终端保留自己的结果；涉及原生依赖或构建配置时另跑对应平台原生编译。最终一致性核对只审计上述证据与剩余义务，不替代任何一项验证。
