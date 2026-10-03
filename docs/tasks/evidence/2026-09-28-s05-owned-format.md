# S05 指定文件格式修复证据

## 状态与范围

- 任务：`S05-owned-format-0928`。
- 状态：`blocked`。执行前的内存候选触发“任何 JS 字节变动立即停止”条件，未写入任何源码或测试文件。
- 写权限限定为父级指定的十个文件及本证据文件；保留已有 dirty WIP，未 stage、commit、reset、clean 或执行宽泛 format。
- 父级已告知三个职责 source writer 与测试均已停止。此叶未启动后台资源、测试、数据库、网络、Provider 或部署进程。

## 检查方法与结果

通过 `rtk proxy node` 读取项目 Prettier 配置，在内存中生成格式候选；未使用 `prettier --write`。比较 TypeScript `transpileModule` 与 esbuild `transform` 的输出 SHA-256。

- TypeScript：`5.9.2`；参数为 `target: ES2022`、`module: ESNext`、`removeComments: true`。
- esbuild：`0.28.1`；参数为 `loader: ts`、`target: es2022`、`format: esm`、`legalComments: none`。
- 第一个文件 `apps/server/src/backtest/backtest-reconstruction-preflight-v3.ts` 的两种输出均非字节一致，检查脚本退出码为 `1`，随后只读诊断退出码为 `0`。
- TypeScript 首处差异：单行 import 新增 trailing comma；esbuild 首处差异：单行 import 改为多行 import。这是打印布局差异，但本叶没有权限将字节不一致降级为通过。

| 摘要对象 | 修改前 SHA-256 | 内存候选 SHA-256 |
| --- | --- | --- |
| 源码 | `b67b7e3975cf17a62322865159d45d8d9c1a46a369a2ab78a049bd193d3640ed` | `8374356a08e55afa7c81727533a588b36524aa7ad00daaa8c4efb4e49f090115` |
| TypeScript 输出 | `db84a17dd5f509de55bfc87da1563598d75fbb059fcb12abdf03f79fb5cb0546` | `b8f3c9ebd07b83a2e691df48c4eef926fccefcf0023cbab2d4b3d4381b0df8fa` |
| esbuild 输出 | `def31ab497e27ddd95842c56ea91f00a1a93ce3615a3d9a28662d7375b907314` | `bd9a27b27cc3f8ce6270720d6d2eb3f298eb8f351a7c449a1192bcffbd32f5e6` |

## 未执行项与资源交接

达到停止条件后，未处理剩余九个文件，未运行 owned Prettier check、普通或 strict ESLint，未声明格式修复完成。未修改阈值或 ignore。所有前台命令已退出，无本叶遗留进程；本会话不复用。

需要父级重新明确转译身份判断是否允许对 JS 打印结果先做 canonical 化，再由新叶执行；此证据不构成行为一致或验证通过的交付。
