# M31 HiThink 分红 Server 身份原文 wire 与冻结校验

## 实施

Schemas 新增独立 `hithinkIdentityEvidence` 与版本 1 `hithink-fund-identity` 合同，只接受精确 `CN/ETF/CASH_DISTRIBUTION` 和 `hithink/fund-corporate-actions-dividends`。严格校验完整 ETF 查询代码、显式 `exchange`、身份及分红币种 HTTPS 文件引用、原文摘要绑定、准入适用范围与精确观察时刻；其他来源不得借用该字段。当前适配/来源修订和 HMAC 凭据修订必须匹配合同。

Server 在线事件选择和离线 Snapshot 均调用同一验证器，按原始 UTF-8 字节重新散列，不以 JSON 重排结果计算摘要。新增合成测试证明正常响应保留不完整覆盖；摘要篡改、重绑后的身份范围或币种错配、过期/晚到证据均拒绝。Parquet artifact 读回后的原文重验在模拟当前时钟不可用时仍通过；篡改后失败，未知历史覆盖仍阻断完整事件依赖。合成完整覆盖只验证冻结路径，不代表真实 HiThink 历史覆盖。

## 验证与边界

Schemas 的 HiThink/Tushare/事件 wire 定向 117 项通过，全包 46 文件/568 项通过；Server 的 HiThink/Tushare 在线及离线定向 19 项通过，全包 233 文件/1822 项通过、25 文件/91 项跳过（隔离 PostgreSQL 等单独门禁）。Schemas typecheck/build、Server typecheck/build、限定 ESLint、Prettier、`check-boundaries.mjs` 和 `git diff --check` 通过。首次测试有一项测试夹具把响应专属字段放入严格 request，修正后定向通过；离线币种错配在协议解析层即被拒绝，测试断言已按实际层级修正。

本批仅接通消费侧协议与校验，未登记 DSA 可执行事件库存、Provider manifest 或目标准入。DSA 事件入口尚未调用内部 HiThink 读取编排；目标容器未更新。真实独立身份/币种文件、`progress="2"` 含义、历史覆盖和目标 HTTP/Worker 验收仍待完成，M31-b2/G0-H/G-M2-Events 均保持开放。
