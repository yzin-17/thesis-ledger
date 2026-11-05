# RQData ETF 身份与分红币种证据接缝

日期：2026-09-27。对应 `M29-b2-identity`，复用于 M30。上一轮账号配置与目标核验已完成，本轮增加准入绑定的身份/币种证明和实际读取接缝，目标继续执行中。

## 实现范围

- DSA 新增 `rqdata_fund_identity_evidence.py`，严格解析内容寻址证据，核对原字节摘要、当前准入、精确能力/来源/证券、完整请求范围及实际核验时间；重复映射和重复 JSON 字段拒绝。
- 仅接受规范证券数字部分一致的直接基金查询映射，并要求独立 ETF 身份证据。历史转型/别名不隐式替代；分红独立要求币种证据，拆分不推断币种。
- `thesis_ledger_rqdata_mapped_read.py` 先核验映射才读取账号和执行既有隔离 SDK 接缝；读取结束重新核对准入、证据文件和账号修订。内部返回保留映射原文与摘要，原事件内容版本及不完整历史覆盖保持独立。
- 既有公共事件 V3 wire 未修改，未登记 RQData 事件适配器；新内部 `identityEvidence` 尚不能直接发送给旧严格 HTTP 消费者。生产入口及离线冻结消费者另由后续叶交付。

契约依据：[RQData 基金官方文档](https://www.ricequant.com/doc/rqdata/python/fund-mod)说明无后缀代码和历史转型合约。本轮没有查询真实基金合约、币种或账号权限，也没有生成真实准入。内部证据格式与审核边界见 DSA `docs/thesis-ledger-rqdata-identity-evidence.md`。

## 本地证据

- 新增两份测试初次 42 项通过，补充非法币种形状、空准入及 URL 空白边界后 46 项通过。
- RQData 标准化、精确读取、真实 spawn 隔离、加密账号、凭据修订，以及内容寻址存储/拆分映射组合共 193 项通过；2 项既有 FastAPI/Starlette 依赖弃用警告。统计包含新增 46 项，不相加。
- 组合测试使用实际隔离 SQLite 的加密凭据与原文文件、实际 RQData 标准化读取器；SDK 来源响应和准入回读为明确受控 fixture。证明结果保留原文且历史覆盖仍为 false；缺文件、损坏、错标的和缺币种在读取账号前拒绝，准入轮换/撤销、文件篡改和账号轮换拒绝晚到结果。
- 新 Python 模块和测试 flake8、编译检查通过；无依赖或数据库结构修改。

日志：`/private/tmp/goal-rqdata-identity-directed-20260927.log`、`/private/tmp/goal-rqdata-identity-directed-final-20260927.log`、`/private/tmp/goal-rqdata-identity-regression-20260927.log`、`/private/tmp/goal-rqdata-identity-lint-final-20260927.log`。

## 运行态与剩余条件

官方 `sync-code.sh dsa` 已完整退出成功，DSA healthy，镜像保持 `sha256:a9afed6adcadff81b776132790a743db90c422a1bc97fb96697ab32e47ca7b20`。目标只读探针首次通过：两份新模块导入成功、两份源码摘要与宿主匹配；缺少当前准入时拒绝，账号/主密钥回调调用数为 0。静态 manifest 能力仍为空、事件库存未登记 RQData。没有保存目标准入或账号，也未发出 RQData 请求。

日志：`/private/tmp/goal-rqdata-identity-sync-20260927.log`、`/private/tmp/goal-rqdata-identity-target-20260927.log`。本次仅更新容器可写层，不表示不可变镜像更新或真实映射验收。

父项 M29/M30 保持开放：真实 ETF 映射和币种审核、账号逐接口权限及完整历史覆盖尚未验证。后续还须先交付公开证据合同与离线验证，再将精确事件库存、当前准入修订及 SDK 读取接入生产入口，最后执行真实来源与冻结门禁。本轮不重试已耗尽预算的 I01、HiThink、目录或浏览器卡点。
