# 历史报告比较的客户端证据

关联：[原 Task 的 T11](../2026-10-18-research-evidence-evolution.md)。本次继续使用原详情页及保存的研究资料，未创建独立报告中心。

## 已交付行为

- SDK 校验请求、当前报告及选择的前序身份，比较查询支持取消。TanStack Query 按身份、范围、报告和选择隔离缓存；切换范围或身份后关闭旧比较，读取失败不继续显示缓存正文。
- 原详情按需展开比较，已加载的成功报告使用同一份中文选项及回显标签。五个维度分别展示文字、字段和引用变化；两端证据分别使用各自报告及权限范围读取。
- 默认隐藏未变字段，可展开核对。质量未知、历史信息缺失及不可比原因保持明确显示，不由比较界面触发新研究或更新资料。

## 当前源码验证

| 检查 | 结果及日志 |
| --- | --- |
| Server 比较定向测试 | 2 文件 28 项通过；`/tmp/thesis-ledger-t11-comparison-unit-1792402885.log` |
| 共享 Schema 全量 | 104 文件 1,216 项通过；`/tmp/thesis-ledger-t11-schemas-1792402887.log` |
| SDK 全量 | 13 文件 92 项通过；`/tmp/thesis-ledger-t11-sdk-1792402972.log` |
| Desktop 全量 | 173 文件 992 项通过；`/tmp/thesis-ledger-t11-desktop-1792402897.log`；既有 JSDOM 导航提示未造成失败 |
| Desktop 类型与构建 | 通过；`/tmp/thesis-ledger-t11-desktop-build-1792402975.log` |
| 修改文件静态及复杂度检查 | 通过，复杂度 20、函数长度 220；`/tmp/thesis-ledger-t11-lint-1792402989.log` |
| 仓库模块边界 | 通过；`/tmp/thesis-ledger-t11-boundaries-1792403003.log` |
| 比较真实 HTTP / 隔离 PostgreSQL | 6 项通过；`/tmp/thesis-ledger-t11-postgres-1792403004.log`；正式隔离脚本执行 34 份 migration 后清理临时容器 |

共享响应增加维度完整性和证据前后关系约束后，重新验证了生产者与消费者。此时 `packages/schemas/src/research-comparison.ts` 的 SHA-256 为 `24facd9e4e01c6b6c8d8e1920fed88c0bb07fc9b11012e93733eaa28f1dc2d57`；T10 证据中的旧摘要对应此前检查点。

## 受控浏览器交互

使用当前实际页面组件、项目 Vite 配置和独立回环 GET 接口，资料为共享合成冻结样例。实际鼠标完成展开、选择另一份报告和读取前一份报告证据，中文选中标签正确，证据展示原币 `100 CNY`。切换校验对象后旧比较关闭，重新展开显示错误态，旧正文不出现。自动化测试另覆盖模式、身份变化与晚到响应。

记录的四次 GET 分别为默认比较、指定前序比较、前序证据、切换对象后的不存在报告；写请求数为零。截图：`/tmp/thesis-ledger-t11-browser-comparison.png`。验证服务器已关闭，两个本次入口及前次退出遗留的两个自建入口均经内容核对删除，Desktop 目录未留校验入口。

这项组件浏览器证据不替代 G4b 的目标环境完整业务路径；Electron、真实资料、目标数据库升级和真实模型均未由此验收。三仓 `git diff --check` 通过，暂存项均为零。
