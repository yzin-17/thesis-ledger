# 第三方许可证与 NOTICE

本项目依赖的完整许可证以各依赖包随附的 `LICENSE` 文件和锁文件解析版本为准。`pnpm licenses:scan` 会读取当前安装的锁定依赖，生成 [third-party-license-inventory.md](docs/engineering/2026-08-18-third-party-license-inventory.md)，并在 package metadata 缺少许可证字段时失败。本次扫描覆盖 671 个唯一依赖版本，未发现缺失许可证字段；发布前仍需人工确认以下重点组件。

| 组件                 | 用途                           | 许可证核对要求                                          |
| -------------------- | ------------------------------ | ------------------------------------------------------- |
| daily_stock_analysis | 同级 DSA Fork 的行情与研究能力 | 记录上游许可证、Fork commit、镜像 digest 与 attribution |
| NestJS               | Server 框架                    | 保留其 MIT 许可证声明                                   |
| React / Vite         | Desktop UI 与构建              | 保留其 MIT 许可证声明                                   |
| Prisma               | ORM 与迁移                     | 保留其 Apache-2.0 许可证声明                            |
| Zod                  | Schema 校验                    | 保留其 MIT 许可证声明                                   |
| ioredis              | Redis 客户端                   | 保留其 MIT 许可证声明                                   |
| Phosphor Icons       | 图标                           | 保留其 MIT 许可证声明                                   |
| QuantStats           | 回测分析候选 Worker            | 接入前核对许可证、版本和报告 attribution                |
| InStock              | 筹码 benchmark 候选            | 移植任何代码前核对许可证兼容性与来源标注                |

当前仓库未声明已移植 InStock 或 QuantStats 源码。若后续引入，必须在本文件记录版本、来源 URL、许可证、修改范围和对应文件。

DSA Fork 不纳入本仓库依赖树，而是作为同级独立仓库和 HTTP 服务发布；正式镜像发布后，必须把上游许可证、NOTICE、本地修改文件、Fork commit 与 GHCR digest 逐项追加到本文件，并重新运行扫描。
