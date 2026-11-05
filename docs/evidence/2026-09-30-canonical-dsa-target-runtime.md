# DSA 当前源码的目标运行态与旧 URL 拒绝

2026-09-30。先在 DSA 仓库以本地虚拟环境运行定向测试 48 项和官方 `offline-tests`：7515 项通过、1 项跳过、4 项按标记排除。相邻 infra 官方 `./scripts/update.sh dsa` 构建镜像后发现 HiThink Key 未传入更新进程；第二次从宿主 `~/.zshrc` 只向进程环境注入 Key，再经同一官方入口构建，DSA 容器健康且 Key 非空。两次均未打印或写入 Key。

目标完整应用中，带有效 Control Token 的旧 `/api/v1/thesis-ledger/control/handshake` POST 曾返回 405。原因是含 Web 静态资源时，旧路径落入只接受 GET 的 SPA 回退；仅挂载 V3 router 的测试未覆盖此情况。`api/app.py` 在 SPA 回退前为旧 V1/V2 ThesisLedger 前缀逐方法返回 404，非 ThesisLedger `api/v1` 路由不受影响。带静态首页的完整应用回归覆盖旧前缀根路径及 GET/POST，定向与相邻 Control 测试 16 项通过，Python 语法、flake8 严重错误和 diff 检查通过。

本次代码修改发生在第二次镜像构建启动后。镜像 `sha256:b88d6bc3a65f5ed38065487fbb62d07c0ee066c8588a36df945578abecdd82c5` 包含此前的 DSA 业务源码，但 `api/app.py` 摘要与宿主不一致。因此按项目准入选择官方 `./scripts/sync-code.sh dsa` 更新应用代码及 WebUI；脚本兼容性检查、同步和健康检查通过。同步后 `api/app.py`、`api/thesis_ledger.py`、`thesis_ledger_v2_dependencies.py`、`thesis_ledger_v2_tradability.py` 的容器与宿主 SHA-256 均一致，镜像 ID 保持不变。该修复位于容器可写层，重建后会消失，不能作为新镜像或发布证据。

从目标 Server 容器发起不读取行情的鉴权/协议请求：无效 Control Token 返回 401，旧 V1 POST 返回 404，当前 V3 握手返回 200 且协商版本 3，持有效 Data Token 但无效合同版本的 Bars 请求返回 422 与 `unsupported_data_contract_version`。目标 Server、Worker、DSA 均健康；路由目录返回 43 项与完整性状态，HiThink ETF qfq 条目为 `ready`，但该目录状态不等于特定标的/窗口的 RouteAdmission。真实 Provider 读取、当前 Run 冻结/执行、客户端和不可变 DSA 镜像仍单独验收。

改动后的官方 `offline-tests` 首轮有 7515 项通过、1 项失败；不与构建并行的次轮在同组 Catalog 子进程测试有 3 项失败。原因是夹具的 1 秒窗口包含 macOS `spawn` 子进程导入时间，超时可能在测试标记写出前发生；Job 用例还需给异步终态留出轮询时间。仅将这组测试夹具窗口调为 5 秒、Job 终态等待调为 12 秒，生产超时与并发上限未改。Catalog 文件 5 项通过；最终官方完整 `offline-tests` 为 7516 项通过、1 项跳过、4 项按标记排除、626 个子测试通过。旧 V1/V2 ThesisLedger POST 目标直连均为 404，非 ThesisLedger `/api/v1/health` 为 200。

后续主仓升级曾重建 DSA 容器，使原可写层补丁与进程 Key 消失；恢复及本次 DSA 镜像构建失败、现行 Policy 重新 Apply、当前 V3 Run 的 `historicalTradability` 阻断，统一见[目标策略转换及 Run 证据](2026-09-30-canonical-policy-state-rebase.md)。当前 DSA 镜像中 `api/app.py` 与宿主一致且无该文件可写层差异，但 `update.sh dsa` 最终退出 1，官方完整更新门禁仍未通过。
