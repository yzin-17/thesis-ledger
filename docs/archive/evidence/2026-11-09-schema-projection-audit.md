# 严格校验与对象投影排查记录

规格：[严格校验与数据投影排查](../../specs/2026-11-09-schema-projection-audit.md)。

## 范围与方法

基于当前未提交工作区，检查 Desktop、Mobile、Server、API Client 的校验消费者，并读取 Schemas 中的实际严格性配置。初始文本盘点 333 个 `safeParse` 调用，排除 colocated 测试后为 330 个生产调用。AST 辅助扫描同时覆盖 `.parse`、过滤、返回空值和异常降级路径；类型辅助检查覆盖 546 个含校验调用的消费者文件。

不将搜索命中等同于缺陷：先核对完整数据生产者、消费者用途、Schema 根配置和失败路径，再用合法完整输入复现。类型辅助扫描定位的“已知额外字段”中，复盘请求是真缺陷；研究摘要和 DSA 单窗关联投影的三项实际使用 `.strip()`，属于有意投影；两项 Prisma JSON 联合类型的原型成员不是业务对象的额外字段。对未知 JSON 输入和嵌套合同另沿生产者及消费链核对，发现三处多窗口响应被单窗校验拒绝。

初始清单、AST 与类型扫描结果保存在 `/tmp/schema-filter-sites.txt`、`/tmp/schema-audit-ast.json`、`/tmp/schema-projection-type-refined.json`。这些数字描述静态扫描范围，不表示对所有历史数据库记录和外部供应商做过在线验收。

## 确认问题与修复

| 位置 | 原有问题及复现 | 最终处理 |
| --- | --- | --- |
| API Client `journal-review-client.ts` | `explain` 接受快照请求，但严格解读 Schema 不包含合法 `aiRunId`；完整请求抛 `unrecognized_keys` | 先验证完整快照请求，再投影新解读所需字段；旧任务引用不进入新请求，未知字段及非法 UUID 仍拒绝 |
| Research `research-observation-materials.ts` | 合法多窗口观测因 `windowObservations` 被单窗 Schema 拒绝，降级为材料不可用 | 使用 Market 的完整证据成功/失败投影，保留完整观测、经济来源和可见时点约束 |
| Backtest `backtest-preflight-v3-execution.ts` | 已选中的合法多窗口行情被单窗关联 Schema 拒绝，预检返回 blocked | 使用同一完整证据解析器并传入固定请求，继续核验 RouteKey、revisions、价格协议和历史可见性 |
| Market `market-derived-raw-window-v3.ts` | 合法已冻结多窗口 raw 在单窗请求关联校验时抛错 | 使用完整证据解析器，保留完整响应哈希绑定、原始价格条件、转换证据与截止时点约束 |

共享能力仍归 Market：`market-window-response-v3.ts` 新增原解析器的成功/失败投影，不建立另一套合同。没有改宽 Schema、删掉多窗口证据、改写历史快照或提升来源准入。回测预检存量大文件由 689 行减至 686 行。

## 检查后保留的路径

| 路径 | 保留理由 |
| --- | --- |
| Desktop 自选添加 | 前序修复已显式投影五个身份字段，保留其回归；本轮未重复修改 |
| Mobile `features/market/InstrumentPicker.tsx` | 原本就只投影 `id`、代码、市场、类型和 active，再做严格身份校验 |
| Server `watchlist.repository.ts` | 数据库查询使用五字段 `identitySelection`，不存在完整行误传 |
| 共享标的搜索、持仓确认、研究及策略选择器 | 搜索响应使用完整结果合同或显式身份输入，业务过滤依据 active、市场和类型；未发现第二个同类标的误过滤 |
| 证券定位和行情/资讯入口 | 定位请求只传代码与类型，资讯入口构造规范身份，不把完整 Instrument 行交给子集 Schema |
| 研究页标的导航种子 | 来自 `instrumentSearchResultSchema.pick(...)` 的实际根配置保留 passthrough，完整目录资料不会因额外字段被拒 |
| Research 报告详情到摘要、DSA 多窗关联到单窗投影 | 显式 `.strip()`，并已在对应完整合同边界校验；不把类型扫描命中当作缺陷 |
| AI Provider 配置、调用事实及执行摘要 | 读取对应配置/事实字段，生产者按同一合同写入；严格拒绝未知协议、非法能力或不完整执行仍是必要门禁 |
| 回测来源冻结、Market 窗口哈希及 DSA 协议 | 原本已按多窗分支使用完整解析器；继续保留内容指纹和请求关联 |
| 导入识别、游标、金额/币种、签名与历史状态合同 | 校验对象用途与合同一致，或为标量；失败保留原诊断/准入语义，不因排查统一放宽 |

## 验证

所有测试均使用受控输入及实际生产合同，没有运行真实 AI、回测、付费来源或提交业务记录。

- API 修复前：新增用例因 `aiRunId` 被拒失败。修复后 API Client 全包 42 文件、214 测试通过；回归覆盖合法完整请求、旧任务引用不进入传输、未知字段、非法身份、缺失证据、非法草稿及跨账户响应。
- 研究多窗修复前：现行 Market 完整解析器接纳合成证据，研究消费者却返回 unavailable，2 个合法场景失败；4 个非法反例按原合同拒绝。
- 其他多窗消费者修复前：新增预检用例被 blocked，raw 派生抛 `Unrecognized key: windowObservations`。修复后 Server 9 文件、103 测试通过，包含研究材料/方法/复核、DSA 多窗协议/客户端、快照、执行预检与 raw 派生。非法内容指纹、未知字段、来源错配、未来观察、哈希绑定和微秒时点继续拒绝。
- 测试用的多窗生成器增加可选采集时间参数，默认值保持；研究样本使用其真实日期重新计算内容指纹，未制造未来或无效证据冒充合法输入。
- API Client、Desktop 和 Server build，Mobile typecheck，以及全部相关源码/测试 ESLint 通过。Desktop 保留既有 bundle 尺寸提示。
- 新边界门禁 2 测试与仓库 `check-boundaries.mjs` 通过，限制研究、回测及 raw 派生消费者退回单窗口响应校验；来源协议、Market 构造器、纯请求校验保持各自职责。
- 文件尺寸检查通过，保留六项存量警告；`git diff --check` 通过。

命令与过滤日志：`/tmp/schema-audit-*`。关键命令使用 `pnpm --filter <包> exec vitest run <路径>`；完整包测试仅用于 API Client。没有修改界面 DOM、样式或原生配置，本轮没有以新增浏览器样式验收或 Native compile 代替合同测试。

## 运行态检查

在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh thesis-ledger`，默认参数，退出 0。预检通过，Server、相关 workspace 与 Worker 产物同步；Server/Worker 健康。镜像保持 `sha256:744b2fdee55705ffe8fdd2ca62f0ca5c7f4a8cbe6ded00f27e0c0125f235141c`。只更新容器可写层，重建后会恢复镜像代码；未修改数据库结构或卷。

独立读取 `/api/v1/health` 为 healthy，数据库、Redis、DSA 均健康。容器内四个受影响 Server 产物的 SHA-256 与宿主机实际构建结果逐一一致。没有以健康检查冒充业务运行。

Desktop 在宿主机构建、由当前 Vite 服务读取源码。真实浏览器通过 Vite 加载编译后的 API Client，使用完整快照请求成功调用解读客户端，验证传输正文未携带旧 `aiRunId`；fetch 由受控响应接管，真实 AI 请求数为 0。Server 未配置该 Desktop bundle 的静态入口，曾对 `/assets/...` 探测得到 404，随后使用实际 Vite 入口完成验证；同时校正前序两份记录中将同步脚本描述为更新 Desktop 静态资源的表述。

业务范围只读；真实 AI 创建、历史回测运行及冻结数据写入不属于本轮验收动作。运行态证据位于 `/tmp/schema-audit-runtime-sync.log`、`/tmp/schema-audit-runtime-health.json`、`/tmp/schema-audit-browser-client.log`。
