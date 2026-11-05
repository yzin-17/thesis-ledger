# 导入边界门禁输入修正证据

责任：[源码输入 Spec](../specs/2026-10-30-boundary-source-inventory.md)，[已完成实施记录](../archive/tasks/2026-10-30-boundary-source-inventory.md)。

2026-10-30，全仓入口误扫移动端另一会话的 release 源码副本。已核实副本 Git 未跟踪且被 ignore；没有删除、移动或修改这些副本。

修复仅把输入改为 Git 已跟踪文件与未忽略的新文件并集，保持 apps/packages/services、原 TS/TSX 范围、原 node_modules/dist/coverage 范围。已有 inspect 函数与全部依赖断言按原始文本逐段比较完全相同，没有新增针对本次目录的豁免、提高阈值或放宽规则。

- `node --test scripts/boundary-source-inventory.test.mjs scripts/ai-catalog-boundaries.test.mjs`：6 项通过、0 跳过。
- 临时独立 Git 仓库确认中文/空格路径、未忽略新文件、已跟踪但被 ignore 的源码仍读取，待删除文件跳过；真实 CLI 对新维护源码和已跟踪隐藏源码的非法 BullMQ import 均返回 1，对未跟踪忽略副本不误报。
- 非 Git 输入失败关闭，不返回空的通过结果。
- `node scripts/check-boundaries.mjs`：全仓通过。

临时仓库中的 Git add 仅用于验证跟踪语义；主仓索引、原副本和生产数据未修改。此前误报日志、6 项结果及修正后的全仓结果保存在 `.recovery-artifacts/first-four-acceptance-20261030T134208Z/` 的 model-identity-boundaries.log、boundary-inventory-tests.log、boundary-inventory-full-check.log。此证据不代收任何真实模型或业务门禁。
