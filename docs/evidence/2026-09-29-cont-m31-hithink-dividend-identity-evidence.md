# M31 HiThink 分红身份与币种原文校验

## 实施

DSA 新增 `src/services/hithink_fund_identity_evidence.py`。校验器接收已审核的原始 UTF-8 证据和当前精确准入，要求 `CN/ETF/CASH_DISTRIBUTION`、`hithink/fund-corporate-actions-dividends`、准入引用及 SHA-256 与原字节一致。版本 1 原文逐证券保存 ETF 身份、完整 `queryThscode`、显式 `fundType=exchange`、日期范围和观察时刻，并分别引用身份与分红币种的 HTTPS 文件地址及文件 SHA-256。币种不得由交易币种、证券后缀或供应商分红金额推断。

校验器拒绝重复 JSON 字段或证券、错误 ETF/查询身份、缺失或不合法的文件引用、证据范围超出准入、观察时刻晚于准入记录或冻结 `dataAsOf`、准入已撤销或过期以及原字节摘要不符。内容寻址存储只保存证据，不授予来源准入。

## 验证与边界

`tests/test_hithink_fund_identity_evidence.py` 使用合成文档覆盖正向、身份/币种/文件、范围/时间、撤销/过期、重复和内容寻址再读共 21 项，通过；身份、候选合同、读取器及标准化联合 67 项通过。对应源码与测试的限定 flake8、`py_compile` 通过。没有真实 HiThink 请求、真实身份或币种文件审核、目标容器更新。

当前模块是 M31-b2-contract 的前置部分；运行时仍须核对当前 HMAC 凭据修订和准入状态，Server 必须冻结并重验原始字节，真实 `progress="2"` 无释义且历史覆盖不完整。可执行事件库存和 Provider manifest 仍未登记该来源，M31-b2、G0-H/G-M2-Events 均未完成。
