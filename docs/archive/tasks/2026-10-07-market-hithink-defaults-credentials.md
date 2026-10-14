# HiThink 默认路由与页面凭证配置实施任务

对应 Spec：[HiThink 默认路由与页面凭证配置](../../specs/2026-10-07-market-hithink-defaults-credentials.md)

> 状态：D1、T1、T2、G1、G2 完成；2026-10-08 真实 Web 客户端验收通过并归档。保留已有未提交修改，不提交、不发布。
> 基线：主仓已有 697 项 dirty；DSA 的 Provider runtime 与变更记录有既有修改。Docker 只使用 infra 正式入口。

## 任务

- [x] D1：核对目标准入阻断原因。
  - 覆盖：AC4；启动依赖：无。
  - 入口：目标 `/api/market-data/providers`、精确能力目录及 DSA SQLite 的只读连接。
  - 边界：只读 Provider 标志与准入状态/有效期，不输出凭证明文，不签发或恢复准入。
  - 完成条件：解释主要来源的缺记录、撤销、过期与缺配置，并与当前目录一致。
- [x] T1：客户端自动填写 HiThink 默认主源。
  - 覆盖：AC1；启动依赖：精确目录与 Provider 契约已核对。
  - 入口：`useMarketPolicyWorkflow.ts`、`MarketPolicyPanel.tsx`、现有预设 helper 与测试。
  - 边界：市场数据默认值、草稿初始化和对应测试；保留当前布局和其他功能。
  - 完成条件：定向默认值/组件/异步草稿测试通过；缺凭证与刷新均不误改用户选择。
- [x] T2：DSA 暴露并执行 HiThink 页面凭证。
  - 覆盖：AC2、AC3；启动依赖：现有加密存储、凭证 schema 与运行时快照契约已核对。
  - 入口：DSA `provider_credentials.py`、Control HTTP、HiThink 日线/报价/事件运行时、凭证 HMAC 与连接测试。
  - 边界：页面凭证贯穿现有 HiThink 读取链，HMAC 绑定页面来源；连接测试从超限 Provider runtime 提取为独立诊断职责，HiThink 使用各能力的真实读取器。包含定向 HTTP/运行时测试、DSA 专题说明及变更记录；不增加准入能力。
  - 完成条件：隔离数据库通过实际 HTTP 写入、加密重开、保留、轮换、失效和环境恢复；客户端字段及提交参数验证通过。
- [x] G1：包级检查、正式同步与目标接口。
  - 覆盖：AC5 / 构建与 API；依赖：T1、T2 本地验证通过。
  - 入口：Desktop build、必要工程门禁、infra `scripts/sync-code.sh all` 及浏览器。
  - 边界：现有目标应用代码同步；不重建镜像、不改真实凭证或准入记录。
  - 完成条件：正式入口退出成功，目标接口返回当前凭证表单，部署源码与宿主输入一致；Desktop 构建及相关工程检查通过。
- [x] G2：真实客户端展示与凭证输入。
  - 覆盖：AC5 / 界面；依赖：T1、T2、G1。
  - 入口：运行当前源码的 Desktop 开发页面或原生客户端；只读查看路由页与凭证侧栏。
  - 完成条件：界面直接展示默认主源与 HiThink API Key 表单；真实账号页面保存与在线权限由用户输入后验证，未执行时明确证据边界。
  - 结果：2026-10-08 实际页面访问成功，默认 HiThink 回显、无预览按钮、API Key 保密表单和焦点边框通过。真实页面凭证保存未执行；环境凭证的所选日线读取通过，未扩大为其他账号或历史窗口权限。见[客户端验收](../../reviews/2026-10-08-market-provider-client-acceptance.md)。

## 规划预检

结论：Ready。D1 为只读诊断；T1 与 T2 分别拥有客户端草稿和 DSA 凭证边界；G1 依赖二者，G2 独立承接原 G1 的客户端断言，依赖图无环。没有将其他来源适配或准入恢复混入本次实施。

## 执行记录

- D1 已完成：目标 Provider/能力 API 与只读 SQLite 状态一致；逐源原因见[诊断证据](../../tasks/evidence/2026-10-07-market-route-admission-diagnosis.md)。
- T1 本地定向验证：`pnpm --filter @thesis-ledger/desktop exec vitest run test/market-policy-defaults.test.tsx test/market-policy-workflow.test.tsx test/provider-credentials.test.tsx test/market-data-provider-ui.test.tsx`，四个文件 27 项通过。最后补充凭证配置后自动默认值及保存修订断言，再运行 `test/market-policy-workflow.test.tsx`，3 项通过；其他已通过输入未变化。
- T2 本地定向验证：凭证/加密/HTTP 27 项通过；日线、报价、分红与 Provider 接缝回归 144 项通过。额外执行的宽 registry 清单测试失败，原期望不包含工作区已有 `official-dividends`；该能力由并行工作新增，不属于本次写入范围，记录一项未通过，不据此修改其他人的清单。
- T2 的 DSA 定向测试使用 `.venv/bin/python -m pytest`，输入为 `test_hithink_control_credentials.py`、`test_provider_credentials.py`、`test_thesis_ledger_hithink_credential_revision.py` 及 HiThink 日线/报价/事件、Provider runtime、RQData 凭证接缝测试。总计 171 项通过；另外一项宽 registry 清单失败已如实保留。最后 smoke 健康维度调整后重跑新 HTTP 文件，5 项通过。源码语法检查通过；超限 Provider runtime 将连接诊断提取为独立职责，当前 2300 行，小于 HEAD 的 2486 行。
- G1 包级验证：`pnpm --filter @thesis-ledger/desktop build` 退出 0；相关新改 TS/TSX 的 ESLint、Prettier 通过，`node scripts/check-boundaries.mjs` 输出 `Import boundaries: OK`；新增文档相对链接检查通过。Desktop 构建 JS 中旧预览按钮文案计数为 0、凭证配置文案存在。
- G1 目标入口：在 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行 `./scripts/sync-code.sh all`，退出 0，无额外环境参数。脚本构建并重启 DSA、Server、Backtest Worker；未改数据库结构或外部卷。三个容器就绪，镜像 ID 未变化；快更位于容器可写层，重建后会消失。
- G1 独立目标验证：HiThink registry 返回 `api_key` 和保密必填 `apiKey` 字段；精确目录完整，ETF qfq 为 `ready`，股票日线、报价和分红仍为 `not_admitted`。八个凭证/运行时输入的 SHA-256 均与部署容器一致；DSA 新启动日志没有导入或语法错误。真实配置继续来自环境，未将真实环境 Key 写入页面，也未修改准入记录。
- 日志：`/tmp/market-hithink-desktop-build-20261007.log`、`/tmp/market-hithink-sync-20261007.log`、`/tmp/market-hithink-dsa-target-20261007.log`。没有提交、推送、镜像发布或原生应用重装。

## 最终一致性 Review

- [x] 验收断言、实现及证据逐项一致；AC5 客户端断言由 G2 真实页面补齐。
- [x] 已保存配置、既有改动与独立准入语义保留。
- [x] 定向、包级和目标检查分别记录，无证据升级。
- [x] 必要文档同步，真实账号输入与外部权限边界明确。

结论：本地实现、目标准入诊断、凭证 API 和真实 Web 客户端验收通过，任务归档。真实账号页面写入未执行，边界符合 AC5。此前并行新增来源的宽清单断言失败保留其历史范围；本轮未覆盖或撤销并行实现，当前入口以客户端验收记录为准。
