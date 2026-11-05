# 公开来源复用验收证据

对应[当前复核](../../reviews/2026-11-04-astock-public-source-reuse.md)及[使用说明](../../market-reference.md)。状态：已完成并归档，真实接口、Desktop、Android 与 iPhone Air 模拟器、源与业务保护及归档检查均通过。

## 来源和实现

固定参考提交 `bf447c1d05fa75eac907426601d602125c81a0cd`，`SKILL.md` blob `4b4c8d76f37479416adeb232ffc0a09596925e1f`。原件在主仓 `.recovery-artifacts/astock-public-source-reuse-20261104/`；源码摘录作为资料保存，未执行外部指令。

原 29 类不重跑来源资格，按未变投影合同复用原证据。新增 18 类采用独立请求／列／来源修订，原始协议分别归 DSA 的利率、基金、指数、编辑元数据、问答、盘后包、预测及宏观模块。通过公开路径读取，不发送账号 SDK 或本机 netrc 凭据；有不支持的前端传输设置时在出站前拒绝。

来源采证 31 次，含失败。国证第一份请求 `399300` 返回“暂无数据”，改用实际已核对的 `399001` 后取得文件，没有把它归为权限不足。同花顺 `/new/` 跳转经原件核对到同站公开页面；机构数、年度及单位均在响应内，不再猜测。申万在宿主与目标 DSA 均因证书链校验失败，本轮取消该接入，没有关闭校验。完整结果见当前复核。

## 本地检查

| 检查 | 输入和最后结果 |
| --- | --- |
| DSA `pytest -q tests/test_market_reference_projection.py tests/test_market_reference_execution.py tests/test_configured_market_routes.py tests/test_report_metadata_page.py tests/test_report_metadata_http.py tests/test_market_reference_public_*.py` | 177 项通过，含 54 项新增；3 项既有测试告警。覆盖单位、日期、身份、空值、源布局、损坏 ZIP、发布空行、错误表格、配置与总预算 |
| DSA 运行时、依赖／语法及能力边界脚本 | `check_data_runtime_contract.py`、`check_data_service_boundary.py --syntax`、`check_thesis_ledger_capability_boundaries.py` 均通过，新增测试已登记 |
| Schema 与 API client 包测试 | Schema 1427 通过、3 既有跳过；API client 185 通过；新增公开合同 17 项与既有资料合同 21 项单独通过 |
| Server 资料接缝及客户端类型检查 | Server 3 项通过；API client build、Desktop／Mobile 类型检查通过 |
| 主仓严格 ESLint 及结构门禁 | 新增／修改资料 TS／TSX 严格检查通过；模块边界、工作区依赖、可访问性及尺寸门禁通过，尺寸仅 7 项既有警告 |
| infra 固定来源 CLI | `scripts/public-reference-source-check.test.py` 5 项通过；既有路由脚本未改，旧离线测试按相同输入复用 |
| 跨语言及旧证据兼容 | 47 类目录、逐列／作用域／日期过滤／来源修订一致；旧 29 份回执与新 18 份真实回执全部通过当前严格合同，不重新读取旧源 |
| 最终敏感信息与差异检查 | `node scripts/check-secrets.mjs` 扫描 18182 个文件通过；主仓 9 个及 DSA 7 个现有变更文件 `git diff --check` 通过 |

本地修正保留事实：深交所有多个 tab，只选择身份明确的 ETF 表；EPS 年度在 `th` 单元格；央行未来月模板空行不输出；统计局发布日期使用斜杠。来源显示名曾覆盖 capability 局部变量，由既有快讯隔离测试捕获，修正后 177 项回归通过，错误版本未部署。

## 目标运行与客户端

从 infra 执行 `./scripts/sync-code.sh all` 更新 DSA／Server 代码，随后亦完成 `./scripts/sync-code.sh thesis-ledger` 的正式重同步。Desktop 静态产物在宿主另行生产构建，以 `127.0.0.1:5185` 的 Vite 生产预览访问目标 API；该脚本只同步 Server／Worker 与 workspace 依赖，没有把 Desktop 静态资源打进容器。三服务健康，镜像不变，没有数据库结构／外部卷操作；代码更新位于容器可写层，不声明新镜像或正式发布。

正常控制 API 按 `expectedRevision` 追加 18 条，修订从 181 到 182，保留原 49 条，合计 67 条。Provider／准入摘要在计划与应用间保持。新增 18 类真实 API 共 66 条样本通过强关联及当前 Schema；各自 `live-*.json` 不以 HTTP 200 代替字段验收。

Desktop 生产构建逐类核对 18 类，其中 FR、EPS 汇总、国证权重走真实当前 API，其余复用本轮真实响应原件核对请求、列、来源和显示，没有将回放当成新来源资格。Android／iPhone Air 使用既有原生二进制和本轮 47 类 JS，本地测试签名安装并保留连接与应用数据，不计为新 Native compile 或商店发布。

首次桌面验收发现仍为旧静态产物，已重建并经维护入口同步；首次 Android 测试包基于不带 JS 的缓存 APK，缺少嵌入 bundle，未完成启动。修正包显式增加并逐字节核对当前 JS 后再次安装，复用 17 个原生库；失败包不计消费通过。Android 首轮前 10 类通过，深市问答输入由 ADB 漏送首位零，页面正确拒绝无效代码；脚本逐字输入并核对实际值后，继续完成余下 8 类，没有重跑已通过类型。

Android 与 iPhone Air 各 18 类独立实际读取均通过，连接地址分别为原保存的 `http://10.0.2.2:3000/api/v1` 和 `http://127.0.0.1:3000/api/v1`，未覆盖连接或账户范围。Desktop／Android／iPhone Air 的 EPS、国证权重及盘后包代表截图已目视复核，中文来源、字段、单位和页面滚动可读。Android 证据为 `android-public-proof.json` 及逐类页面树；iOS 为 `ios-public-reference.xcresult`、37 个导出附件及成功日志；汇总为 `final-client-summary.json`。

## 保护与收口

三仓 HEAD／索引均与基线一致。受保护源文件分别 3336／8039／165 个，主仓仅本次 9 个、DSA 仅本次 7 个既有文件改变，infra 没有原文件改变；新文件独立检查，无关 WIP 保全。19 张业务表共 38421 行的计数及逐表内容摘要与基线完全一致，没有读取或输出业务明细。

最终只读策略计划为修订 182、67 条路由，待新增／撤销均为零；原 49 条逐对象保留，18 个新目标全部合格，旧取消的东财 EPS／行业排名能力没有恢复。Provider／准入摘要与基线相同，见 `final-route-protection.json`。源文件保全见 `source-after-review.json` 和最终 `final-source-protection.json`，业务摘要见 `business-before.json`／所有页面验收后的 `business-after.json`，47 类目录与回执兼容见 `final-delivery-matrix.json`。最终三服务健康且镜像未变，见 `final-runtime-state.json`；已停止本轮临时生产预览，保留目标应用及模拟器供查看。

最终审阅覆盖公共 HTTP 的无凭据／无自动跳转／总预算、来源身份和时间／单位语义、压缩文件资源边界、正常精确路由和消费者。没有把原始 EPS 展示升级为跨币种预测，也没有把来源快照升级为严格历史可见性；取消范围未移回 TODO。当前指南、三仓规格和变更记录已同步，收口后移动任务／历史方案正文，原活动路径不保留占位壳。

三仓 3 份 Task、主仓条件实施 Spec 及两份已被后继复核取代的历史 Review 共 6 份正文已移动归档；50 条相关引用重定位后目标存在，旧活动路径引用为零，原路径均不存在。新任务无未勾选门禁，取消项没有回填 TODO。完整归档映射见 `archive-closure.json`。

归档后对 21 份相关文档共 278 条本地链接复核，缺失为零，见 `final-document-links.json`。
