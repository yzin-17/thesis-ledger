# J8.3 真实报告消费与刷新恢复验收

对应[收口任务 J8.3](../2026-10-05-journal-review-completion.md)，覆盖完整规格 AC8、AC13—AC16 的本叶页面断言。结论：通过。既有目标报告、真实浏览器操作、21 张截图和[61 条应用请求记录](j83-browser-2026-10-05/requests.json)共同支持结论。

## 环境与边界

- 日期：2026-10-05。先访问正式 `/journal` 页面，确认目标标记账户的三个候选可读；随后进入 `http://localhost:5173/test/browser-journal-existing-report.html?accountId=95bd7e1a-72df-4cd7-aae8-121d8545e5ea&mode=actual`。
- 验收页直接挂载正式 `JournalReviewWorkspace`，使用正式账户读取函数、TanStack Query、API Client、Schema 校验、确定性结果和报告渲染。Vite 将真实请求代理到目标 `http://localhost:3000`。没有使用 J8.1 的固定事实或报告替身。
- 浏览器原本没有这三份运行的本机引用。可见“导入既有验收任务引用”按钮先读取目标报告和当前对象/周期候选，核对冻结指纹、版本及范围，再通过生产引用函数写入摘要键和任务 ID。此步骤是验收数据准备，不是产品提供的任意历史报告导入功能。
- 验收页只向目标发送 GET 和两类确定性分析 POST；研究创建、快照保存及其他写入由验收页阻止。本轮没有触发这些阻止分支，AI 创建尝试和实际发送均为 0。一次读取失败通过可见按钮注入，状态为 503，记录来源为 `injected`；之后的重读返回真实目标响应。
- 生产源码、依赖和运行时未作本叶修改；新增 5 个 `apps/desktop/test/browser-journal-existing-*` 验收文件。未提交工作区的 `HEAD=514abeebfe57bac0c16271439d8b777ff3b02a9f`。按路径排序，将路径、零字节分隔符及内容依次计算 SHA-256，51 个相关文件的摘要为 `5c26e23a340f27b7e433eb2be086cb8ef020d67a4d2a913d4f79b726c46c9a23`；范围为 Desktop journal 源码、API Client journal 文件、domain/schemas 的 journal 源码及本叶 5 个验收文件。
- [截图目录](j83-browser-2026-10-05/)有 21 张 JPEG，总计 7,606,270 字节。使用默认桌面视口，没有留下视口覆盖；验收页、请求记录及原 Vite 服务保留。

## 已存在的运行与页面内容

| 类型 | 任务 ID | 状态 / Prompt | 实际页面核对 |
| --- | --- | --- | --- |
| 单笔 | `e2c829d1-6ad6-4325-81bb-26e931047669` | succeeded / `journal-review-v2` | 7 条引用；入场 10、分批退出 12/13、加权退出 12.5、目标 13、偏差 -0.5、持有 2 天、净收益 4.6、反事实 -2.4、差额 7。保留行情路径未知及条件测算说明。 |
| 周期 | `67e14795-2113-4174-b366-9c95db6ddb14` | succeeded / `journal-period-review-v2` | 3 条引用；窗口 `[2026-01-01T00:00:00Z, 2026-02-01T00:00:00Z)`，完整周期 1 个、减仓 2 个，各自净收益 4.6 CNY，平均持有 2/1.5 天；盈亏比保留证据不足。 |
| 既有失败运行 | `34abe590-02d6-4bb9-8018-17ec2909bd5a` | failed / `journal-review-v2` | 页面显示租约过期、发送结果未知和禁止自动重放 Provider 的错误；确定性结果不被清空。 |

两份成功报告在页面显示 Provider `lmstudio`、模型 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive`、算法 `journal-decimal-1` 及各自 v2 Prompt。单笔引用的 `sourceId` 为 `journal:<完整周期对象 ID>:83e072ecab80e56c5d720e7364c01632555bdfa8e85af53810924cfa61137982`，`toolCallId=1e36233b-c024-4b4c-8c90-cb503458b5e2`；周期为 `journal-period:95bd7e1a-72df-4cd7-aae8-121d8545e5ea:actual:2026-01-01T00:00:00Z:2026-02-01T00:00:00Z:3:3`，`toolCallId=bf3f998e-6db1-4f14-90ac-094971393dc6`。页面引用与真实响应的来源及调用 ID 一致。

这次读取沿用[既有 v2 模型内容验收](2026-10-05-journal-model-content-v2.md)的两份报告，没有重新提交内容验收或生成新报告。

## 实际步骤与结果

| 用例 | 操作与实际结果 | 截图 |
| --- | --- | --- |
| J83-01 单笔真实报告 | 点击导入按钮后，近期任务区读取已有单笔报告；模型、Prompt、算法、结论、7 条来源、风险和未知项均可读。通过。 | [单笔近期报告](j83-browser-2026-10-05/01-existing-object-history.jpg) |
| J83-02 单笔刷新恢复 | 记录刷新阶段，点击“刷新当前验收页”；无需选择对象或重算，近期任务区 GET 同一单笔 ID。选择完整周期并显式开始确定性复盘后，当前输入面板也恢复同一 ID，净收益 4.6 CNY。没有 AI POST。通过。 | [刷新恢复](j83-browser-2026-10-05/02-object-history-after-refresh.jpg)、[当前输入报告](j83-browser-2026-10-05/03-object-current-report.jpg) |
| J83-03 周期真实报告 | 填入已有报告的自定义窗口并分析，当前面板读取同一周期任务；完整周期/减仓统计与报告一致。切换近期任务到周期，读到同一份 3 条引用的报告，两处独立展示正确元数据。通过。 | [周期当前与近期报告](j83-browser-2026-10-05/04-period-current-and-history.jpg)、[模型内容与来源](j83-browser-2026-10-05/11-period-model-content.jpg) |
| J83-04 既有失败任务 | 近期任务切到既有 failed 运行，页面给出明确失败和发送结果未知说明。重新执行无付费的单笔确定性分析，仍显示收益 4.6 CNY 和当前成功报告；近期失败区保持独立。通过。 | [失败终态](j83-browser-2026-10-05/05-existing-failed-task.jpg)、[保留确定性结果](j83-browser-2026-10-05/06-failed-history-keeps-deterministic.jpg) |
| J83-05 单笔局部读取失败 | 设置下一次 AI GET 返回一次 503，再重新核对相同输入。当前 AI 区显示读取失败，确定性指标保持。点击“重新读取”后真实 GET 200，恢复原单笔任务，未创建新任务。通过。 | [一次读取失败](j83-browser-2026-10-05/07-object-read-error.jpg)、[重读恢复](j83-browser-2026-10-05/08-object-read-retry.jpg) |
| J83-06 单笔引用清除 | 点击当前“清除任务引用”，当前报告撤下，确定性结果和收益保留。移除失败近期引用后刷新，再选择同一对象并分析：当前 AI 按钮可用、没有恢复已清除的当前引用；尚未移除的单笔近期引用仍能读取报告。未点击生成。通过。 | [清除当前引用](j83-browser-2026-10-05/09-object-reference-cleared.jpg)、[刷新后仍已清除](j83-browser-2026-10-05/10-cleared-object-after-refresh.jpg) |
| J83-07 周期刷新恢复 | 用正式近期任务选择和移除按钮移除单笔近期引用，保留周期引用后实际刷新；无需重新输入窗口，近期区 GET 同一周期 ID，3 条引用可读。再次显式分析同一周期窗口，当前区恢复同一周期报告，统计保持 1/2 个对象和各 4.6 CNY。通过。 | [周期自动恢复](j83-browser-2026-10-05/12-period-history-after-refresh.jpg)、[当前输入恢复](j83-browser-2026-10-05/13-period-current-after-refresh.jpg) |
| J83-08 周期失败及清除 | 一次 AI GET 503 只在当前 AI 区反馈，两个统计表保持；重读 GET 200 恢复原任务。清除周期当前引用后，统计保留，近期报告仍可读。通过。 | [一次读取失败](j83-browser-2026-10-05/14-period-read-error.jpg)、[重读恢复](j83-browser-2026-10-05/15-period-read-retry.jpg)、[清除引用保留统计](j83-browser-2026-10-05/16-period-reference-cleared.jpg) |
| J83-09 既有 CURRENT 快照 | 读取 `82310e15-66c2-486c-80be-ff6bc72991c3`，页面显示“已保存的复盘结果”，成交、原计划、草稿和保存时指标可读，收益 4.6 CNY；原始输入详情 `open=false`。只有读取请求，没有分析或保存。通过。 | [CURRENT 快照](j83-browser-2026-10-05/17-current-snapshot.jpg) |
| J83-10 既有 STALE 快照 | 读取 `4e670373-64b1-468b-9dee-c0645cc44c75`，页面显示“历史结果 · 证据已变化”，仍为保存时收益 4.6 CNY、止损草稿 8 和原计划止损 9。原始详情默认关闭，显式展开可读保存时指纹，再次关闭；没有重算或改写。通过。 | [STALE 快照](j83-browser-2026-10-05/18-stale-snapshot.jpg)、[显式展开详情](j83-browser-2026-10-05/19-stale-advanced-detail.jpg) |
| J83-11 高级 JSON 隔离 | 正式页面默认只有高级 JSON 按钮；打开后为独立 Sheet，明确旧 number 口径不进入正式对象、统计或快照。没有执行兼容分析；Escape 关闭，历史结果保持。通过。 | [独立高级入口](j83-browser-2026-10-05/20-legacy-json-isolated.jpg) |
| J83-12 全部引用移除 | 清除两个当前引用并通过近期区移除三个任务引用后实际刷新；近期区不再显示，没有报告 GET 或创建请求，仅读取账户、候选及历史。服务端两份成功报告仍可读，默认配置、账本和两个快照保持。通过。 | [全部引用清除后刷新](j83-browser-2026-10-05/21-all-references-cleared-refresh.jpg) |

刷新恢复的是任务 ID 和服务端冻结报告。临时选择、草稿与确定性分析结果没有被额外写入浏览器存储；重载后若要恢复当前分析区，须显式重新核对同一输入。近期任务区可以直接读取已保留的引用。当前引用清除与近期引用移除是两个独立动作，都不删除服务端报告。

两份既有历史快照的 `outputSnapshot.aiExplanation` 都为 `null`；页面没有把当前报告元数据补写为保存时元数据，也未创建新快照来改变这个事实。

## 请求证据

[请求记录](j83-browser-2026-10-05/requests.json)来自验收页实际调用 `fetch` 的方法、路径、响应状态和阶段；不记录事实正文、模型输出或凭据。记录覆盖准备及复验，不裁剪重复 GET；前期验收页重载的读取也保留。源码稳定后单笔、周期、失败、清除和刷新断言均已复验。

- 共 61 条应用请求：59 条真实目标响应、2 条明确标注的 503 注入，0 条被阻止请求。
- 53 条 GET，8 条 POST。POST 只涉及 `/journal/analysis/object` 和 `/journal/analysis/period`，均为确定性分析；`/journal/explanations`、`/journal/period-explanations` 的创建 POST 尝试及实际发送均为 0，快照保存或删除请求为 0。
- 单笔纯刷新阶段 4 条 GET：账户、候选、历史列表及原单笔报告；周期纯刷新阶段同样为 4 条 GET，其中报告路径指向原周期 ID。两个阶段均没有 POST。
- 全部引用清除后刷新只有 3 条 GET：账户、候选及历史列表，没有报告读取或 POST。
- 每次局部“重新读取”只增加原报告路径的一条 GET 200；一次注入只消耗一条 AI GET，不改变目标服务。

这份记录证明实际页面恢复和读取没有自动发起研究任务。写入阻止规则的定向测试另行验证，不以规则本身替代零创建尝试的实际记录。

## 保护性读取及本地检查

验收前后分别在仓库根执行 `node scripts/journal-target-read-smoke.mjs`，均退出 0：

- 三个受保护账户经济字段哈希与既有 v2 基线一致：`eaea242e974b40f990a3411c2b5923aec363a537d4d4cb26c0d601bf8bc441e8`、`2789992acdb831c683de43ac26ca03691e7c74625e60b37fe58ab2e9d9e30464`、`3c9168af4691de88f7b5e3a4c29ec44b2c306fa3185b1000b9cdbb0abe0023e8`。
- 默认模型 revision `2` 保持；目标仍有 3 个候选、2 份历史快照；两份旧报告仍为 succeeded/v2、7/3 条有效引用，Provider 和模型保持。

在 `apps/desktop` 执行：

- `pnpm exec vitest run test/browser-journal-existing-report.test.ts`：11 项通过，验证仅导入 ID、事实/版本变化拒绝导入、写入请求不转发、一次读取失败与后续真实读取分开记录、重复安装记录器不重复代理或计数。
- `pnpm exec tsc -p tsconfig.j83-temporary.json`：通过，包含生产 `src` 和本叶验收入口、辅助文件及测试。临时配置继承桌面配置、`rootDir` 为仓库根，完成后删除。
- 本叶 4 个 TS/TSX 文件的 ESLint、5 个验收文件的 Prettier 检查通过。

仓库边界检查、文件尺寸 ratchet、`git diff --check` 及本叶文档格式/本地链接检查通过；尺寸门禁保留 9 个未增长的存量警告。生产实现和旧用例输入未变化，没有重跑已通过的完整交互矩阵、目标升级、恢复、数据库检查或镜像构建。

## 最终对账

J8.3 的真实单笔/周期报告、来源元数据、刷新同任务、近期切换、局部失败与清除、CURRENT/STALE 历史及默认关闭详情均有页面和请求证据。Task、Review 已同步，本叶通过。J8.4 当前改动的远端 CI 与 J8.5 完整 AC 对账仍未完成；原 T4—T7 和收口任务保持打开。改动未提交，未推送或运行远端 CI。
