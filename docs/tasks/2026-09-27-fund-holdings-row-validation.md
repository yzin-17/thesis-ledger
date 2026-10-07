# 基金持仓行完整性任务

对应 [规格](../specs/2026-09-27-fund-holdings-row-validation.md)。

- [x] V0：核验当前工作区中未完成的 helper、Provider 与 API 改动，保留其他未提交工作。
- [x] V1：补齐报告期、重复身份、权重边界及 API 回归，运行定向测试。
- [x] V2：官方同步 DSA，检查目标源码与实际持仓 HTTP；首次 200，实际 Server Schema 验证通过，无需重试。

实施范围：DSA `thesis_ledger_holding_rows.py`、`thesis_ledger_provider_runtime.py`、`api/thesis_ledger.py` 及持仓测试。保留原始百分比，不增加来源覆盖或披露日期推断。当前无运行中的部署进程。

本轮证据：持仓行 19 项、Provider runtime 27 项、Data gateway 7 项，共 53 项通过；另有披露日期与 Control 17 项回归通过。覆盖未知/歧义报告期、五位年份、标题后缀、跨季度合法重复、同季度原始及规范化重复、非法身份、非法权重和每季度合计，确认 Provider 错误码为 invalid_response。首次扩大测试使用了不存在的 gateway 文件名，pytest 未收集；核对实际路径后上述 53 项通过。工作区未提交。

部署证据：相关文件 flake8 E9/F63/F7/F82 通过；infra `./scripts/sync-code.sh dsa` 退出 0，日志 `/private/tmp/goal-holdings-row-sync-20260927.log`，DSA healthy。helper、Provider runtime、API 的宿主与目标 SHA-256 一致，详见 DSA 持仓来源证据。更新位于容器可写层，不代表镜像重建。

真实探针 `/private/tmp/goal-holdings-api-probe-20260927.py` 首次 200：000001.OF、AKShare、2026-Q2、77 条，disclosureDate=null，fetchedAt=2026-09-27T04:26:39.224731+00:00；完整响应由实际 Server Schema 接受。未修改策略或准入，未创建回测/AI 任务。最终核验：AC1–AC4 的本地行为与目标合法样本一致；来源完整性与历史披露时间仍属于原有开放门禁。其他 M1/M2/M3 工作不因此关闭。
