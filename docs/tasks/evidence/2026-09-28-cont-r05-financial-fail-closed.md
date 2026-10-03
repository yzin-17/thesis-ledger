# R05.1 财务原表失败关闭

日期：2026-09-28（Asia/Shanghai）。本叶仅修复现有研究消费者对财务原表的错误声明及默认标的回退；R05.1 完整数值合同仍未就绪。

## 输入与发现

- [单接口合同](2026-09-28-m3-r05-single-endpoint-contract.md)及[原响应采集](2026-09-28-m3-r05-abstract-raw-contract-capture.md)固定本机 AKShare 1.18.94 的 `stock_financial_abstract`：实际表是 `选项`/`指标` 行加报告期列，不是一行一份财报。原响应虽含 `CNY` 与 `publish_date`，但没有证券身份自证、金额倍率或比例单位定义。
- [AKShare 官方股票接口文档](https://akshare.akfamily.xyz/data/stock/stock.html)列示同一表方向，未给出可用于当前原响应的金额倍率及比例单位合同；安装版源码再次核对了矩阵转换。`stock_financial_analysis_indicator` 安装版函数默认 `symbol="600004"`，原无参候选可能在请求其他股票时读取默认标的。
- 旧代码对矩阵取第一行，构造全空 `growth` 字典并记录 `growth:stock_financial_abstract`，使没有财务指标的响应变成 `partial`。

## 改动与验证

- 仅在该接口返回带 `选项`/`指标` 两列的矩阵时，记录 `stock_financial_abstract:unmapped_matrix`，不将其首行映射为财报，也不声明增长来源；其他来源候选不变。
- 移除 `stock_financial_analysis_indicator` 无参默认标的候选，保留带当前目标代码的调用。未变更报告期排序、数值单位、其他财务候选或消费者。
- 合成矩阵和请求参数两条定向测试修前 **2 failed**，修后该文件 **11 passed**；与研究上下文、资金流作用域及日常市场管线合并 **47 passed**。
- 对原采集目录中 SHA-256 为 `bc7fd31aeab945e82fc76e631b0bdb97771d7a9e2125d602bbc776164e8d1af4` 的真实 `sdk-table.csv` 离线重放：读入 **80×100** 表后返回 `not_supported`、空 `growth`/`source_chain`、无 `financial_report`，错误为 `stock_financial_abstract:unmapped_matrix`。CSV 摘要与原采集记录一致；该重放不新增来源请求，也不证明证券身份或单位。
- 改动文件 `py_compile`、官方 critical `flake8 --select=E9,F63,F7,F82`、测试文件完整 `flake8`、`git diff --check` 均通过；生产大文件保持 **715 行**，没有增加尺寸。没有来源请求、目标更新、数据库、AI 或 UI 验证。

## 保留条件

完整 R05.1 必须先取得可核验的目标证券身份、金额与比例单位、报告期/披露可见时间及历史修订合同，再实现按报告期选行与真实覆盖验证。现存 1 次公开请求已达到该采集叶的 **1/1、0 重试**上限；官方说明和原样响应两层核对仍不能补出缺失单位与身份，故该完整合同记为 `needs_contract` 并跳过当前实施。此叶不构成 G0-M、PIT 或真实财报准入。
