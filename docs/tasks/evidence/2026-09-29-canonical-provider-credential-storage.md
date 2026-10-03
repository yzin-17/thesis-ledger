# Provider 凭证存储格式收敛

## 改动与拒绝边界

- DSA Store 配置写入只接受结构化 `credentials`；旧单字符串 `credential` 无法通过配置字段校验，也不再生成密文。
- 凭证解码只接受当前 `provider_credentials` JSON 格式。旧单字符串或未知格式返回格式错误，现行凭证读取保持失败关闭，不回退为环境凭证。空字段保留与切换凭证方式的合并规则不变。
- Longbridge 的结构化 `legacy` 方法仍是现行 SDK 认证方式，与旧单字符串存储格式无关。密钥轮换测试改用结构化 Tushare token，验证重新加密和缺失旧密钥时保留原密文。

## 验证与剩余边界

- 凭证、轮换、Control、RQData 和 OAuth 定向 50 项通过；涉及模块 flake8 通过。
- DSA 全包、旧 Policy Store 分支、目标配置与真实 Provider 尚待验证；E04-b/d、D02/D03 不勾选。
