# RQData 基金事件进程隔离

## 实现范围

DSA 新增 `data_provider/rqdata_fund_event_process.py`，以 `spawn` 创建独立进程，客户端工厂在子进程内初始化账号，复用现有拆分或分红读取器。父进程先验证身份、日期、币种、响应行数和有限正超时，初始化、读取、标准化和结果解码共享总期限。超时先 terminate，再按需要 kill，拒绝迟到结果。

完整标准化 JSON 经私有临时目录传回，限制为 8 MiB；子进程结束前父进程不读取结果，避免管道部分写入导致阻塞。子进程标准输出和错误输出定向到空设备，SDK 异常文本不跨边界，父进程只接收稳定失败码。临时目录随调用结束清理。

## 验证与限制

### 镜像构建门禁接入

最终结果：句柄 `51023` 退出码 0，官方更新成功。新 DSA 镜像 `sha256:a9afed6adcadff81b776132790a743db90c422a1bc97fb96697ab32e47ca7b20` 健康；禁网探针再次通过固定版本、基金接口和显式工厂检查，网络尝试为 0。新增构建门禁至目标运行态的验证完成；不包含后来新增的目录解析器，也不证明 RQData 真实账号权限。

续接确认：官方构建日志的 stage-3 8/21 已实际运行 RQData 固定版本及基金接口断言，`DONE 1.8s`。SDK-builder 已通过源码/补丁及 cargo 测试，正在执行 pip wheel；句柄 `51023` 仍运行。新增门禁的构建执行已有证据，但镜像最终导出、替换容器及健康验收尚未完成。

DSA Dockerfile 在 requirements 安装后增加固定版本与基金接口的导入门禁，不调用 init。相同命令已在目标容器退出成功，Dockerfile 空白检查通过。为验证官方 Dockerfile 变换及实际镜像构建，已启动官方 `update.sh dsa`；当前句柄 `51023` 仍运行，日志 `/private/tmp/goal-rqdata-build-gate-20260927.log`。续接应查询该句柄，不能重复启动；当前尚不能将新增门禁记为构建验收完成。

### 官方完整更新与目标导入验收

更新句柄 `65335` 已以退出码 0 完成，无需再等待或重启。目标 DSA 镜像为 `sha256:5bcf88cef6062da0ef210397cc71862663bf6ee77a5be5b6dbc3cc8746a2b9fb`，容器健康；Server、Worker、数据库和 Redis 也保持健康。官方更新日志为 `/private/tmp/goal-rqdata-update-escalated-20260927.log`。

目标禁网探针验证 `rqdatac 3.7.1`、`rqdatac-fund 1.0.44`、基金拆分/分红接口及显式工厂参数，网络尝试数为 0。首次探针在导入主包后直接访问 `fund` 失败；检查固定 SDK 发现真实 init 会自动加载插件，而探针替换了 init，因此显式导入基金扩展后第一次重试通过。该结果证明目标依赖加载，不代表真实账号登录或接口权限。

续接检查：权限升级后的首次构建在 Debian `libitm1` 下载收到 502，官方脚本自动重试后已通过系统包和 Python 依赖安装，日志列出 RQData 主包与基金扩展。当前停留在镜像既有 Longbridge SDK 构建阶段；执行句柄 `65335` 多次查询均仍存活，无终态。该 SDK 构建器使用捕获输出的 subprocess，阶段内没有逐行日志不能据此判定进程已停止。尚未执行目标 SDK 探针，仍不得将安装阶段日志记为目标运行验收通过。

已调用 `update.sh dsa`。首次执行及脚本内部一次重试均因沙箱禁止写入 Docker Buildx 活动记录失败，未替换服务；日志 `/private/tmp/goal-rqdata-update-20260927.log`。随后通过工具权限升级重跑同一官方入口，已进入镜像系统依赖安装阶段。

前期执行句柄为 `65335`，等待阶段没有因观察超时重启构建。目标探针 `/private/tmp/goal-rqdata-import-probe-20260927.py` 已按本节结果执行。

### 目标 SDK 版本固定

目标 DSA 实际平台为 Linux aarch64、Python 3.11.16。查阅 [rqdatac 的 PyPI 元数据](https://pypi.org/pypi/rqdatac/3.7.1/json)与[基金扩展元数据](https://pypi.org/pypi/rqdatac-fund/1.0.44/json)，下载匹配平台 wheel 后核对源码签名：客户端支持显式 `username/password`，基金拆分/分红入口均为 `order_book_ids, market='cn'`。基金扩展要求 `rqdatac>=3.4.2`，所选组合满足声明约束。

DSA requirements 固定 `rqdatac==3.7.1`、`rqdatac-fund==1.0.44`。下载客户端 wheel SHA-256 为 `9a7f71da66460f6d8b263d8dc1d0fb62ed7a9bcbc9612194e1e329f389f8ff03`，基金扩展为 `26b81ab1d61bcd01414a0902ae0ff8734889be01e44fe32799abd2ef30b9c236`。虚拟环境无 pip，首次下载命令失败；改用宿主 pip 的 download 模式后成功，未在宿主安装 SDK。

此依赖变更要求下一步使用官方 `update.sh dsa`，不能使用代码同步绕过依赖检查。当前仅完成版本与制品核对，目标安装/SDK 导入尚未完成；没有账号登录或真实数据请求。

### 完整定向回归与依赖现状

RQData 标准化、读取器、进程、工厂、修订与受保护读取的完整定向回归 **100 项通过**，日志 `/private/tmp/goal-rqdata-suite-20260927.log`。随后补齐准入修订格式的前置校验：非规范 HMAC（包括非 ASCII 值）在读取凭据前拒绝；受保护读取文件 **9 项通过**，日志 `/private/tmp/goal-rqdata-read-input-20260927.log`。

通过 `importlib.util.find_spec` 只读核对，宿主 `.venv` 与目标 DSA 容器均无 `rqdatac` 和 `rqdatac_fund`。这说明当前部署无法执行真实 SDK 初始化；本轮没有尝试登录或把失败计为来源请求。下一步必须完成可用 SDK/基金扩展版本与目标平台依赖核实，再接入生产配置和来源准入；真实账号权限、ETF 映射、币种及历史覆盖仍需独立证据。缺少依赖不视为整个目标无可推进事项。

### 读取前后账号修订核对

新增 `thesis_ledger_rqdata_read.py`，接收上层已准入的内部账号修订、凭据及主密钥读取回调。调用前以既有 HMAC 核对显式 RQData 快照，只将该不可变快照交给进程内客户端工厂；读取完成后重读凭据与主密钥，再次核对相同准入修订。调用前账号不符时零调用，读取中账号或主密钥轮换、账号被撤销时拒绝返回晚到结果。

读取接缝、修订计算和工厂 **21 项通过**，关键 flake8 通过；日志 `/private/tmp/goal-rqdata-read-revision-20260927.log`。用例核对传给隔离读取的账号确为原快照、目标与超时未变。该接缝仍需生产凭据回调、来源范围准入及真实 SDK 依赖接线；它不替代证券映射、币种、历史覆盖或事件 V3 准入。

### 内部账号修订计算

现有 `provider_credential_revision` 增加 RQData `username_password` 分支，复用既有用途隔离 HMAC 与主密钥版本，绑定显式用户名和密码；非法或不完整账号返回无修订，密码原值不作静默 trim。新增测试确认任一账号字段、主密钥或密钥版本变化都会改变修订，且原始值不出现在修订与快照展示中。连同 HiThink 修订、Tushare 准入回归 **20 项通过**，关键 flake8 通过；日志 `/private/tmp/goal-rqdata-credential-revision-20260927.log`。

本节只证明修订计算，尚未接入 RQData 准入存储或读取前后重检，不能据此声称旧准入已自动失效。该接线、SDK 依赖及真实权限继续列为 M29/M30 剩余工作。

### 显式客户端工厂

新增 `RqDataClientFactory`，使用不可变、可序列化的显式账号快照，用户名/密码均排除在对象 `repr` 外；空凭据在初始化前拒绝，不由该工厂读取环境账号。子进程调用工厂后按显式参数初始化 `rqdatac`，缺失基金扩展或初始化失败返回稳定错误码。工厂与进程隔离共 **21 项通过**，关键 flake8 通过，日志 `/private/tmp/goal-rqdata-factory-20260927.log`。

初始化参数依据 [RQData 官方 API 示例](https://pypi.ricequant.com/doc/rqdata/python/generic-api)；基金扩展安装要求依据 [官方手册](https://www.ricequant.com/doc/rqdata/python/manual.html)。当前仓库 requirements、运行时和 infra 兼容配置尚无 RQData 依赖或账号入口；本轮没有安装 SDK、配置真实凭据或新增 Provider 准入。真实版本锁定、账号安全修订及事件路由仍未完成。测试只证明工厂调用边界，不证明真实 SDK 的服务端账号权限。

补充真实 spawn 边界：读取函数写入受控进入标记后阻塞，父进程超时终止并确认无遗留子进程；子进程直接异常退出被归类为读取失败；分红入口保留 `0.012` 精确金额和不完整覆盖；不可序列化工厂返回 `rqdata_process_start_failed`，不泄漏底层启动异常。最终隔离文件 **13 项通过**，关键 flake8 通过，日志 `/private/tmp/goal-rqdata-process-final-20260927.log`。已完成独立进程入口子叶，不据此关闭真实 SDK/账号、路由或部署义务。

真实 spawn 测试覆盖成功标准化、初始化阻塞终止、无残留子进程、异常文本隔离及非法期限前置拒绝；首轮 9 项通过。修订日志隔离及解码后期限检查后，连同现有拆分/分红读取器定向回归 **32 项通过**，关键 flake8 检查通过，日志 `/private/tmp/goal-rqdata-process-regression-20260927.log`。

这是可调用隔离入口，尚未配置真实 RQData 客户端工厂、账号安全修订、目标 ETF 身份或事件 V3 路由。工厂必须可被 spawn 序列化；当前未授予来源准入，未声明完整历史覆盖，未部署或请求真实 SDK。M29/M30 父任务继续开放。
