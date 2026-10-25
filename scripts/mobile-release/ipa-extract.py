"""将待校验 IPA 解到独立临时目录，拒绝路径逃逸、链接和过量输入。"""
import os
import pathlib
import stat
import sys
import zipfile

source, destination = sys.argv[1:]
base = pathlib.Path(destination).resolve()
with zipfile.ZipFile(source) as archive:
    entries = archive.infolist()
    if len(entries) > 30000 or sum(e.file_size for e in entries) > 1024 * 1024 * 1024:
        raise ValueError("IPA 解压规模超出验收限制")
    names = set()
    for entry in entries:
        name = pathlib.PurePosixPath(entry.filename)
        kind = stat.S_IFMT(entry.external_attr >> 16)
        if name.is_absolute() or ".." in name.parts or "\\" in entry.filename or kind not in (0, stat.S_IFREG, stat.S_IFDIR):
            raise ValueError("IPA 包含越界路径或链接")
        normalized = str(name)
        if normalized in names:
            raise ValueError("IPA 包含重复路径")
        names.add(normalized)
    for entry in entries:
        target = base.joinpath(*pathlib.PurePosixPath(entry.filename).parts)
        if entry.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(entry) as source_file, target.open("xb") as output_file:
            while chunk := source_file.read(1024 * 1024):
                output_file.write(chunk)
        os.chmod(target, (entry.external_attr >> 16) & 0o777 or 0o644)
