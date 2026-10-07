# R02.11：新浪指数唯一精确身份选择局部证据

状态：`worker_done`，仅完成身份修复叶；R02.11 的真实来源准入仍开放。

## 范围与实现

依据完整 Spec §3.3 及 `2026-09-28-m3-r02-r03-frontier.md` 的 R02.11-identity 叶。仅新增 DSA `data_provider/sina_index_identity.py`、`tests/test_sina_index_identity.py`，并修改 `AkshareFetcher.get_main_indices` 的行选择接缝。

原行为在无精确行时使用包含匹配，并从匹配结果取首行。现行为只接受既有六个完整代码的唯一精确行；目标缺失、近似代码、空值、畸形身份、重复代码、缺代码列或重复代码列均拒绝对应目标。其他目标的唯一行继续消费，源端异常仍返回 `None`，空快照或全部身份拒绝返回空列表。helper 属于新浪指数身份领域，返回原始行；现有数字转换、振幅计算、单位、字典字段和六目标排列保持。

没有修改 Manager、MarketAnalyzer、manifest、登记、台账或其他 Provider 路径；没有生成来源时点、市场阶段、实时性或准入。测试调用实际 Manager → AkshareFetcher → MarketAnalyzer 接缝，只有 SDK 和网络、节流及 TickFlow 探测被隔离。

## 存量文件约束与摘要

写入前保存 Akshare 当前工作树内容，比较该基线的局部差异，确认仅触及 `get_main_indices`，既有 WIP 保留。文件行数从 2638 降至 2633。

| 文件 | 修改前行数 | 修改后行数 | SHA-256 |
| --- | --- | --- | --- |
| `data_provider/akshare_fetcher.py` | 2638 | 2633 | 前：`bcee29f4a1b5e94830dcba174b4a7a982695be43a79469d67946f165c390d100`；后：`abb60ee7c54661f53e81babf6186bf183aa5aae4d455e3e8d5c820cc09da566c` |
| `data_provider/sina_index_identity.py` | 不存在 | 21 | `c65f98eb974c98d7b3c364ff8193aa3e9cd8e0f45fca33cfdc5b3c21ad6204ed` |
| `tests/test_sina_index_identity.py` | 不存在 | 109 | `bb3d82cf6e6549ee44173336af1d15eacca4c1cea22d7380d0e74cb2051461f9` |

## 验证结果

在 DSA 根目录执行：

```sh
rtk proxy env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s tests -p test_sina_index_identity.py
```

5 项测试通过，0 失败，0 跳过。覆盖六目标乱序输入的原输出、字段和单位保持，近似身份、大小写/裸代码、重复身份、缺代码列、重复代码列、空快照、空身份及畸形身份，重复目标不影响其他唯一目标，源端异常，以及实际消费者成功/拒绝接缝。SDK 使用 `patch.dict(sys.modules)` 替换，同时阻止 `requests.sessions.Session.request` 和 `socket.socket.connect`，未访问真实 SDK 网络。

三个独占 Python 文件经 `ast.parse` 通过语法验证，没有生成 bytecode。首次使用系统 `python` 的定向命令因缺 pandas 在导入阶段失败；切换仓库现有 `.venv/bin/python` 后通过，未安装依赖。虚拟环境与宿主均无 ruff，`rtk proxy ruff --version` 明确返回不可执行，故未执行 lint，也未新增依赖或缓存。

其他已有 main-index 测试只覆盖其他 Provider；本次不改这些实现，因此未额外执行。未执行全包测试、仓库门禁、生产镜像、Docker、数据库、部署、浏览器或真实 Provider 验证。

## 风险与回滚

源端若返回重复的完整指数代码，该指数将被拒绝，现有 Manager 仍按已有空结果规则选择后续来源；此处不授予后续来源任何新准入。来源时点、字段单位事实、交易阶段、权限和真实范围仍由后续 G0-M 单独验证。

回滚只恢复本叶的 `get_main_indices` 行选择接缝并移除两个新增 Python 文件；不得回退整个存量 Akshare 文件，以免覆盖既有 WIP。
