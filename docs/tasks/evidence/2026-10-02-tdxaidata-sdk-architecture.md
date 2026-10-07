# 通达信固定 SDK 包与目标架构核验（2026-10-02）

## 范围与结果

按第二优先级接续，在实际目标 DSA 首次读取固定 tdxaidata 1.2.2 PyPI 元数据与 wheel。前轮宿主请求只在 wheel TLS 握手阶段失败，没有原字节证据；本轮不是宿主成功代替容器验证。两个 URL 各一次，无重试、重定向、镜像或代理轮换，整体外层预算 40 秒/单次 20 秒，响应和 ZIP 展开预算按主 Task 登记；实际完成 2.17 秒。

2026-10-02T15:08:33.381228+00:00 目标读取成功并在内存核验 wheel 摘要。默认 Linux 原生库为 ELF64、e_machine=62；目标为 Linux aarch64、64 位进程，因此该候选的默认 Linux 库不适配当前 ARM64 容器。没有安装、导入或执行 SDK，也未调用数据接口、读取 Key、改变依赖或镜像。

## 原文身份

| 对象 | 固定事实 |
| --- | --- |
| PyPI 元数据 | https://pypi.org/pypi/tdxaidata/1.2.2/json；SHA-256 16d46c1387583287fa25a1ef655a07e5d7c9a5064078c62416c95a9a80b6c5b1 |
| wheel | tdxaidata-1.2.2-py3-none-any.whl；4443080 bytes；SHA-256 ceaf0be18cb54cd197e79cca5590d4ba7d7c3620b899e818d472d032f2c33849，与 PyPI 声明一致 |
| 发布时间 | 2026-09-30T10:08:07.807364Z；Python >=3.7；元数据许可表达式 MIT |
| Linux 原生库 | tdxaidata/lib/libTdxAiData.so；716352 bytes；SHA-256 a949ce176b34f0a996638c9e262539ce41ef92db41a5f37c5e741078ec9a6dac；ELFCLASS64/e_machine=62 |
| Linux 加载器 | tdxaidata/tdxaidata.py；SHA-256 fcd6c8f81474603c971b0e365b140b01ecd2d3f08396f28394177b554731e7e9；第87行选择 libTdxAiData.so，第88行允许显式路径/TDX_AI_DATA_LIB，第114行调用 ctypes.CDLL |
| 许可文件 | tdxaidata-1.2.2.dist-info/licenses/LICENSE；SHA-256 98d3900b48e8e1de04915b5ffb07ee35cb63f8cbd180edad52cbceed86ec5cee；MIT 文本 |

已核验的 wheel [原始发布地址](https://files.pythonhosted.org/packages/dc/c1/29b840db422aa32c87baedf2d402ccb8cbba8964d33caff3b20e5b3ddad4/tdxaidata-1.2.2-py3-none-any.whl)。包内另有 Windows DLL 与 macOS dylib，但不作为当前 Linux 目标的替代依据；py3-none-any 标签不代表其内含原生库适用于全部 CPU。

## 断言与停止点

Linux UAPI 的[ELF 架构常量](https://github.com/torvalds/linux/blob/master/include/uapi/linux/elf-em.h)定义 EM_X86_64=62、EM_AARCH64=183；[Arm AArch64 ELF ABI §5.2](https://github.com/ARM-software/abi-aa/blob/main/aaelf64/aaelf64.rst)要求 e_machine=183。本次结论限定于固定 wheel 的默认 Linux 库及当前目标；未断言其他版本或厂商另外提供的原生库均不支持 ARM64。

CPU 不匹配已足够停止当前候选集成。未继续做 DT_NEEDED、符号版本或动态加载验收，系统库/ABI、数据服务授权和真实行情/权息仍未通过；MIT 文件存在不证明数据服务权限。主任务将固定包原字节/ELF 头核验作为已完成子叶，依赖核验须等待 CPU 匹配的候选或明确的新目标方案，M27/M28/M34 父项继续开放。

同时只读核对了 RQData：目标 configured=false/source=none；宿主 zshrc/zprofile 和目标环境未发现 RQDATA/RQDATAC 账号声明，未请求来源。HiThink 凭据已配置，进度码与完整覆盖的既有缺口保持；AKShare/EastMoney/Tushare 按用户要求跳过，没有重新请求。

## 账号申请进度

用户选择申请通达信数据服务 Key。[官方说明](https://help.tdx.com.cn/quant/docs/markdown/mindoc-1hjbgqpdhv114.html)指向[个人版商城](https://vip.tdx.com.cn/site/app/pc-mall/main.html)的“会员中心 → 积分和Key管理 → 创建数据服务Key（数据服务类型）”。官方入口和 Key 类型已核对。

Codex 内置浏览器两次导航超时，已连接 Edge 的会话调用也超时，尚未进入注册表单。未提交个人信息、创建账号或 Key、接受协议或购买积分。已请求用户在官方商城完成注册或登录，并确认创建入口；该步骤待用户回复，账号申请继续开放。

账号申请不会解除本证据中的 ARM64 原生库阻塞。未修改生产源码或运行配置，仅更新证据与台账。

文档验证：本证据、主 Task 和 DSA 来源门禁的 342 个本地链接目标均存在（未验证章节锚点）；主仓与 DSA 的 `git diff --check` 均通过。未运行应用测试、镜像更新或真实来源请求。
