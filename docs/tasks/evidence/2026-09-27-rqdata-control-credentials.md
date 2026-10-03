# RQData 加密账号配置与修订校验接线

日期：2026-09-27。对应主 Task 的 `M29-b2-credentials`，复用于 M30；验收范围是既有 Control 配置、实际隔离 SQLite 与读取接缝，不是来源事件准入。

## 已实现

- `rqdata` 注册到既有 Provider registry/config 入口，声明只写 `username_password`，首次保存要求两个字段完整。公共结果只返回配置状态，不回显账号或密码。
- 复用既有加密存储、配置版本、凭据版本、显式清除和删除语义。非空密码保留原值；更新省略或空字段保留旧值，单字符串历史凭据拒绝。
- 实际 Store 可产生不可变 Control 账号快照，传入既有 RQData 隔离读取入口。内部 HMAC 区分 Control 与环境来源；读取期间账号轮换、清除或删除均拒绝晚到结果。HiThink/Tushare 不因此接受 Control 来源凭据。
- 抽出既有纯 manifest 构造至 `src/services/provider_manifest.py`，Control 从 3,638 行降至 3,593 行。修改前后原有 12 个 Provider 的规范化 manifest SHA-256 全部一致。
- RQData 的可路由能力集合仍为空，没有登记事件 V3 适配器。保存账号不验证接口权限，也不补造证券映射、币种或完整历史覆盖。

## 本地验证

新增 `tests/test_rqdata_control_credentials.py` 的 13 项验证通过：真实 Control HTTP、SQLite 加密与新 Store 回读、只写投影、密码精确保留、空更新/轮换、非法初次配置不落库、独立 Data Token 拒绝、来源修订隔离，以及实际 Store 读取前后轮换/清除/删除拒绝。

- 新增配置测试及既有账号修订/读取接缝：30 项通过。首轮 5 项失败来自测试误写 HTTP 400，接口既有合同实际返回 422；核对原入口后修正为 422 和稳定错误码，首次重试通过。
- 配置、Control V1/V3、事件/拆分控制、旧 Provider 运行时和 HiThink/Tushare 修订组合：121 项通过，4 项既有依赖/测试收集警告。组合包含前述 30 项，不将两组统计相加。
- 新模块、凭据定义、修订与新增测试的 flake8 通过；Control 的关键错误 lint、全部修改 Python 的编译及定向空白检查通过。
- 初次使用 `uv run` 因默认缓存目录不可写而退出，改用仓库既有 `.venv/bin/python` 成功；未安装或修改依赖。

日志：`/private/tmp/goal-rqdata-control-directed-20260927.log`、`/private/tmp/goal-rqdata-control-directed-retry1-20260927.log`、`/private/tmp/goal-rqdata-control-regression-20260927.log`、`/private/tmp/goal-rqdata-control-lint-20260927.log`。

## 目标运行态

官方 `./scripts/sync-code.sh dsa` 完整退出成功，目标 `thesis-ledger-dev-dsa-1` 为 healthy。仅同步容器可写层，镜像保持 `sha256:a9afed6adcadff81b776132790a743db90c422a1bc97fb96697ab32e47ca7b20`，没有数据库结构或外部卷变更。

容器内只读 HTTP 探针首次返回 200，实际 registry 的 RQData 配置模式为 Control、两字段均为只写且必填、能力集为空；实际事件适配库存未登记 RQData。`provider_manifest.py`、`provider_credentials.py`、`provider_credential_revision.py` 和 `thesis_ledger_control.py` 四份源码 SHA-256 与宿主全部匹配。探针只输出字段状态及摘要，未保存目标账号或修改准入。

日志：`/private/tmp/goal-rqdata-control-sync-20260927.log`、`/private/tmp/goal-rqdata-control-target-20260927.log`。容器同步不代表不可变镜像已更新，重建后需重新通过官方入口更新代码。

## 剩余条件

M29/M30 父项继续开放：实际 ETF 查询身份映射、分红币种、接口权限、完整历史范围、来源修订、事件 V3 准入与冻结消费尚未完成。没有读取真实 RQData 账号或向 RQData 发出请求，未创建 AI/回测任务。此次配置交付不关闭真实来源门禁。
