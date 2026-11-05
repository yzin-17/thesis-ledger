# DSA 当前源码与相邻 Schemas 完整隔离门禁

## 新前提与输入

此前 `CONT-DSA-current-baseline-gate` 因临时副本没有相邻 Schemas 构建目录，在一次修复重试后按规则 `skipped_after_retry`。本叶没有重跑该缺目录副本：当前 DSA 又纳入 Efinance 日线别名修复，重新建立 `/private/tmp/cont-dsa-schemas-gate-20260928` 工作区，将当前 DSA 源码和测试、主仓 Schemas `dist`、`package.json`、Zod 运行依赖置于与原仓一致的相邻目录。DSA 受控源输入 `rsync -acn` 差异 0；Schemas `dist` 183 个文件摘要全相等。副本排除真实 `.env`、根 `data/`、日志、`.venv`、Git、依赖缓存与用户 HOME，未发现指向副本外的符号链接。

子进程使用临时 HOME/XDG/TMPDIR/数据库与日志路径、合成 DSA 控制令牌及密钥；Python `sitecustomize` 阻止外部 DNS/连接，仅允许 loopback/Unix socket。防护自检确认外部 DNS 被拒，固定 Node 24.18.0 可执行；这不是 OS 级所有子进程网络隔离，因此不将本检查宣称为真实来源零调用的普遍证明。真实 Provider 凭据和数据库均未复制到副本。

## 顺序与结果

1. 旧 16 个失败点按当前测试名定向运行：**16 passed**。其中旧 prompt-cache 测试已在当前源码更名，以同一网络传输断言的新 nodeid 对账；旧 `skipped_after_retry` 记录不抹除。
2. 官方 `bash scripts/ci_gate.sh syntax` 退出 0；官方 critical `flake8` 退出 0，critical 计数 0。
3. 首次官方 `offline-tests`：**7368 passed、3 failed、1 skipped、4 deselected、626 subtests passed**。三项失败均为临时副本缺 `packages/schemas/fixtures` 中固定 JSON 文件的 `FileNotFoundError`，不是业务断言失败。
4. 唯一一次隔离输入修复：只读复制 Schemas `fixtures` 25 个文件，摘要全相等；三项精确失败点 **3 passed**。副本 DSA 文件对当前工作树的内容差异仍为 0。
5. 官方 `offline-tests` 唯一完整复试：**7371 passed、1 skipped、4 deselected、626 subtests passed**，退出 0，耗时约 4 分 7 秒。未继续扩大重试。

日志保存在本机临时目录 `logs/targeted.log`、`syntax.log`、`flake8.log`、`offline-tests.log`。本叶证明当前隔离输入的 DSA 官方离线测试门禁通过；1 项 native wheel 依赖测试仍为 skipped，4 项网络标记测试按官方过滤条件 deselected。它不证明真实 HiThink 准入、当前目标容器已更新、Server/Worker 与 DSA 跨版本一致或普通回测成功。
