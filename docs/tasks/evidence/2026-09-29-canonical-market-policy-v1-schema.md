# 停用 Market Policy V1 Schema 清理

## 调用反查与改动

`packages/schemas/src/market.ts` 中的 Control V1 信封、Desired/Effective Policy V1 与字符串路由矩阵只被旧解析器自身及一条旧格式成功解析断言引用。当前 Server、Desktop 和 DSA 消费 V3 Policy 合同。本叶删除这组旧解析器与类型；现行 Control 测试继续断言 V1 和 V2 Policy 请求均被拒绝。

## 验证

- 现行 Control 定向 3 项、Schemas 全包 546 项通过。
- Schemas 构建、Server/Desktop/API Client 类型检查、模块边界、`git diff --check` 通过。
- `market.ts` 整文件 Prettier 检查未通过；差异涉及未在本叶改动的其他区段，未对整文件做无关格式化。该门禁如实保留为未通过。

## 未完成门禁

目标运行态 Policy 读写、旧输入拒绝、目录与真实客户端仍未验收；C03、E02、E04-c/d、U01、D02、D03 保持未完成。
