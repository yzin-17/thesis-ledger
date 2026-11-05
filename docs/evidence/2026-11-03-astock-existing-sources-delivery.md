# 现有来源市场资料验收证据

日期：2026-11-03。范围与取消依据见[交付复核](../archive/reviews/2026-11-03-market-reference-delivery.md)，操作入口见[使用说明](../guides/market-reference.md)。

状态：条件交付、最终运行包、双端与保护复核通过，三仓任务已结案归档。取消功能只按用户条件结案，不计为功能实现。

## 来源与产品合同

29 类资料使用独立能力、精确来源和严格表格合同。最终 Python 与 TypeScript 的列、单位、作用域及来源修订逐字段比较通过；全部 29 类真实 DSA→Server→API client 响应共 132 条样本，再次按当前合同与请求关联复核通过。缺失值、来源当前快照及局部历史均保真。研报 EPS 和行业排名已从可查询目录撤销；它们的试读／失败原件保留。

## 运行目标与保护

目标为本机 `desktop-linux` 下 `thesis-ledger-dev`。代码快更后 Server、Worker、DSA 健康，镜像及挂载保持，不作结构迁移或清库。策略最终修订为 181：原 20 条逐项保持，新增 29 条均有效，总计 49 条。最后只读计划新增／撤销均为零。原 Provider 与准入表指纹未变；两条取消路由的撤销有本轮首次计划的创建归属证明。

`business-before.json` 与 `business-after.json` 按表名排序比较完全一致：19 张 Account／Ledger／Trade／Cash／Position／Instrument／ResearchReport 业务表共 38421 行，计数及全行摘要不变。三仓原 HEAD 和 Git 索引摘要均未变；11500 个原源码文件的差异仅落在本轮明确修改的 9 个主仓接缝和 8 个 DSA 接缝／测试登记文件，infra 原源码无改动。新增实现文件另由合同、边界及定向测试覆盖。

完整原件与可执行验收脚本在 `.recovery-artifacts/astock-existing-sources-delivery-20261103/`，该目录不提交：

- `source-before.json`：跨三仓源文件、HEAD 与索引基线。
- `source-progress.json`：43 次来源 HTTP 尝试、1 个 SDK 会话及失败／修正回执。
- `runtime-*.json`、`final-delivery-matrix.json`：各类实际 API client／Server／DSA 原件及最终 29 类对账，取消试读按最终目录剔除。
- `reference-routes-plan.json` 及后续路由回执：原配置指纹、增量计划、期望修订和取消项创建归属。
- `target-sync-reviewed.log`：当前目标源码更新、健康和镜像保持证明。
- `desktop-*.json`、`desktop-*.png`：实际资料与来源游标、非法输入和受控错误。
- `android-reference-proof.json`、`ios-market-reference-reviewed.xcresult`：最终包的原生页面实际消费；`android-reviewed-runtime.json`、`ios-reviewed-runtime.json` 留最终 29 类 JS 包摘要。Android 复用 17 个原生库，iOS 原生主代码摘要保持；本地测试签名不作为商店发布。
- `business-before.json`、`business-after.json`、`source-protection-final.json`、`current-final-plan.json`：业务表、原源码／HEAD／索引及 Provider／准入／路由保护。

## 检查命令与输入

下列命令在对应仓库目录执行。Node 与 Python 使用本机已安装的缓存运行时，DSA 的 Python 搜索路径包含本仓及现有 `.venv/lib/python3.12/site-packages`；未安装或升级依赖。

| 命令或入口 | 输入范围与最后结果 |
| --- | --- |
| 主仓 `vitest run`（Schema／API client 各包） | Schema 1410 通过、3 既有跳过；API client 185 通过。最后仅修正两处测试变量后，`test/market-reference.test.ts` 在 Schema／Server 各包分别复跑 21／3 通过，运行时代码未变 |
| DSA `python -m pytest -q tests/test_market_reference_projection.py tests/test_market_reference_execution.py tests/test_configured_market_routes.py tests/test_report_metadata_page.py tests/test_report_metadata_http.py` | 123 通过，包含新增 35 项及既有研报／路由回归；当前收集清单仍为 123 项。HiThink 仅修改合成夹具启用前提 |
| infra `node --test scripts/astock-existing-source-check.test.mjs scripts/market-reference-routes.test.mjs` 及同名 Python 测试 | Node 共 5 项、Python 共 7 项通过；只读计划、目标身份、并发和创建归属均受检查 |
| 主仓 `node scripts/check-boundaries.mjs`、`check-workspace-dependencies.mjs`、`check-accessibility.mjs`、`check-file-size-guardrails.mjs`、`check-secrets.mjs` | 最终输入均通过；尺寸门禁保留 7 项既有警告。14 个新增 TS／TSX 文件严格 ESLint 通过，未提高阈值或增加忽略 |
| DSA `python scripts/check_data_runtime_contract.py`、`check_data_service_boundary.py --syntax`、`check_thesis_ledger_capability_boundaries.py` 及数据测试清单门禁 | 运行时打包、语法／依赖边界、能力边界及数据测试登记通过 |
| Schema → API client → 客户端的类型检查与 Desktop 生产构建 | 当前目录与推导声明一致；Server／Desktop／Mobile 类型检查及 Desktop 生产构建通过，保留既有大包提示 |
| infra `./scripts/sync-code.sh all` | 最新日志 `target-sync-reviewed.log`：三服务健康，DSA 镜像 `a8ed8dc…`、Server／Worker 镜像 `1654b11…` 保持；仅容器可写层更新 |
| `scripts/market-reference-routes.mjs --mode=plan --output=<绝对证据路径>` | 最终计划 `current-final-plan.json`：修订 181，49 条，无新增／撤销；原 20 条与 Provider／准入摘要保持 |

## 页面与设备

Desktop 真实财报与来源单位显示通过，快讯两页各 5 条，第二页请求使用第一页返回的来源游标，记录标识不重复。非法证券在出站前拒绝，受控 503 不渲染为空态。生产构建另用受控空列表验证加载提示、重复提交禁用和空态文案，未发额外来源请求；这部分不充当真实空态来源证明。

Android `Medium_Phone_API_37.0` 与指定 `iPhone Air` 模拟器均使用最终 29 类 JS 实际读取财报，中文类型、来源、报告期及 CNY 金额可见。连接分别沿用 `10.0.2.2:3000/api/v1`、`127.0.0.1:3000/api/v1`，未清除应用数据。iOS 最终单项 UI 测试通过，Android 页面树及截图断言通过。原生工程和依赖未改，复用已有编译二进制；未新增完整 Native compile、真机、商店发布或远端 CI 结论。

视觉检查以 Desktop 生产构建在 1440／768／390 像素回放真实财报响应，三档均无页面横向溢出；窄屏表格在自身容器滚动，手机原生页面使用分行卡片。逐张检查截图后，来源、单位、日期与操作可读。工具原始结果为 2 项警告及 3 项失败：既有 `MARKET DATA` 标签、字体回退、共享 Sheet 的 `shadow-lg`、共享按钮的 `shadow-xs`，以及浮层按设计遮挡背景标题。未修改检测规则或为本功能新增这些样式，按既有组件的局部扩展范围人工复核接受，不宣称自动视觉检查零失败；原件及说明留在 `visual-inspection/`。

## 最终复核

原编号 4～10 的全部子范围已按交付矩阵归属；AC1～AC6、R1～R5 与三仓执行叶均有对应结果。没有剩余本轮门禁或转入 TODO 的未完成实现。29 类资料仅作为按需事实查询交付，不扩为严格历史回测、全历史完整性或自动交易输入。任务正文移至归档，原活动目录不留占位文件；现行产品规格和使用说明保留。

实际移动 4 份 Task 及 1 份已被产品合同接续的历史 Spec；核对 243 个本地文档链接，无失效链接或活动原路径残留，三仓 HEAD／索引最终保持。一次性 Vite／Metro／生产预览进程已停止，目标 Docker 服务和已验客户端保留。
