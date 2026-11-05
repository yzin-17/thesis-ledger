# 账号等级与本地权限记录验收

对应[原任务](../2026-10-09-unified-data-capability-adapter.md) TAP1～TAP4；断言见[现行规格](../../specs/2026-10-09-unified-data-capability-adapter.md#account-access-persistence)。

## 范围与实现

本轮由主线程执行，保留三仓既有未提交工作。DSA 来源声明拥有积分门槛与独立权限，公共层只执行有类型的来源策略；配置与权限报告在同一个本地 SQLite 事务提交。120 分只检查 `daily`，其余五项记录为当前等级未包含且零尝试。私有 HMAC 绑定账号、认证、端点、凭证代次、等级及规则版本；单纯启停复用原检查时间，凭证移除清除等级。

Schema 与 API 支持持久权限、等级和未包含状态；凭证侧栏先检查后保存，保存后不补发第二次检查。功能说明、路由新选项和精确检查只展示已确认可用的功能。RQData TODO 保持。

## 已通过检查

- DSA 定向 `tests/test_tushare_account_access.py`：26 项通过，包含等级筛选、同输入草稿复用、重启恢复、端点失效、普通检查跳过、保存失败回滚、其他设置保留、四类坏记录拒绝与预算耗尽后未包含项保持零尝试。
- DSA 配置、全来源精确检查、能力注册及 Control V3：最终扩展回归 407 项通过，仅有四条既有依赖弃用警告。
- Schema `src/market-account-level.test.ts`：3 项通过。
- Desktop 账号与凭证侧栏、功能说明及等级：5 文件/25 项通过；晚到结果隔离、失败保稿和其他来源凭证交互保持。本地 JSON 属性顺序与独立权限勾选顺序归一后，不误判为账号草稿或未保存变更。
- Server 精确检查、Control 和配置 CAS：3 文件/28 项通过；Server、Desktop 类型检查通过。
- DSA 能力边界与运行打包合同、主仓模块与依赖边界通过；ControlStore 未增加原 2396 行规模。
- Schema、API Client、Server 和 Desktop 构建通过。Desktop 构建首次指出新测试样例缺少目录元数据，修正后复验通过；现有大体积 bundle 提示保留。
- 本轮修改的 TS/TSX 定向 ESLint 零警告通过，DSA 修改模块及测试的关键错误 Flake8 检查通过。
- 文件尺寸门禁通过，报告八个其他存量超阈值文件警告；本轮未修改这些文件或调整阈值。文档相对文件链接及两仓 `git diff --check` 通过。

## 命令与输入范围

以下命令在当前未提交工作树执行；不宣称为干净提交验收，未提交或合并代码。

```sh
# daily-stock-analysis
.venv/bin/python -m pytest -q tests/test_tushare_account_access.py tests/test_exact_provider_configuration.py tests/test_all_provider_exact_checks.py tests/test_thesis_ledger_capability_registry.py tests/test_thesis_ledger_control_v3.py --disable-warnings
.venv/bin/flake8 --select=E9,F63,F7,F82 data_provider/tushare_account_level.py src/services/thesis_ledger_account_access_store.py src/services/thesis_ledger_account_access_configuration.py src/services/thesis_ledger_account_access_contract.py src/services/thesis_ledger_account_access.py src/services/thesis_ledger_provider_exact_checks.py tests/test_tushare_account_access.py
.venv/bin/python scripts/check_thesis_ledger_capability_boundaries.py
.venv/bin/python scripts/check_data_runtime_contract.py

# thesis-ledger
pnpm --filter @thesis-ledger/desktop test test/provider-account-access.test.tsx test/provider-credentials-sheet.test.tsx test/market-provider-capabilities.test.tsx test/provider-credentials.test.tsx src/features/market-data/account-level.test.tsx
pnpm --filter @thesis-ledger/schemas test src/market-account-level.test.ts
pnpm --filter @thesis-ledger/server test test/market-provider-exact-checks.test.ts test/market-control.service.test.ts test/market/market-provider-config-cas.test.ts
pnpm --filter @thesis-ledger/schemas build
pnpm --filter @thesis-ledger/api-client build
pnpm --filter @thesis-ledger/server build
pnpm --filter @thesis-ledger/desktop build
node scripts/check-boundaries.mjs
node scripts/check-workspace-dependencies.mjs
```

主仓写入范围为账号访问/Provider 合同、Server 透传、Desktop 账号等级字段/凭证保存/权限面板/功能与路由候选，以及对应测试和本主题文档。DSA 写入范围为 `data_provider/tushare_account_level.py`、来源声明与能力策略合同、`thesis_ledger_account_access{,_store,_configuration,_contract}.py`、精确检查、ControlStore 事务回调与公开设置投影、配置 API、对应测试、账号权限指南及 CHANGELOG。保持其他既有改动，未维护新的全局设置或数据库 migration。

## 实际页面与物理进程重启

使用实际 React 凭证侧栏和功能行、真实 DSA Runtime/ControlStore/configure_provider，连接隔离 SQLite。HTTP 接缝只接受合成端点与合成 Token，返回固定合法接口信封，未调用外部供应商。

1. 页面填写合成 Token 与 120 分，未勾选两项独立权限，点击“检查权限并保存”。
2. HTTP 接缝仅收到 `daily` 一次；当前配置代次 1，持久记录一项 allowed、五项 not_included，五项 attempted 均 false；页面只显示中国内地股票日线，并显示已跳过五项。
3. 终止并重新启动承载真实控制模块的宿主 Python 进程，复用同一本地 SQLite；刷新实际页面后积分仍为 120，一项 allowed 与五项 not_included 均恢复，进程本次 HTTP 调用计数为 0。
4. 390×844、768×1024 和默认 1280×720 宽度检查，表单、功能行、底部操作均可访问，无横向遮挡。浏览器实测发现独立权限共用字段标签会覆盖各自可访问名称，已改为 FieldSet/FieldLegend；复验为各自独立名称。临时视口已恢复。
5. 最终页面点击“检查功能权限”，本次进程仅发出 daily 一次；配置代次仍为 1，持久记录检查时间更新到 `2026-10-21T14:21:33.575905+00:00`，一项可用、五项未包含保持，页面显示本地记录与新的检查时间。最终截图：`/Users/yzin/.codex/visualizations/2026/10/21/01a15e8c-8fbe-7ae0-ac5d-2b1ba3fd338f/tushare-account-level.png`；临时页面与验收进程已清理。

该结果证明真实模块的本地配置、页面及进程重启恢复，不是新的 Tushare 实源成功，也不替代目标容器验收。最近检查时间来自持久报告；无积分查询 API 的结论保持，积分由用户填写。

## 首次目标更新失败（历史记录）

正式 `sync-code.sh all` 首次因沙箱禁止进程查询未取得更新锁，允许该正式入口读取进程后重试，兼容性预检报告 DSA 依赖/Dockerfile/数据库结构输入变化而拒绝快更。没有放宽门禁，随后执行默认保留数据的正式 `update.sh all`。

首次完整更新在 DSA `pip install -r requirements.txt` 阶段失败：连接 `https://pypi.org/simple/python-dotenv/` 返回 SSL UNEXPECTED_EOF_WHILE_READING，脚本内有界重试后退出 1。失败发生在容器替换前，原五个容器继续健康，数据卷未被删除。该次没有修改正式入口、切换镜像源、跳过 TLS 校验或手工替换容器；TAP4 当时受网络阻塞。用户随后授权处理 TLS 并完成正式更新，解除结果如下。

当前账号 120 分不要求验证未包含的 `fund_div`，RQData 保持 TODO。未保存真实凭据、启用来源或修改目标路由；历史实源拒绝和现金正向消费未通过记录保留。

## 正式更新与目标运行态验收

用户本轮明确要求解决 TLS、继续正式脚本并保留现有数据。PyPI 复查时宿主、现有 DSA 的直接 HTTPS 与现有宿主代理均返回200，保留证书校验。正式重试的 PyPI 安装及 DSA 镜像构建通过，随后 Server 的 Alpine 索引出现独立 TLS 错误；修正 infra 正式 Bake 入口的可选构建代理参数后完成更新。设计与定向验证见 [infra 任务](../../../../thesis-ledger-infra/docs/tasks/2026-10-21-docker-build-network.md)。

实际入口为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/update.sh`，执行目录为同一 infra 仓库，目标 `all`，最终退出0。第一次自动权限审批超时的命令未启动，按工具允许重试后执行；没有绕过原进程检查或更新锁。最终调用的非敏感参数为：

```sh
BUILD_HTTP_PROXY=http://host.docker.internal:7890 \
BUILD_HTTPS_PROXY=http://host.docker.internal:7890 \
BUILD_NO_PROXY=localhost,127.0.0.1,::1 \
REUSE_DSA_IMAGE_ID=sha256:ebe9d9a742b396b5e885f007dedc49c960010094d095545be9b33ff2dfa8b632 \
DEV_DATABASE_MODE=check PULL_SERVICE_IMAGES=false PULL_BASE_IMAGES=false \
COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \
pnpm_config_registry=https://registry.npmmirror.com \
npm_config_registry=https://registry.npmmirror.com \
./scripts/update.sh all
```

代理仅传入标准构建参数；实际 DSA、Server、Worker 环境均无这些代理变量。没有修改全局 Docker/系统代理或关闭 HTTPS 证书校验，下载来源及依赖版本约束保持。复用本次已完成的 DSA 镜像，没有为 Server 的网络故障再次编译 DSA。

### 镜像与实际接口

- DSA 镜像：`sha256:ebe9d9a742b396b5e885f007dedc49c960010094d095545be9b33ff2dfa8b632`。
- Server/Worker 镜像：`sha256:6cf684b55348b9fe7e7869d5dedf5b50605c5b184602189d19f2034080f41140`；两者同一产物，五个服务健康。PostgreSQL、Redis 镜像与容器保持。
- 三个应用容器最近1000行日志扫描无 ERROR、模块缺失或缺表错误；实际页面浏览器错误日志为0。
- 10个 DSA 实现文件、6个 Server/Schema 编译文件与当前宿主工作树逐文件 SHA256 相同；未使用快更覆盖镜像。
- 实际 Server 健康接口 `/api/v1/health`、Provider 注册表及目录 HTTP200，共享 Schema 校验通过。当前工作树的目标注册表为27来源、目录189目标；旧20/143为此前库存，账号权限增量本身未新增来源或目标，本轮不代收其他既有工作树声明的实源验收。
- 政策仍为166、applied、原16路线。真实 Tushare 仍停用、未配置、configVersion=0；`POST /api/market-data/providers/tushare/test` 携带120分返回HTTP201、5项 not_included、1项 credential_missing，attempted 合计0，检查前后配置不变。
- 专用入口 `node scripts/tushare-account-level-acceptance.mjs <私有报告绝对路径>` 在实际新 DSA 容器的 `/tmp` 使用合成账号和独立 SQLite：一次 daily 受控响应后保存120分及6项权限；第二个独立 Python 进程恢复相同检查时间与配置代次，恢复阶段接口调用0。出站连接禁止，真实供应商请求0，临时目录清理通过。
- 本机 Desktop 预览实际连接新 Docker Server，真实市场数据页及 Tushare 配置侧栏显示当前积分与两项独立权限，未验证功能隐藏；未输入或保存真实凭据，浏览器错误日志0。截图为 `/Users/yzin/.codex/visualizations/2026/10/21/01a15e8c-8fbe-7ae0-ac5d-2b1ba3fd338f/tushare-docker-runtime.png`；验收页和临时预览进程已关闭。

### 数据留存核对

更新前通过正式 `research-state-backup.mjs backup` 备份 PostgreSQL、DSA SQLite、DSA数据与回测产物，载荷校验通过；更新后独立读取实际卷和数据库：

- 六个命名/匿名卷及其挂载、原 `.env` 文件摘要保持。
- PostgreSQL 83表中80表的行数与整表指纹完全相同。三张变化表逐原始ID核对：5条 AutomationJob 原记录均在，只有一条 `nextRunAt` 更新；3条 ProviderHealth 原记录均在，仅一条检查时间、延迟及更新时间变化；361条原 ProviderHealthCheck 完全相同，新增1条健康记录。账户、Ledger、策略、57份既有研究结果及其校验值保持。
- DSA 43表/241条原记录、203个数据文件全部一致，无新增对象；2份既有凭据可解密读取，1条FX直接及反向读取通过，21份公告原文保持。该留存读取禁止出站请求。
- 642个回测产物逐文件字节数与SHA256相同，无丢失或新增。

私有原始证据目录为 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/tushare-level-tls-20261021`：含备份 Manifest、`update-1.log`、`update-2.log`、更新前后状态、`runtime-acceptance.json` 与 `account-level-target.json`。本节保存必要断言与结果；私有目录不加入Git。TAP4至此完成；仍不声称新的 Tushare 现金实源成功。

## 2026-10-22 真实账号配置

用户授权使用现有 Key，按手工确认的120分保存，仅验证当前等级包含的接口。通过实际 Server 的 `POST /api/market-data/providers/tushare/config` 提交凭据与 `settings.accountLevel={points:120,independentApis:[]}`，保存成功；Key 进入既有加密凭据存储，报告与文档不包含密钥值。

- `daily` 实际请求1次，结果为 `allowed`。`fund_daily`、`fund_div`、`cyq_chips` 因积分不足跳过；`hk_daily`、`rt_k` 因未独立开通跳过。五项均为 `not_included`、`attempted=false`，没有强行探测或重试。
- 检查时间为 `2026-10-21T16:54:10.641308+00:00`（北京时间10月22日00:54）。六项记录均 `persisted=true`；只读目录返回同一检查时间，未再次请求供应商。
- 首次保存未显式指定 `enabled`，接口默认启用；随后只提交 `enabled=false` 和当前配置代次恢复原状态，未重新提交凭据或积分，亦未触发第二次检查。最终配置为已配置、停用、`credentialSource=control`、`configVersion=2`、120分且独立权限为空。政策仍为166、原16条路由保持。
- 在实际 DSA 容器的独立 Python 进程以 SQLite `mode=ro`、`query_only` 核对：加密凭据存在、120分设置和六项权限均已落盘，1项通过、5项跳过，出站请求0。当前 Provider 注册表与精确目录通过共享 Schema 校验；五个容器健康。

脱敏回执为上述私有目录的 `account-configured-120-20261022.json`。本次完成当前120分账号的范围内配置和验证；RQData TODO 以及历史现金消费未通过记录保持，后续仅在权益与原前置实际变化后接续。

## 2026-10-22 启用与当前等级页面核对

用户随后授权启用 Tushare。实际 Server 配置 API 仅提交 `enabled=true` 与 `expectedConfigVersion=2`，HTTP201；最终已启用、`configVersion=3`，120分及空独立权限保持。启用沿用本地记录，六项检查时间仍为 `2026-10-21T16:54:10.641308+00:00`，只重映射配置代次；没有重新检查供应商接口，政策166与原16路由保持。

连接实际 Docker Server 的 Desktop 页面验收通过：

- 数据源列表的 Tushare 开关为开启，功能说明仅显示“中国内地股票 · 日线行情（日线／不复权）”。
- 配置侧栏显示积分120、两项独立权限未勾选；“可用功能”仅有上述日线一项，并提示“当前等级未包含5项功能，已跳过检查”。最近检查时间及本地记录提示正确，不显示密钥值。
- 页面核对后只读 API 仍为1项 `allowed`、5项 `not_included/attempted=false`，检查时间未变化；浏览器控制台错误0，临时页面与预览进程已关闭。没有新增供应商检查或修改路由。

截图：`/Users/yzin/.codex/visualizations/2026/10/21/01a15e8c-8fbe-7ae0-ac5d-2b1ba3fd338f/tushare-enabled-120.png`。脱敏回执为上述私有目录的 `account-enabled-120-20261022.json`。前节停用/版本2为首次配置时点，当前状态以本节启用/版本3为准。
