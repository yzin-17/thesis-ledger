# 报价时间新鲜度任务

对应 [规格](../specs/2026-09-27-quote-freshness.md)，归属 R02.5。

- [x] Q0：确认网关绕过 Manager，旧接口仅按来源时间存在判定 live。
- [x] Q1：在 DSA 接口边界统一判断时间，不增加已有大文件职责。
- [x] Q2：定向测试覆盖新获取的旧报价及未知/未来时刻，验证序列化字段；相关 35 项通过，关键错误 flake8 通过。序列化测试进一步改为实际 FastAPI 路由和鉴权调用，专项 11 项再次通过。
- [x] Q3：官方同步成功、目标文件摘要一致；首次目标实际 HTTP 返回 200，Efinance/EastMoney 无来源时点，freshness 保持 unknown，没有伪装为 live。详见 DSA 专题证据。

目标同步日志 `/private/tmp/goal-quote-api-time-sync-20260927.log`；目标探针 `/private/tmp/goal-quote-api-probe-20260927.py`。更新位于容器可写层，镜像未变。实际目标覆盖未知时间分支，旧报价分支由实际本地 HTTP 路由的受控来源测试覆盖，未声称目标路由本次选中了腾讯。

Provider 适配与真实来源证据以 DSA `docs/thesis-ledger-quote-source-evidence.md` 为准；成交量单位与完整范围门禁独立保留。
