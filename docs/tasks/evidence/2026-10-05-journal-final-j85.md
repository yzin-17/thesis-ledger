# J8.5 最终对账与归档证据

结论：通过。完整依据为[原 Spec AC1—AC16](../../specs/2026-08-28-journal-review-trade-projection.md)，逐条实现、测试及分层证据见[最终 Review](../../reviews/2026-10-05-journal-review-completion.md)。本叶只修改说明、状态、导航与归档路径，没有修改生产输入。

## 核对范围与结果

| 核对项 | 实际结果 |
| --- | --- |
| 完整规格与非目标 | 逐段核对对象／来源、decimal、未知时间、半开窗口、资格、关联、指纹、保存／历史、AI、状态和 JSON 边界；AC1—AC16 均有明确实现及适当验证 |
| 前置阶段 | T1—T3／C1—C4 的 domain、Schema、查询、指纹、Snapshot 及真实命令隔离 PG 证据仍有效；J4—J7 的挂载、模型内容、保数据更新和目标恢复证据补齐消费及执行面 |
| 浏览器 | J8.1 12 组／44 张、J8.2 10 组／21 张、J8.3 12 组／21 张截图均存在；J8.3 的 requests.json 仍在，61 条应用请求中 8 条 POST 为确定性分析，AI 创建尝试／发送为 0 |
| 浏览器输入有效性 | 51 个文件按相对路径排序，依次散列路径、零字节及内容，SHA-256 为 5c26e23a340f27b7e433eb2be086cb8ef020d67a4d2a913d4f79b726c46c9a23，与 J8.3 相同；工作台焦点修复后的 SHA-256 保持 733a28c5a5e5b0dc4b23724cada7f278305ddde23d4a5d387bf8a4060fdfbaa5 |
| 远端提交 | git ls-remote 确认分支 codex/journal-review-ci-20261005 仍为 50196596a53a1160cf2edf9d9e0c1a09c4728d22；托管工作树干净；64 个独立生产源码与主工作区逐字节一致，三个公共导出文件按复盘片段整理的边界保持 |
| CI | [运行 37322596501](https://github.com/yzin-17/thesis-ledger/actions/runs/37322596501) 的已保存 API 记录为 completed／success、对应上述 SHA；四个必需 job 成功，desktop-packages 按 PR 条件跳过；详见[J8.4](2026-10-05-journal-ci-j84.md)及[运行记录](2026-10-05-journal-ci-j84-run.json) |
| 目标与真实 Provider | 既有 v2 单笔／周期内容及七／三条引用已通过；官方升级及最终镜像、保护性读取、发送未知的安全恢复由[J7 证据](2026-10-05-journal-review-completion.md)承担，不用浏览器固定输入或 CI 代替 |
| 问题处理 | 本叶未发现新增实现缺口；已修复的焦点、恢复、解释边界和 CI 夹具均有受影响复验。文档中的旧阻塞改为历史，导航及原 T4—T7 状态同步 |
| 范围 | 用户已取消本轮 Electron／设备验收；正式生产发布及其他工作线的剩余门禁不在此结论中。没有降低门禁、伪造条件式跳过或新增 TODO |

摘要的 51 个输入包括 Desktop Journal 下全部 ts／tsx、API client 的 journal-review-client.ts、domain／Schema 的 journal 模块及五个 browser-journal-existing 入口／测试文件。J8.2 的唯一生产修改为三个面板的焦点原子类；其后的生产输入未变，因此本叶不重复浏览器、全量测试、构建、数据库、目标更新或付费模型调用。

## 文档同步与归档

- 更新[使用说明](../../guides/2026-10-04-journal-review.md)：来源／状态、临时草稿、周期口径、历史不重算、刷新恢复、近期任务和局部清除／重读。
- 更新[最终 Review](../../reviews/2026-10-05-journal-review-completion.md)：逐条给出实现、测试、浏览器／目标／CI 证据及通过结论，说明各层基线差异。
- 原 T4—T7、C5 各子项和 J8.5／J8 已闭合；归档[原任务](../../archive/tasks/2026-08-28-journal-review-trade-projection.md)、[契约子任务](../../archive/tasks/2026-10-04-journal-review-contracts.md)、[收口任务](../../archive/tasks/2026-10-05-journal-review-completion.md)，保留稳定标识与历史记录。
- 三份仍定义当前行为的 Spec 保留在 specs；Task 原路径只留兼容归档链接，当前导航改为归档正文及本轮 Review。旧 Review 与旧执行索引保留历史时间边界，不再呈现 Journal 为当前待办。

## 最终验证

受影响 Markdown 的 Prettier 与 git diff --check 均通过；442 个本地相对链接及文件均存在。完整验收映射包含 AC1—AC16 各一条，全部通过；三份归档 Task 分别保留 20／31／40 个已完成 checkbox，没有未完成 checkbox，原路径各只有一行归档链接。51 个输入摘要和焦点修复摘要再次核对不变。所有截图及 53 条 GET／8 条确定性分析 POST 请求记录均保留。主工作区索引仍为空，未关联 WIP 保留；J8.5 文档未提交或推送，功能提交的草稿 PR 未合并或发布。

归档及最终 Review 只关闭本轮投资复盘范围，不把旧证据文件中的历史未完成描述改写为当时已通过。
