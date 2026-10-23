# 首次保存来源凭据状态修复证据

对应：[Spec](../../specs/2026-10-22-provider-first-credential-state.md)、[已完成任务](../../archive/tasks/2026-10-22-provider-first-credential-state.md)、[来源凭据父任务](../2026-09-14-market-provider-credentials.md)。

## 原因与修复

来源清单将默认启停与凭据就绪共同投影为 `enabled`。尚无配置行、尚无凭据时来源为停用；原首次保存却只取默认启停。新逻辑在配置行不存在且省略 `enabled` 时，先依据保存前的凭据状态确定启停，再合并新凭据。既有配置行与显式启停值继续沿用原处理。

写集为 DSA `src/services/thesis_ledger_control.py` 的同尺寸分支替换、`tests/test_thesis_ledger_provider_first_save.py`、数据测试清单单项登记和 CHANGELOG。本次前后控制文件均为 2395 行，没有增加大文件规模或更改 Schema、依赖、公共模块。

## 本地验证

- 新增定向测试使用合成凭据、临时 SQLite、真实 Control HTTP 路径；首次执行前先按仓库门禁登记新测试文件。
- 修复前：12 项中 5 项失败、7 项通过；TickFlow、Finnhub、Alpha Vantage、Tushare 首次凭据保存及默认启用但无环境凭据的用例均出现 `True is False`。
- 修复后：`.venv/bin/python -m pytest tests/test_thesis_ledger_provider_first_save.py -q --tb=short`，12 项通过。
- 覆盖：缺凭据停用的首次保存、环境凭据与默认启停组合、公开来源、显式启停、已有停用配置的空凭据补丁、凭据内容与内部凭据版本保持、正常配置版本递增、响应不泄密。
- 关联 12 文件、179 项：`test_thesis_ledger_control.py`、`test_provider_credentials.py`、`test_provider_enable_credentials.py`、`test_thesis_ledger_provider_credentials_runtime.py`、`test_thesis_ledger_environment_credential_lifecycle.py`、`test_thesis_ledger_hithink_credential_revision.py`、`test_thesis_ledger_tushare_credential_revision.py`、`test_thesis_ledger_source_credential_revisions.py`、`test_hithink_control_credentials.py`、`test_rqdata_control_credentials.py`、`test_provider_oauth_store.py`、`test_provider_oauth_api.py`。结果为 178 通过、1 失败。

## 新卡点与停止状态

失败位置：`tests/test_hithink_control_credentials.py:138`，`test_draft_http_probe_uses_input_for_all_capabilities_without_saving_or_admitting`。断言预期 3 次探针，实际为 `DAILY_BAR`、`CASH_DISTRIBUTION`、`NEWS_SEARCH`、`REALTIME_QUOTE` 共 4 次；测试没有调用保存接口。

仅在独立测试进程内将 `save_provider_config` 恢复成本次修改前的函数体，再运行该单项，仍为相同的 `4 == 3` 失败，1 项失败；未回写源码或修改失败用例，确认其为既有能力目录与测试断言失配。

按用户“遇到新的卡点再停下向我确认”要求，停止在回归阶段。尚未运行语法/deterministic 后续门禁，未更新 Docker、未调用目标保存接口、未向外部来源发请求。PC-T1、PC-G1 和父任务 T5b 均保留未完成；待用户确认是否同步维护 HiThink 能力断言后接续。

## 用户确认后的本地验收

用户已明确确认同步修正 HiThink 旧测试，继续验收和部署。测试改为精确核对上述四个能力/上游来源对，保留凭据校验、脱敏、草稿不保存和不准入的原断言。

- HiThink 与首次保存两个文件：17 项通过。
- 首次保存、Control/V3、凭据、环境凭据、HiThink/Tushare 来源修订、RQData 与 OAuth 共 14 个文件：202 项通过。命令为 `.venv/bin/python -m pytest` 加上述 12 个关联文件、`tests/test_thesis_ledger_control_v3.py`、`tests/test_thesis_ledger_provider_first_save.py`，参数 `-q --tb=short`。
- `./scripts/ci_gate.sh syntax`：386 个运行文件通过。
- `./scripts/ci_gate.sh deterministic`：能力边界、运行载荷、数据测试清单及确定性场景通过。
- `.venv/bin/python -m flake8 src/services/thesis_ledger_control.py tests/test_thesis_ledger_provider_first_save.py tests/test_hithink_control_credentials.py --select=E9,F63,F7,F82 --count --statistics`：0。

部署前目标健康，TickFlow/Finnhub/Alpha Vantage 保持停用、配置版本 2/1/1，Longbridge 停用且无凭据。30 家来源与 195 个目录目标已记录当前基线；不复用更早切片的目录摘要替代本次基线。

## 正式快更预检拒绝与目标保全

执行入口为 infra `rtk proxy /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/sync-code.sh dsa`。脚本退出 1，提示运行时兼容性输入发生变化，要求 `./scripts/update.sh dsa`；停止在复制代码和重启前，没有绕过正式入口。

只读调用正式导出的 `compatibilityInventory`，对比容器 `/app/scripts/data-runtime-inputs.json`，唯一差异为 `src/services/thesis_ledger_control.py`；兼容性 Schema 与合同版本均相同。该文件登记为构建兼容性输入，纯源码修复仍须走脚本要求的完整更新，不通过修改指纹规避门禁。

- 本地修复后的控制文件 SHA-256：`d271115d218cb0209c572bac94343f592971c41a9bdc156fcd7f109e19386eb3`；目标仍为更新前代码。
- 快更前后 30 家来源的完整公开记录摘要一致，195 个目录目标精确键/目标/状态摘要一致：`a09ad64502e01f8598e872c3311fb46c214f79f2e4362c937c72257da459fb1e`。
- TickFlow 配置记录完全一致，含启停、配置版本 2、内部凭据版本 1 及密文摘要；没有调用目标保存接口或读取外部行情。
- 容器 ID 保持 `5cac744243a3777e4028287e851ab7d16953fc2c60a515f52dc57906134bf34b`，镜像保持 `sha256:ebe9d9a742b396b5e885f007dedc49c960010094d095545be9b33ff2dfa8b632`，健康状态为 `healthy`。

按用户新卡点停止要求，本轮不执行完整更新，待确认保留数据的 `./scripts/update.sh dsa` 后接续。PC-T1 完成，PC-G1、最终 Review 和父任务 T5b 保留未完成，不能将本地通过记为目标生效。

## 保留数据完整更新的授权与基线

用户已明确授权执行 `./scripts/update.sh dsa` 完整更新并继续目标验收，新卡点仍停止确认。更新前再次读取当前目标状态：30 家来源、195 个目录目标，TickFlow 停用、配置版本 2、内部凭据版本 1。全部来源配置记录摘要为 `6010c7275987c6b347c2414105d31d4920394b4c070f221f21035acdcd96d878`；`/app/data` 使用现有命名卷 `thesis-ledger-dsa-data`。本地控制文件仍为已测摘要 `d271115d218cb0209c572bac94343f592971c41a9bdc156fcd7f109e19386eb3`，不重复运行输入未变的 202 项测试。

## 完整更新与目标验收结果

正式入口 `rtk proxy /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/update.sh dsa` 退出 0。镜像构建、原生 SDK/运行载荷检查、容器重建与健康检查通过；脚本按既有空间策略维护历史镜像和缓存，原数据卷保持。

- 新镜像为 `sha256:7b14ee6902192ba22997c13313dbe0d9661ec870d05e6b8062b3616172a33222`，目标容器为 `876ef6a5fb4b7b2d1586befe183444e2f22ab0ebc8c6be614c7b0e41cc4ae2b5`，状态 `healthy`。
- 容器内控制文件与已测本地文件摘要完全一致：`d271115d218cb0209c572bac94343f592971c41a9bdc156fcd7f109e19386eb3`。本次为完整镜像更新，生效代码已写入新镜像。
- 完整更新后、目标补丁前：全部挂载与更新前相同，仍使用原 `thesis-ledger-dsa-data` 卷；30 家来源完整公开记录、全部来源配置数据库记录摘要及 195 个目录目标精确状态均与基线一致，TickFlow 原配置记录逐字段一致。
- 正式 Server API：`POST /api/market-data/providers/tickflow/config`，使用 `expectedConfigVersion=2`、`credentials={method:api_key,values:{}}`，省略 `enabled`；请求 ID 为 `21bf9a7c-cbf7-4804-ab97-e5999bfdaf67`。返回 201、`enabled=false`、凭据仍已配置，配置版本 3。
- 保存后独立清单与只读 SQLite 核对：TickFlow 仍停用，密文摘要、内部凭据版本 1、凭据方法和设置保持；公开记录仅 `configVersion/updatedAt`、数据库记录仅 `config_version/updated_at` 正常变化。其他 29 家来源的公开与数据库配置保持，195 个目录目标精确状态保持。
- 当前 TickFlow/Finnhub/Alpha Vantage 均停用，配置版本为 3/1/1；Longbridge 原停用、无凭据、版本 0 保持。目标调用未提供真实 Key、未读取外部行情、未修改政策或路由。

首次建行由本地合成凭据与临时 SQLite 的真实 HTTP 测试证明；目标已有真实配置，采用同版代码摘要、正式保存及状态保全证明部署生效，不删除用户配置制造首次场景。PC1～PC4、必要门禁和最终 Review 均通过，本切片任务归档；T5b 原权限、历史及暂缓条件继续保留。

归档后最终核验：8 份当前合同、任务、索引与证据文档的 116 个本地链接均存在；DSA 与主仓本次写集的 `git diff --check` 通过。控制文件仍为 2395 行，摘要与已测、已部署代码一致；归档子任务无未完成项，父任务未通过条件继续保留。
