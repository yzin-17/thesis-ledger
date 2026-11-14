"""将研究备份解包至隔离目录，交由 DSA 恢复应用 SQLite。"""
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile


def restore_archives(bundle, destination, sqlite_helper):
    bundle, destination = Path(bundle), Path(destination)
    for name, folder in [("dsa-data.tar", "dsa"), ("backtest.tar", "backtest")]:
        output = destination / folder
        output.mkdir(mode=0o700)
        with tarfile.open(bundle / name) as archive:
            for member in archive.getmembers():
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts:
                    raise ValueError("归档路径越界")
                if not (member.isfile() or member.isdir()):
                    raise ValueError("归档包含链接或特殊文件")
            archive.extractall(output, filter="data")
    subprocess.run([sys.executable, sqlite_helper, str(bundle / "dsa.sqlite"),
                    str(destination / "dsa")], check=True)
    print("SQLite完整性和归档恢复通过")


if __name__ == "__main__":
    restore_archives(*sys.argv[1:4])
