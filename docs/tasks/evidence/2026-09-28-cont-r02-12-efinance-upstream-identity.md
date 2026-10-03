# R02.12 Efinance 指数来源与完整身份本地证据

## 核对输入

DSA 当前虚拟环境安装的 `efinance` 为 `0.5.9`；`requirements.txt` 仅声明 `efinance>=0.5.5`。该安装包的三个相关源码文件 SHA-256 分别为 `stock/getter.py` `601c843da1a4c80a16ca557f147657dfc69801f3dffcabad8bf010aa4047b3cc`、`common/getter.py` `4a2d1f88bde2b331fd206d272752cf9c507be59a2757b2b90be441b03df0770f`、`common/config.py` `e0af98d280d77d16242b8b337aab7329a00923dacfb112f8f983888583ddf429`。这是已安装依赖的静态检查，没有发来源网络请求。

随后只读 `docker ps` 确认 `thesis-ledger-dev-dsa-1` 正在运行；容器内 Python 报告 `efinance 0.5.9`，上述三个源码文件 SHA-256 均与本机一致，`FS_DICT`、EastMoney HTTP URL、`行情ID` 生成和市场编号也一致。这证明当前容器安装包的静态身份，不证明容器应用代码已经包含本叶修改，也不证明实际 HTTP 响应、TLS 安全或未来重新构建版本。容器未改动。

DSA `get_main_indices()` 调用 `ef.stock.get_realtime_quotes(['沪深系列指数'])`。安装包 `stock/getter.py` 用 `FS_DICT` 将其映射为 `m:1 s:2,m:0 t:5`，再调用 `common/getter.py` 的 `get_realtime_quotes_by_fs`。后者请求 `http://push2.eastmoney.com/api/qt/clist/get`，原字段 `f12` 为代码、`f13` 为市场编号，并生成 `行情ID = 市场编号 + '.' + 代码`；`common/config.py` 把市场编号 `1`、`0` 分别标为沪、深。当前安装包的这条指数入口因此是 EastMoney 包装，不能与其他 EastMoney 入口算成独立备用。静态 URL 使用 HTTP；未发实际请求或验证服务端行为。

以合成 DataFrame 替换安装包内部 `get_realtime_quotes_by_fs` 的单次调用，执行外层 `ef.stock.get_realtime_quotes('沪深系列指数')` 后得到列 `股票代码,股票名称,行情ID`，`行情ID` 保持 `1.000001`。这只验证本地包装器没有移除完整身份，不触真实 endpoint。

## 身份反例与修复

上一叶只按六位代码选唯一行。新增合成反例证明单条 `000001`、`行情ID=0.000001` 会被误映射为 `sh000001`；同代码的错市场和正确市场两行会一起被拒绝。修前执行 `./.venv/bin/pytest -q tests/test_efinance_main_indices.py -k 'wrong_market or full_identity'`，两个测试产生 3 个失败断言。修后以明确的 `1.000001` 等完整目标 ID 同时匹配六位代码和 `行情ID`，只接受恰好一条完整匹配行；缺 `行情ID`、错市场、代码与 ID 不一致或完整目标重复均失败关闭，其他唯一指数保留。价格字段和 Consumer 未改。

## 验证层级与剩余门禁

- DSA getter 文件：7 passed；与 Efinance 报价、Sina 指数及 Tushare 指数相邻合并：34 passed。两次均有 2 条第三方弃用 warning。
- 新增测试文件 flake8、两个改动文件 `py_compile`、`git diff --check` 通过；生产大文件全文件 flake8 仍有既有告警，未作无关清理。
- 只读安装包及合成 DataFrame；没有真实 Efinance/Provider 请求、目标 Docker 更新或 DSA 第三次全包。原完整离线门禁重试后仍为 7208 passed/16 failed，不能以本地回归替代。

R02.12 当前容器的安装包版本已核，但修改后的应用源码未同步，未来镜像重建版本不由 `>=0.5.5` 锁定。实际 HTTP 传输安全、真实时点、量额单位、覆盖、权限、来源响应指纹和 G0-M 准入仍未证明。当前 Consumer 不保留指数来源时刻；本叶不从本机时钟补造。若后续选择此入口作目标能力，需先解决静态 HTTP 端点的安全前提并核对目标应用版本，再取明确预算内的真实响应验证字段和准入；否则保留待验证状态。
