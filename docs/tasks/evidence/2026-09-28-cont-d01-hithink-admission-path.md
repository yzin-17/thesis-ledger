# HiThink V3 精确准入的 Control 生效路径

## 问题与修改

DSA Data V3 和精确目录已按 RouteAdmission 的状态、范围、适配/来源修订及 HMAC 凭据修订决定可用性；Control V3 的 `_v3_target_reason` 原来却对全部 HiThink 目标无条件返回 `not_admitted`。因此即使日后完成真实 G0 并由内部入口写入精确准入，Effective Policy 仍不可能授权读取。

DSA `src/services/thesis_ledger_control.py` 现在仅在 HiThink V3 分支消费同一准入行：先检查有效期状态，再获取当前凭据快照，以与 Data V3 相同的 `_market_v3_admission_matches_current` 核对精确目标、准入范围字段自洽及适配/来源/凭据修订。实际请求窗口是否落入范围仍由 Data V3 逐次检查。缺行、失效、撤销、换 Key、缺修订主密钥或不匹配继续返回 `not_admitted`；其他 Provider、V1/V2 行为不变。没有在目标 SQLite 写入准入行，也没有修改 HiThink ETF 适配器的 `volume_unit=unknown`。

DSA `docs/thesis-ledger-source-capabilities.md` 与 `docs/CHANGELOG.md` 已补当前状态与使用边界。主仓原 Spec/Task 门禁未缩减。

## 本地验证

- 新增 `tests/test_thesis_ledger_hithink_admission_path_v3.py`，仅使用合成 Key、合成 HMAC 主密钥及临时 SQLite。修复前新例 2 failed / 3 passed，失败点为有效准入已使目录 ready、Control 却仍拒绝；修复后新增 6 passed。
- 定向覆盖无准入、有效精确准入、幂等 Policy Apply、三种旧修订、Key 轮换、撤销及缺主密钥。轮换后 Data V3 在调用注入的无联网 Adapter 前返回 `NO_ELIGIBLE_PROVIDER`，调用次数 0。
- 最后一次相邻六文件 37 passed；修改后 `flake8` 关键错误限定检查与新测试文件完整检查均 0，AST 语法及 `git diff --check` 通过。DSA 官方 `bash scripts/ci_gate.sh flake8` 返回 0。
- 增加无联网拒绝断言时，首次测试仅因断言把稳定错误码当异常文本而失败；按一次修正预算改为检查 `ProviderCallError.code`，唯一复试通过。随后在新的完整隔离输入下重跑官方门禁，未沿用修改前的全包结果。

## 当前源码完整门禁与目标同步

另建 `/private/tmp/cont-dsa-hithink-admission-gate-20260928` 无真实 `.env`、账号、数据库和用户 HOME 的完整 Schemas 相邻布局副本；受控 DSA 源文件与当前工作树 `rsync -acn` 内容差异 0，沿用已自检的外连阻断与合成令牌。按官方顺序 `syntax`、critical `flake8` 均退出 0；`offline-tests` **7377 passed、1 skipped、4 deselected、626 subtests passed**，退出 0，耗时 272.87 秒。1 项 native wheel 依赖测试仍跳过，4 项网络标记按官方条件排除；这不是外部 Provider 验收。日志在隔离目录 `logs/syntax.log`、`logs/flake8.log`、`logs/offline-tests.log`，与前次门禁输出分离。

本次只有 DSA 应用源码、测试和文档改变，目标 DSA 已运行且官方快更的 `requirements.txt` 兼容预检通过；相邻 infra `./scripts/sync-code.sh dsa` 退出 0，目标 DSA 重启后 healthy。目标 `thesis_ledger_control.py` 与宿主当前源码 SHA-256 均为 `910c6ff956ab0935e0fa4b1122b52528cbddfe5f5065e004f8ce27364957d28a`；目标环境 Key 存在，V3 目录 `integrity=complete`，精确 ETF qfq HiThink 状态仍为 **`not_admitted`**。镜像 ID 保持 `sha256:e4e1671e7bdfdb632d545cf8cc07501bfe5f4d574fd73ca97469f99d1ef18e57`；快更只在容器可写层，容器重建后会恢复镜像内代码，不能当镜像更新或正式部署证据。

## 保留门禁

这一改动只修复未来有效准入的 Control 接缝。目标容器已通过官方快更使用本叶源码，但原镜像未更新；精确目录仍 `not_admitted`。四日量额与拆分价格关系是实测推断，HiThink 正式 ETF 单位合同、全 68 日价格/修订事实及目标 RouteAdmission 尚未通过；本叶不签发 `G0-H-target`、`G-Deploy-159516`、`G-Run` 或用户界面验收，也不触发真实 Provider 请求。
