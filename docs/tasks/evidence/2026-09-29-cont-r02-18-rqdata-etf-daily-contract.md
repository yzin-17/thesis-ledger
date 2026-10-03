# R02.18 RQData ETF 日线本地合同

日期：2026-09-29。对应 `R02.18-contract`，输入为 [R02.17 候选核对](2026-09-29-cont-r02-17-rqdata-etf-bar-selection.md)与现有 V3 价格协议。本叶只新增 DSA 纯请求/响应合同及定向测试；没有读取账号、调用 SDK、登记来源库存或同步目标容器。

## 实施与检查

- 新增 `data_provider/rqdata_etf_daily_contract.py`：只接受同数字且场所对应的 `CN ETF` 系统代码与 RQData 查询代码、显式且不超过 366 日的窗口，并生成 `get_price` 的 `1d/none/cn` 精确参数。代码形状校验不取代当前准入绑定的真实证券身份证据。
- 对响应要求 `order_book_id/date` 双层索引和精确 OHLC/量额列；日期、证券、重复、行预算、非法/非有限数值及 OHLC 不自洽均整体拒绝。保留源数值的十进制文本，内容指纹绑定请求与完整已校验行；纯函数返回的是请求合同及响应校验结果，不记录虚构的 SDK 调用次数。
- 原生量额单位均为 `unknown`，交易日历与历史覆盖均为未验证，来源修订为 `None`。空响应不推断无交易、停牌或历史完整性。
- 首次使用宿主默认 Python 运行 pytest 因缺 `pytest` 退出；改用 DSA 现有 `.venv`。测试夹具一处重复列构造长度错误，定向修正后 11 项通过；自审移除误导性的 `requestCount=1`，并补十进制精度、空集和时区反例后最终 **14 passed**。`.venv/bin/python -m flake8` 两个新增文件退出 0；此前 `.venv/bin/python -m py_compile` 退出 0，最终测试导入与 lint 均通过。测试输出有两条第三方弃用警告，无失败。

## 边界与后继

这只证明本地合成 DataFrame 对请求和来源形状的校验，不证明 RQData 真实返回形状、账号权限、ETF 身份、量额单位、完整历史、SDK 超时隔离或 V3 Reader 联通。`R02.18-runtime` 仍须建立独立进程总期限、当前凭据/准入修订读前读后复核和生产 Bar 路由；`R02.18-target` 再用真实来源与目标 Server/Worker 验收。`R02.17`、`R02.18` 父叶、G0-M 与 AC20 继续开放。
