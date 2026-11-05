# 账户产品断言与币种回显验收

接续[原账户任务](../../archive/tasks/2026-08-18-position-entry-account-model.md)的 T12/T13，按[原 Spec](../../specs/2026-08-18-position-entry-account-model.md)逐项判断。主线程执行，只验 Web，原账户不保存、不切换启停；真实模型继续暂停。

## Web 发现与修复

现有 USD 账户在列表和 API 中为 USD，但编辑表单把币种固定为“人民币（CNY）”。改为按账户实际币种读取 `portfolio.types.ts` 的账户币种标签；原资产录入的 `currencyLabel` 同样复用该定义，依赖方向继续由 account-data 指向 portfolio 的纯类型/标签模块。创建仍按既有 CNY 行为，组件结构及样式不变。

按 shadcn skill 检查已安装 Base UI Input/Field/Sheet 和项目锁定 CLI。CLI 注册表连接超时保留；直接读取官方 [Input](https://ui.shadcn.com/docs/components/base/input)、[Field](https://ui.shadcn.com/docs/components/base/field)、[Sheet](https://ui.shadcn.com/docs/components/base/sheet) 文档后复用现有组件，没有安装或覆盖组件。

- Desktop 原有账户保存、资产录入和模式范围三个测试文件共 25 项通过；`desktop build` 含类型检查通过，只有既有大 chunk 提示。`node scripts/check-boundaries.mjs` 通过。最初误用不存在的 `pnpm check:boundaries`，随后按实际仓库入口完成，没有修改门禁。
- Web 重新加载实际构建后，USD 显示“USD · 美元”，专用 CNY 账户显示“CNY · 人民币”；未点击保存原 USD 账户。
- 仅对本线程新增且已有四条 Ledger 的 `dcf52295-7450-4c1d-a763-08603c1bff3f` 提交模式变更：目标返回“账户已有 Ledger 事件，类型、模式和币种已锁定”，表单保留“模拟账户”草稿和保存入口。取消后账户仍为实际、基金、CNY、已停用。
- 已恢复原 URL、模拟范围、原账户和成交记录页，原 510300.SH 买入 100、4.35 CNY 仍可见；系统浅色偏好不变。

## 可复核记录

私有回执位于 `.recovery-artifacts/remaining-p1-2026-10-20/`：`account-currency-before/after.txt/png`、`account-currency-cny.txt`、`account-ledger-lock.txt/png`、构建/测试/边界日志及前后保护 JSON。USD 修复截图 SHA-256 为 `c9d78451a970a2fb45f89165449460e858b17b3c125dba7ff7d187593b58b2e6`。

两次 `readFundTarget()` 只读快照逐字段完全相等，JSON SHA-256 均为 `426b283acf18b82eb237c620a11158889e5c9032e686ee96962a884fa5178d14`：十一账户、旧 Ledger/快照/点位、十三张业务表、57 份 V3、政策 162、来源/凭据、模型及观察计数没有变化。只读打开旧账户表单没有产生写入。

## 绝对余额、现金与清空

后续按原 T12.MANUAL 的精确范围，通过实际 Web 创建 `019a28a7-1b21-41bf-85ed-ec67b82f0ecd`，名称“账户绝对快照验收-20261021”，证券/实际/CNY，机构注明本线程专用。实际范围当时没有启用账户，页面先显示创建引导；创建后直接进入新账户，原模拟账户的录入入口在实际范围禁用。

| 操作 | 目标结果 |
| --- | --- |
| 选择既有 510300.SH，观察 10 份、成本 4.35 | 列表为 10 份，不产生 BUY/SELL |
| 修改当前绝对数量为 15、成本 4.40 | 列表为 15 份、4.40，未累加为 25 |
| 现金观察 1000 | 已结算 CNY 1000，待收/待付均零，没有 DEPOSIT 现金流 |
| 清空持仓 | 追加数量零的观察，持仓列表为空；现金仍为 1000 |
| 现金观察零 | 已结算及待收/待付均零 |
| 事件与审计 | 五条不可变观察，三条 POSITION_BASELINE_OBSERVATION、两条 CASH_BALANCE_OBSERVATION，信封均为 3；来源 MANUAL/manual，修正链显示桌面资产录入和“清空持仓”原因 |
| 收尾 | 新账户归零并可恢复停用，无 PortfolioSnapshot 或 AccountValuationPoint；原模式、账户、成交页、URL 和主题恢复 |

账本成交筛选明确为空。物化 `Trade` 仍保留一条以 `BALANCE_OBSERVATION` 结束的部分证据周期，sourceQuantity=15、remainingQuantity=0、closedQuantity=0、收益零；这不是 BUY/SELL 成交，不以物化 Trade 行数代替成交事件语义。旧观察继续保留为各自当时事实，当前余额选择最新观察。

### 严格保护失败与独立复核

本次初始预案低估了正常标的确认的元数据时间刷新，原严格快照比较因此失败，不能记成通过。两个差异仅在 AssetOther 与 InstrumentAssetAssociationOther；十三张业务保护表、原十一账户、57 份 V3、来源、政策、模型计数和所有其他检查相等。

为避免凭推测忽略差异，只读解析此前正式保留备份 `thesis-ledger-infra/.maintenance-backups/g4a-observation-20261020-2/bundle/postgres.dump` 的 510300.SH 两行。`pg_restore --data-only --file=-` 只解码标准输出，没有恢复数据库。将备份中的两行代入只读摘要计算，分别精确复原本次验收前两个全表哈希，证明其他资产及关联行完全不变。

逐字段比较确认只有 Asset.updatedAt、关联 confirmedAt/lastSeenAt 从 10-17 刷新到 10-20T19:41:40；symbol、名称、类型、币种、确认状态、instrumentId、associationId、firstSeenAt 和所有其他字段不变。保留正常时间刷新，不回写旧时间。独立回执明确 `originalStrictProtectionPassed=false`、`independentIdentityReviewPassed=true`、`businessProtectionPassed=true`，SHA-256 为 `0b0551851f686eca4d9dafa17ecfd363f792282237bbe6928578d835e20c5526`。

### 持仓来源回显修复

实际 Web 还发现持仓来源显示“未知”，但目标返回和物化行为都为 `ledger`。根因是 Desktop 的 `normalizePortfolio` 丢弃 `source` 字段，不是原 Ledger 来源丢失。原有 API 映射测试补入真实返回字段后先失败，再修复保留字符串来源；宽/窄持仓组件复用中文标签，“ledger”显示“账本”，“ledger-estimated”显示“账本（成本估算）”，不把计算来源伪称手动入口，实际入口仍从事件审计查看。

四个相关文件 31 项测试、Desktop 类型/生产构建、修改文件格式检查与源码边界通过。新构建的实际 Web 只读核对原模拟账户：200 份、成本 4.18、市值 844、盈亏 9 保持，来源显示“账本”；随后恢复原成交页。没有修改 Server、依赖、协议或结构，不进行 Docker 更新或 Electron 验证。

本节新增私有证据为 `account-observation-*.txt/png/json`、`account-position-source-*.log/txt/png`。前者保留十份/十五份、现金、清空、无成交、五条审计、停用与严格失败/独立复核；后者保留字段丢失的红灯及修复后检查。T12.MANUAL 按真实业务及独立保护复核通过，不能冒称初始严格检查一次通过。

## 原验收适用性

| 原标准 | 当前判断 |
| --- | --- |
| AC1 既有账户与创建引导、手动录入 | 旧 `/position-entry` 正常转到当前账户持仓页；手动“记录持仓快照”已存在。 |
| AC2 身份、机构与来源分离 | 复用 Canonical V3 和原模型/迁移证据；本次账户列表、机构及录入来源回显边界相符 |
| AC3 服务端锁定及停用 | 复用迁移预检及停用证据，补齐本次 Web→目标 Server 的 Ledger 模式锁定拒绝；币种错误回显已修复 |
| AC4 绝对余额、现金、清空及审计 | 通过上述真实 Web→Server 五观察闭环；绝对数量不累加、现金不伪造成交、清空不动现金、来源/原因可审计，原事实保护及元数据差异独立核对完成 |
| AC5 草稿提交及冲突 | 此次验收时草稿/对账入口尚未开放；后续结果见[草稿与对账验收](2026-10-21-account-draft-reconciliation-acceptance.md)。 |
| AC6 模式隔离及移动端 | 复用 10-16 原生基本模式和现行 V3 范围证据；本次 Web 模拟范围、原账户及恢复通过，不重验 Electron |
| AC7 基金来源、缓存及估值 | 已通过：V3 当前/历史 NAV、正式修订、披露、qfq 分钟及误差和 Web，见[组合最终对账](2026-10-21-portfolio-final-acceptance.md)。原 V1 名称属于历史协议，当前发布协议为 V3 |
| AC8 三仓兼容和快速失败 | 复用现行 V3 原子升级/结构门禁；本次前端标签修复没有协议、依赖或迁移变化 |
| AC9 测试与最终 Review | 本记录的账户、基金和绝对观察结果保留；后续草稿证据已补齐。2026-10-22 [原任务最终 Review](../../archive/tasks/2026-08-18-position-entry-account-model.md#最终一致性-review)按现行九项 AC、后继合同及 ADR-009 至 ADR-014 完成核对，T12/T13 通过并归档。 |

本记录按当时实际范围证明基金产品消费、Web 修复及绝对观察；后续草稿与最终核对由上表对应证据接续。
