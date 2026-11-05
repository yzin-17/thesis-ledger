# 旧 Control 握手客户端清理

## 调用核对

Server `DsaClient.controlHandshake()` 与 `controlHandshakeV2()` 没有生产调用或测试调用；只保留当前 `controlHandshakeV3()`。本次删除两项旧客户端方法及其组装旧请求的逻辑，未修改 DSA Control 路由或服务端对旧合同的准入。

## 验证与边界

- Server 类型检查、DSA Client 定向 13 项与完整包级 1684 项通过且 81 项跳过。
- DSA Control 的 V1/V2 分支、Catalog/Provider 路由及对应状态仍需逐消费者迁移；不能以客户端方法清理认定 Control 合同完成。目标 Docker 与业务验收未执行，C03/E04/D02/D03 不勾选。
