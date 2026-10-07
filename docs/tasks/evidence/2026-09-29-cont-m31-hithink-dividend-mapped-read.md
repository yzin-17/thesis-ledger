# M31 HiThink 分红内部读取编排

## 实施与验证

DSA 新增 `thesis_ledger_hithink_mapped_dividend_read.py`，从当前准入读取内容寻址的 ETF 身份/币种原文；通过后复制环境 API Key 快照，并以主密钥 HMAC 对照准入凭据修订。一次有界端点请求使用此快照。返回后重新核对准入行、证据原字节、当前凭据与主密钥，拒绝晚到的撤销或轮换结果。响应的真实观测时刻必须不晚于冻结 `dataAsOf`；标准化只接受已核验进度，结果带内容指纹来源修订及 `complete=false`。

新增 10 项合成测试覆盖正常分红、实际有界读取器的注入 HTTP 请求、身份缺失时不触碰凭据/来源、读中撤销或换 Key/主密钥/证据、未知进度、金额缺失及晚于冻结时刻。该文件定向测试 10/10 通过，限定 flake8 与 `py_compile` 通过。联合身份、候选合同、传输和标准化测试另有 67/67 通过；所有测试均不访问真实供应商。

## 未完成的接线和业务门禁

此模块尚未加入事件 V3 执行入口、来源库存、Provider manifest 或 Control/目录。Server 尚无 HiThink 身份原文 wire 和在线/离线冻结复核；真实 ETF 身份与分红币种文件、数字 `progress="2"` 含义、历史覆盖和目标 HTTP/Worker 验收均未完成。M31-b2-runtime/target 及 G0-H/G-M2-Events 保持开放，目标 DSA 未同步或重建。
