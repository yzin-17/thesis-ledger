# ADR-002：TypeScript 与 Python 的职责边界

## 背景

产品领域重视一致类型和客户端复用，量化生态主要位于 Python。

## 决策

NestJS/TypeScript 负责产品领域和 API；Python 负责 Quant、Market 与 AI Worker。

## 后果

跨语言调用必须版本化且可验证。

## 替代方案

单一语言降低初期复杂度但损害至少一侧生态，不采用。
