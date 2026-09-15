# 数据源即时启停与页面凭证配置实施任务

对应 Spec：[数据源即时启停与页面凭证配置](../specs/2026-09-14-market-provider-credentials.md)

> 状态：T1—T5a 完成；本机 Docker 与浏览器验收通过，T5b 等待真实凭证在线验收。

## 任务与依赖

- [x] T1：启停部分更新契约与即时保存。
  - 依赖：无。覆盖 AC1。
  - 完成条件：DSA/Server 部分更新保留其他字段；Desktop 切换即存、按来源锁定并恢复失败状态。
  - 验证：配置部分更新定向测试、Desktop 交互测试、受影响包检查。实际浏览器持久化由 T5a 验收。
- [x] T2a：结构化加密凭证存储与统一解析。
  - 依赖：T1 的部分更新契约。覆盖 AC2、AC3 的解析语义、AC4 的存储和接口。
  - 完成条件：五个来源手动字段、留空合并、配置版本、来源和清除语义可由 API 验证；历史值不被无意激活或删除。
  - 验证：DSA 存储、校验、加密与来源优先级测试，Server 转发契约测试。
- [x] T2b：凭证运行时生效及草稿连接测试。
  - 依赖：T2a。覆盖 AC3、AC5。
  - 完成条件：实例使用显式凭证并随版本更新；测试确实调用所选来源且不落库、不回退。
  - 验证：先单密钥来源贯通控制接口与实际适配器，再验证全部来源；测试调用、失败及旧实例隔离。
- [x] T3a：Longbridge 加密令牌 SDK 接入。
  - 依赖：无；SDK 层通过令牌加载/保存回调与 DSA 解耦。覆盖 AC4 的 OAuth 存储接入、AC6 的刷新恢复基础；加密数据库接线由 T3b 在 T2a 完成后验证。
  - 完成条件：固定 SDK 构建可注入令牌加载/保存和回调监听，不使用页面凭证明文文件缓存；目标 Python/平台构建验证完成。
  - 验证：本机及镜像构建、令牌刷新持久化与实例隔离测试。发现方案不可行时先更新 Spec，不降低存储要求。
- [x] T3b：OAuth 授权会话与回调执行面。
  - 依赖：T2a 版本化凭证存储，以及 T3a 已验证的 SDK Python 存储回调契约。覆盖 AC6。
  - 验收依赖：T3a 目标平台构建、T2b 运行时工厂；会话状态存储可先独立实现，不能提前宣布 OAuth 集成完成。
  - 完成条件：授权创建、查询、取消、过期、回调及配置版本条件提交闭环。
  - 验证：state/PKCE、重放、端口冲突、取消与迟到结果、进程重启状态恢复；在线授权由 T5b 验收。
- [x] T4a：页面手动凭证配置与环境恢复。
  - 依赖：T2a 已验证的 Schema/config 契约。覆盖 AC2 与 AC4 的手动客户端。
  - 完成条件：侧栏按清单字段保存、留空保留、清除恢复环境，关闭时保护草稿；数据只驻留组件内存。
  - 验证：手动配置字段、保存负载、草稿清理与错误交互，Desktop 定向测试。运行时生效由 T2b/T5a 验证。
- [x] T4b：草稿测试与浏览器授权交互。
  - 依赖：T4a，以及已验证的 DSA 草稿测试负载和 T3b 会话 API 契约。覆盖 AC5 与 AC6 的客户端。
  - 验收依赖：T2b 与 T3b 的 Server 转发和执行面接线。
  - 完成条件：草稿测试结果与当前输入对应，授权创建、查询、取消及终态反馈使用真实接口契约。
  - 验证：查询竞态、敏感数据不持久化、授权终态交互；Desktop 包级测试与 build。
- [x] T5a：Docker 与浏览器配置闭环。
  - 依赖：T1、T2b、T3b、T4b。覆盖 AC7 的部署与持久化。
  - 完成条件：契约打包、回调端口与实际镜像匹配，重启后凭证和启停保留，页面完成主要操作。
  - 验证：infra 契约检查、目标 Docker、浏览器网络与操作证据。不得以容器健康替代行为验收。
- [ ] T5b：五个来源在线验收。
  - 依赖：T5a。覆盖 AC7 的在线数据、AC6 的真实授权。
  - 完成条件：逐来源记录凭证与权限前提、真实连接/数据读取结果；Longbridge 完成真实授权与刷新恢复。
  - 验证：实际 Provider 请求；无凭证或权限时逐项记为阻塞，不能用 fixture 勾选。

## 验证证据

- T5a / 最终运行时：DSA 镜像 `sha256:c0dc7461a5fc17edaf87e0ef937dadab78406c3d5aad8c32c918d4878cc0de43`、Server/Worker 镜像 `sha256:08ac9f2f8d5918bc2d6bd95e12386adeb472b8a56f6f9062f9662a295e9e8c1e` 已部署，原有六个服务恢复健康。DSA 真实容器确认 SDK 存储扩展为 1，OAuth 路由为 4；回调仅发布 `127.0.0.1:60355`。
- T5a / 浏览器：五个来源均完成测试值保存与清除；Longbridge 仅替换 Access Token 时保留 App Key/App Secret。Finnhub 关闭开关后即时持久化，凭证保存不重新启用；DSA 重启后 enabled=false、credentialSource=control、configVersion=2 保留，页面字段不回显。草稿测试未保存凭证，也未误报成功。验收后五个来源均恢复 enabled=true、credentialSource=none，测试配置值全部清除，配置版本记录保留。
- T5a / 授权：页面发起和取消通过；本机回调错误 state 返回 400，会话仍为 authorizing，取消后无 pending 会话。真实进程重启后遗留授权收敛为 failed/OAUTH_RESTARTED，授权 URL 清除。测试 Client ID 的上游拒绝正常显示失败，不代表真实账号授权成功。
- T5a / 保密与故障恢复：实际 SQLite 凭证字段存在密文且不包含测试明文，DSA 日志未发现测试密钥。镜像初次导出遇到 Docker 32 GiB 虚拟磁盘不足，PostgreSQL 检查点写入失败；按缓存维护规则释放空间后，数据库完成恢复检查点，已导出镜像的启动验证和服务重建成功。最终虚拟磁盘约 10 GiB 空闲。全部操作保留业务数据卷。
- T5a / 更新入口：新增按 SDK/runtime 阶段转换的 `scripts/update-dsa-dockerfile.sh`，修复旧行数约定及 SDK 清理行被错误移除的问题；Rust 与 SDK Python 纳入本地基础镜像 alias。生产转换函数契约测试、OAuth Compose 契约测试、Shell 语法和 diff 检查通过。完整 update.sh 流程未重复执行，实际镜像与服务部署按前述证据验收。
- T5a / 故障恢复：用户明确授权强制恢复后，再次核对残留 PID，结束挂起后端并启动 Docker Desktop；原有六个容器恢复健康。清理本任务 SDK 编译缓存后磁盘恢复约 14 GiB。Server 镜像重建成功，新镜像对实际 PostgreSQL 的只读结构检查通过。DSA 复用补丁 SHA256 一致的 Linux SDK wheel 镜像，其余应用打包步骤保持当前 Dockerfile。
- T3b / 最终集成回归：DSA 相关 138 项通过；公开 OAuth 表单仅包含非敏感 Client ID，内部 tokenJson 不出现在字段清单或可保留字段中。已保存测试使用版本化快照并更新健康状态，草稿测试不改变健康状态。页面 OAuth 与三项密钥的错误日志均脱敏。父级随后补充 Alpha Vantage HTTP 200 权限/无效密钥分类，所在测试文件 30 项通过。
- T4b / 最终 Review：Server 会话响应按共享 Schema 投影；创建、恢复、轮询、取消与终态反馈均已接线。手动草稿通过组件内存读取，测试结果绑定输入版本，修改/关闭可取消请求；真实浏览器竞态与持久化仍由 T5a 承担。
- T5a / 首次故障（已恢复）：Server 镜像构建期间宿主磁盘可用空间降至约 116 MiB，BuildKit 报 `metadata_v2.db: read-only file system`，随后 Docker API 返回 500。清理本次临时 Cargo target/cache 后恢复超过 6 GiB；正常重启、停止和 TERM 未能退出残留后端。自动审批曾拒绝 SIGKILL，随后用户明确授权恢复。该轮未替换业务镜像、未删除数据卷；最终部署结果见上方运行时记录。
- T3b / 真实绑定：通过独立 macOS 定制 wheel 执行 `test_provider_oauth_native_storage.py`，验证 DSA 加密快照可由真实 OAuthBuilder 加载，无浏览器授权、无令牌明文落库。该离线用例不证明账号授权或行情权限。
- 包级补充：Server 全量 600 通过、11 项 PostgreSQL 集成测试按既有条件跳过；Schema 全量 171 通过。Desktop 最终定向 14 项及 build 再次通过。
- T3b / 生命周期：启动恢复遗留授权、关闭移除 manager、持久化失败仍释放任务及日志脱敏定向通过，API 成功响应包含 `Cache-Control: no-store`。
- T4b / 包级：Desktop 全量 37 文件、261 项通过，typecheck/build 通过；仍有既有大 chunk 提示。Server OAuth/控制契约 11 项、typecheck/build 通过；模块边界、相关 ESLint 与文件尺寸门禁通过，9 项既有尺寸警告不涉及本次新增文件。
- T5a / 部署契约：本机 Compose 回调固定到 `127.0.0.1:60355`，DSA 容器监听 `0.0.0.0`，持久卷检查通过。业务镜像和浏览器验收尚在执行。
- T2b / DSA：定向 81 项通过，编译与 diff 检查通过；普通日线及草稿探测均验证凭证优先级、实例版本隔离、HTTP 错误和日志脱敏，Alpha Vantage 的 HTTP 200 错误体有独立回归。真实在线结果仍归 T5b。
- T3b / DSA 接口：Control Token 拒绝未授权请求、创建、恢复当前会话、查询、取消及未知字段拒绝测试通过；控制器契约可供客户端实现。真实 SDK/运行时接线仍待完成。
- T3a / Linux 重试：单任务编译、关闭 LTO 后通过固定源码测试、wheel 构建、安装与 Python 绑定 smoke；产物 `longbridge-4.5.0+thesisledger.1-cp311-cp311-linux_aarch64.whl`，独立验证镜像 `daily-stock-analysis:longbridge-sdk-check` 构建成功。该验证没有更新业务容器。
- T3b / 会话存储与执行器：独立 SQLite 条件提交及异步执行器共 14 项通过；覆盖加密发布、取消/超时/清除/移除/替换后的迟到结果、刷新版本、重放、唯一会话、重启恢复、失败回滚和未保存令牌不宣称成功。SDK 接线、接口与运行时尚未完成整体验收。
- T4a / Desktop：凭证、Provider 清单与即时启停定向 12 项通过，typecheck 通过。验证字段保留、环境与其他方法重新填写、密码输入和标签语义、仅凭证保存/清除负载；关闭草稿确认与 mutation 清理已做代码 Review。真实页面操作、持久化与后端生效仍由 T5a 验证。
- T3a / Linux 首轮：SDK 源码测试阶段通过，wheel 构建因 Docker 内存不足失败；Docker 可用总内存约 8 GB 且已有业务服务运行。已将默认编译并发限制为 1、关闭 release LTO 后重试，未调整用户 Docker 配额或停止业务服务。
- T2a / DSA：凭证、控制、轮换定向测试 31 项通过；父级补充无旧凭证显式清除仍递增凭证版本，凭证文件 16 项通过。结构校验、历史环境语义、加密、清除、配置方法和版本条件前提均通过 Review。
- T2a / Server：定向 6 项通过，typecheck 与修改文件格式检查通过。手动 Schema/config 契约已稳定，可供 T4a 消费；OAuth 接口仍由 T3b 生产。
- T3a / 本机 SDK：固定 v4.5.0 源码扩展已构建 macOS arm64 / Python 3.12 wheel；Python 存储绑定 4 项验证通过，覆盖无文件加载、禁止隐式授权、字段校验与异步行为。随后补强回调 state 校验，正在重建对应 wheel。
- T3a / Rust 定向：`cargo test --locked -p longbridge-oauth thesis_ledger`，5 项通过；真实本地 HTTP 回调与令牌服务验证 S256 PKCE、刷新保存、存储失败、取消释放端口、错误 state 不消费会话。属于确定性测试，不代表 Longbridge 在线授权。
- T3a / 构建输入：固定提交核对和补丁在新克隆应用通过；增加独立 Linux `sdk-builder`，目标 bookworm / Python 3.11 验证中。尚未更新现有运行服务。
- T1 / Desktop：`pnpm exec vitest run test/market-provider-enabled.test.ts test/market-data-provider-ui.test.tsx`，9 项通过；验证仅提交 enabled、跨来源并发失败隔离、响应超时后以服务端查询校准。
- T1 / Desktop 包级：`pnpm exec vitest run`，36 个文件、256 项通过；`pnpm run build` 与 `tsc --noEmit` 通过。构建有既有大 chunk 警告。后续仅格式调整，未改变行为。
- T1 / 浏览器只读检查：本机 Vite 的数据源列表已经移除“保存设置”，11 个来源启用开关正常显示。连接的 Docker 后端尚未更新，未对其执行启停写入；这不计作 T5a 持久化验收。
- T1 / 静态检查：修改文件 Prettier 检查、主仓 `git diff --check` 通过。工作区包含其他任务修改，未提交。
- T1 / DSA：`.venv/bin/python -m pytest tests/test_thesis_ledger_control.py -q`，14 项通过；覆盖启停保留凭证/设置、凭证单独更新与空更新保留已停用状态、新记录默认值。`py_compile` 通过。
- T1 / Server：`pnpm --filter @thesis-ledger/server exec vitest run test/market-control.service.test.ts`，5 项通过；包级 typecheck/build 通过。首次测试命令误展开为全包测试，90 文件、594 通过、11 跳过；随后已定向验证，不重复全包检查。
- T1 / 父级 Review：部分更新在同一写事务中读取和合并，回滚只作用于当前来源，查询用于校准不确定响应；Review 通过。真实镜像与浏览器持久化仍由 T5a 承担。

## 规划审查

结论：具备分阶段实施条件。接口生产者先于消费者，授权存储、执行面、消费面与部署验收分开；不存在依赖循环。T3a 必须用 SDK 源码及构建证据确认，在线凭证是 T5b 的环境前提。

执行前核对：固定 SDK v4.5.0 的 Rust 层已有公开 `TokenStorage`，T3a 只需开放 Python 绑定及补齐 PKCE/回调监听。该独立构建任务无需等待具体 SQLite 模块，因此移除原先人为的 T2a 启动依赖；T3b 仍依赖存储与运行时闭环。

执行中调整：T2a 手动配置契约已通过验证，手动侧栏可单独验收；将 T4 分为 T4a 手动配置与 T4b 测试/授权，保留原验收义务与 T5a 真实组合门禁，避免让界面字段保存等待尚未完成的 OAuth 执行面。

T3b 启动契约核对：SDK Python 存储回调、禁止隐式授权和异步构造已在本机 wheel 验证，T2a 凭证版本已通过回归。会话 SQLite 状态机采用独立模块，可先实现；Linux 构建与行情工厂仍是 T3b 的验收前提。

## 最终一致性 Review

- [ ] 所有验收断言均有明确实现与适当验证。
- [x] 已勾选任务满足自身完成条件，证据仍有效。
- [ ] 必要集成、运行时与在线门禁分别记录且通过。
- [x] 接口、依赖、状态及副作用的代码契约一致，部署验证限制单独记录。
- [x] 凭证来源、加密与失败语义符合 Spec，没有扩大数据消费范围。
- [x] 文档与实际实现同步，既有修改保留。

结论：代码一致性、实际 Docker 与浏览器配置闭环 Review 通过；T5b 还需真实凭证、账号权限及用户授权操作，整体在线验收仍未通过。未提交代码或删除既有业务数据。

## 在线验收前提

| 来源 | 当前结论 | 尚需证据 |
| --- | --- | --- |
| Tushare | 未通过在线验收 | 可用 Token、实际连接与行情结果 |
| TickFlow | 未通过在线验收 | 可用 API Key、实际连接与行情结果 |
| Finnhub | 未通过在线验收 | 可用 API Key、实际连接与行情权限 |
| Alpha Vantage | 未通过在线验收 | 可用 API Key、实际连接与配额结果 |
| Longbridge | 未通过在线验收 | 真实浏览器授权、行情权限及令牌刷新恢复 |

凭证在配置页面输入，不写入文档或聊天记录。Docker/浏览器持久化验收已通过；真实凭证在线验收仍保留未勾选。
