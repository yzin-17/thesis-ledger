# CONT-DSA requirements.txt ASCII 修复证据

## 变更范围

- DSA `requirements.txt:10`：将交易日历固定版本的中文行尾说明改为 ASCII 英文说明。
- DSA `requirements.txt:76`：将 RQData 基金事件的中文独立说明改为 ASCII 英文说明。
- 保留全部依赖声明、版本、顺序和其他行；未安装依赖、修改锁文件或运行全包测试。

## 复现与验证

| 阶段 | 命令或检查 | 结果 |
| --- | --- | --- |
| 初次尝试 | `rtk python -m pytest -q tests/test_check_env_encoding.py::test_requirements_file_is_ascii_decodable` | 默认 Python 缺少 `pytest`，测试未启动；退出码 1。 |
| 修复前复现 | `rtk .venv/bin/python -m pytest -q tests/test_check_env_encoding.py::test_requirements_file_is_ascii_decodable` | 断言因 `UnicodeDecodeError` 失败，首个非 ASCII 字节位于 byte 402；退出码 1。 |
| 修复后定向测试 | 同一 `.venv` 命令 | `1 passed`；退出码 0。 |
| 文件编码 | `rtk python -c 'from pathlib import Path; Path("requirements.txt").read_bytes().decode("ascii")'` | ASCII 解码通过；退出码 0。 |
| 首次摘要检查 | 对修复后的完整非注释行直接与改前摘要比较 | 因第 10 行行尾注释参与摘要而失配；退出码 1。随后改用下述精确对照。 |
| 依赖声明 | 对改前 44 条非注释行计算 SHA-256；修复后仅把两处注释精确还原于内存，再逐行计算同一摘要 | 改前与还原后均为 `cb217c152608fadd824ede0f2fd481cc8d0d64757f829200c0aeef2f8dc89d7f`，说明除两处注释外的依赖行逐行相同；退出码 0。 |
| 差异空白 | `rtk git diff --check -- requirements.txt` | 通过；退出码 0。 |

测试进程和只读检查进程均已结束，无后台进程留存。本批未执行第三轮官方全包测试、目标部署、Provider 或账号验证。
