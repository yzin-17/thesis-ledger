# Provider 配置、测试与移除合同收敛

## 生产调用与改动

- Desktop Market Data 设置提交结构化 `credentials`，经 Server `MarketControlService` 传入 DSA。Server 这三项请求改用 V3 Control URL 和 `contractVersion: 3`；旧单字符串 `credential` 在 Server 调用 DSA 前拒绝。
- DSA 配置、只读测试、移除路由仅在 V3 URL 提供；V1 URL 返回 404，旧版本信封与单字符串凭据在读取或写入 Store 前拒绝。只读测试响应、移除 tombstone 响应标识 V3，配置返回原有无密钥状态与修订。
- 保留结构化凭证的空字段保留语义、只写/不回显、只读测试草稿与实际配置分离、配置修订和移除 tombstone。测试以 Tushare 结构化 token 替代无凭证 AKShare 的旧单字符串夹具；测试凭证均为合成值。

## 验证与剩余边界

- DSA Control/RQData 定向 38 项、涉及文件 Python 编译和 flake8 通过；官方离线全量 7597 项通过、1 项跳过、4 项未选。
- Server Market Control/DSA Client 定向 22 项、类型检查及完整包级 1685 项通过且 81 项跳过。
- DSA Store 内仍有旧单字符串凭证读取/存储分支，OAuth、Policy、Catalog 和目标 Server→DSA/桌面真实配置未迁移或验收；E04-b/c、D02/D03 不勾选。
