# Control 握手版本准入收敛

## 改动

- Server 删除无生产消费者的 V1/V2 Control 握手客户端方法，仅保留 V3 请求构造。
- DSA 的 Control 握手端点仅接受 V3 信封和 `supportedVersions: [3]`；旧版本请求统一返回 `CONTROL_CONTRACT_UNSUPPORTED`，错误仅公布当前支持版本。独立 Control Token 校验仍在握手业务判断之前执行。

## 验证与剩余边界

- Server DSA Client 定向 13 项、类型检查及完整包级 1684 项通过且 81 项跳过。
- DSA Control 定向 24 项、官方离线全量 7596 项通过，1 项跳过、4 项未选；涉及文件 Python 编译、flake8 与 diff 检查通过。
- Provider、Policy、Catalog 等其他 Control 端点和存储仍有 V1/V2 路径，本次只收紧握手；目标 Docker、真实 Provider 与业务验收未做，C03/E04/D02/D03 不勾选。
