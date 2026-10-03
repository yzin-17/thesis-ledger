# 现行合同 smoke 入口收敛

## 源码核对

- DSA 的 ThesisLedger Control 握手仅在 `/api/v3/thesis-ledger/control/handshake` 注册；现有 V3 协议探针仍请求 V1 路径，导致目标验收必然落到旧入口。
- 根目录 `contract:smoke` 仍指向仅校验 V1 响应的旧脚本；调用反查显示相邻 infra 的总入口也直接引用它。
- 相邻 infra `scripts/contract-test.sh` 仍直接引用旧脚本；其已存在的 `market-v3-contract-test.sh` 才调用当前探针。

## 修改与本地验证

- 探针改用 V3 握手路径，定向测试断言两次握手请求都命中精确 V3 URL；另以当前凭据检查 V1 握手必须返回 404。
- `contract:smoke` 与 infra 总入口先运行现有 V3 协议探针，再运行新建的 V3 正向业务探针，删除无生产消费者的 V1 脚本。业务探针分别读取股票/ETF 报价、正式净值、净值历史、基金持仓、CNY 自身汇率、筹码和精确 Bar 窗口；Bar 使用仓库固定的 ETF qfq 请求并要求完整响应合同。未准入、无权限或上游失败均返回失败，不把协议握手通过计作业务通过。
- infra `README.md` 的黑盒命令、Token 注入说明及验收边界已同步为当前 V3 协议与正向业务入口，移除旧 V1 路径和失效开关说明。
- 主仓 `README.md` 与运维说明的 DSA 接入路径、Control V3 URL 和三层验收边界同步为当前实现；历史归档文件未改写。F02 其余三仓说明仍须按源码继续核对。
- DSA 通用登录中间件删除已无路由对应的 `/api/v1/thesis-ledger/` 豁免前缀；其登录页白名单和 V3 路由自身 Token 校验不变。
- `node --test scripts/market-v3-contract-probe.test.mjs`：10 passed、0 failed；根 `package.json` 解析及脚本指向检查通过。infra 脚本 `bash -n` 与差异检查通过。
- `node --test scripts/market-v3-business-probe.test.mjs`：2 passed、0 failed；覆盖八次 V3 Data 正向请求和 Bar 未准入失败时的凭据/响应体保护。该测试使用本地夹具，不证明目标来源可用。
- DSA `.venv/bin/python -m pytest tests/test_auth.py -q --disable-warnings`：24 passed、2 warnings。该源码变更发生在本次目标镜像构建已开始之后，不能把当前构建结果当作包含该变更的目标镜像。
- DSA `.venv/bin/python -m pytest tests/test_thesis_ledger_contract.py tests/test_thesis_ledger_control.py -q --disable-warnings`：25 passed、4 warnings；本地旧 URL 404 与当前 Control 合同定向回归通过，目标容器仍待独立验收。
- 对主仓 `apps/packages/scripts`、DSA `api/data_provider`、infra `scripts` 的生产文件反查旧 ThesisLedger URL：仅主仓协议探针保留 V1 握手路径作 404 负例；此搜索不覆盖所有间接拼接路径或运行态，不能代替 C01 全量库存与目标 404 验收。

## 验收边界

协议探针只验证 V3 协议、鉴权、握手和目录完整性；业务探针要求真实 Data 正向读取，但不应用策略或创建 Run。目标 DSA/Server 运行态、真实来源、Worker 与客户端尚未由本地测试证明；D02/D03 与多来源 Task 的 G-Deploy 继续开放。
