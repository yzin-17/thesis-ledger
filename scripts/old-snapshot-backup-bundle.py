"""只读核对旧备份数据库记录与冻结字节，输出内存重放输入；不恢复数据库。"""
import base64
import hashlib
import json
from pathlib import Path
import re
import sys
import tarfile


def copy_unescape(value):
    if value == r"\N":
        return None
    escaped = {"\\": "\\", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v"}
    return re.sub(
        r"\\([0-7]{1,3}|[\\bfnrtv])",
        lambda match: chr(int(match[1], 8)) if match[1].isdigit() else escaped[match[1]],
        value,
    )


directory, sql_path = (Path(value).resolve() for value in sys.argv[1:])
backup = json.loads((directory / "manifest.json").read_text())
assert backup["status"] == "passed" and backup["version"] == 1
verified_files = []
for filename in ("postgres.dump", "backtest-snapshots.tar"):
    expected = next(item for item in backup["files"] if item["name"] == filename)
    actual = directory / filename
    digest = hashlib.sha256(actual.read_bytes()).hexdigest()
    assert actual.stat().st_size == expected["bytes"] and digest == expected["sha256"], filename
    verified_files.append({"name": filename, "bytes": expected["bytes"], "sha256": digest})

sql = sql_path.read_text()
matches = list(re.finditer(r'COPY public\."BacktestJob" \((.*?)\) FROM stdin;\n(.*?)\n\\\.', sql, re.S))
assert len(matches) == 1, "必须是从所选 dump 只读导出的唯一 BacktestJob COPY 段"
columns = [column.strip(' "') for column in matches[0][1].split(",")]
jobs = []
for line in matches[0][2].splitlines():
    values = [copy_unescape(value) for value in line.split("\t")]
    assert len(columns) == len(values)
    jobs.append(dict(zip(columns, values)))
assert len(jobs) == backup["jobs"]
assert len({job["id"] for job in jobs}) == len(jobs)

runs = []
with tarfile.open(directory / "backtest-snapshots.tar") as archive:
    members = archive.getmembers()
    assert len({member.name for member in members}) == len(members), "备份成员不得重复"
    index = {member.name: member for member in members}

    def read_member(name):
        member = index[name]
        assert member.isfile() and not member.issym() and not member.islnk()
        return archive.extractfile(member).read()

    for job in jobs:
        if job["mode"] != "V3" or job["status"] != "succeeded":
            continue
        run_id = job["id"]
        assert re.fullmatch(r"[a-f0-9-]{36}", run_id)
        manifest_bytes = read_member(f"./snapshots/{run_id}/finalized.json")
        manifest = json.loads(manifest_bytes)
        result = json.loads(job["result"])
        assert manifest["runId"] == run_id and manifest["status"] == "finalized"
        assert manifest["manifestVersion"] == "snapshot-manifest-v3" and result["schemaVersion"] == "3"
        assert manifest["contentHash"] == job["snapshotId"]
        assert manifest == json.loads(job["snapshotManifest"])
        assert result["resultChecksum"] == job["resultChecksum"]
        assert result["snapshotId"] == job["snapshotId"]
        family = "nav" if manifest.get("inputKind") == "nav" else "exchange"
        refs = manifest.get("artifacts")
        if family == "nav":
            refs = [{**manifest[name], "artifactId": manifest[name]["contentHash"],
                     "key": run_id + "/" + manifest[name]["key"]} for name in ("artifact", "contextArtifact")]
        assert refs, run_id
        artifacts = []
        for ref in refs:
            key = ref["key"]
            assert key.startswith(run_id + "/") and ".." not in key.split("/")
            raw = read_member("./artifacts/" + key)
            assert len(raw) == ref["sizeBytes"] and raw[:4] == raw[-4:] == b"PAR1", key
            assert hashlib.sha256(raw).hexdigest() == ref["contentHash"], key
            artifacts.append({"ref": ref, "bytesBase64": base64.b64encode(raw).decode()})
        runs.append({
            "runId": run_id, "family": family, "expectedChecksum": job["resultChecksum"],
            "expectedCompleteness": result["completeness"],
            "manifest": manifest, "manifestBytesSha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "artifacts": artifacts,
        })
assert runs and any(run["expectedCompleteness"] == "complete" for run in runs)
assert any(run["expectedCompleteness"] == "partial" for run in runs)
print(json.dumps({
    "version": 1, "backupCreatedAt": backup["createdAt"], "backupSchemaHead": backup["schemaHead"],
    "sourceFiles": verified_files, "persistentJobCount": len(jobs), "runs": runs,
}, ensure_ascii=False))
