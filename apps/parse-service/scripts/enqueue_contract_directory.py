#!/usr/bin/env python3
"""把一个本地合同目录批量提交到异步解析队列。

目录第一层的一份 PDF/Word 视为一份合同；第一层的一个文件夹视为一份合同包。
合同包会临时打成 ZIP，并保留文件夹名作为 ZIP 顶层目录，从而让 /jobs/upload
按正确的合同边界建一个解析任务。该脚本仅入队，绝不确认合同或写 Milvus。

默认是 dry-run；必须显式传 --execute 才会发起上传。结果写入 JSONL，支持重跑。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import httpx


SUPPORTED_SUFFIXES = {".pdf", ".doc", ".docx"}
MAX_SINGLE_FILE_BYTES = 500 * 1024 * 1024
MAX_PACKAGE_FILES = 200
MAX_PACKAGE_BYTES = 1024 * 1024 * 1024


def eligible_files(folder: Path) -> list[Path]:
    return sorted(
        (path for path in folder.rglob("*") if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES),
        key=lambda path: path.as_posix(),
    )


def source_fingerprint(path: Path, files: list[Path]) -> str:
    """稳定标识一个待提交合同，供结果日志的断点续传使用。"""
    digest = hashlib.sha256()
    digest.update(path.name.encode("utf-8"))
    for file in files:
        stat = file.stat()
        digest.update(str(file.relative_to(path if path.is_dir() else path.parent)).encode("utf-8"))
        digest.update(f"{stat.st_size}:{stat.st_mtime_ns}".encode("ascii"))
    return digest.hexdigest()


def load_completed(result_path: Path) -> set[str]:
    if not result_path.exists():
        return set()
    completed: set[str] = set()
    for raw in result_path.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if item.get("status") in {"queued", "skipped_duplicate"} and item.get("fingerprint"):
            completed.add(str(item["fingerprint"]))
    return completed


def append_result(result_path: Path, item: dict) -> None:
    item["recorded_at"] = datetime.now(timezone.utc).isoformat()
    with result_path.open("a", encoding="utf-8") as output:
        output.write(json.dumps(item, ensure_ascii=False) + "\n")


def package_folder(folder: Path, files: list[Path]) -> Path:
    """生成只含可解析文件的临时 ZIP，保留顶层合同目录。"""
    handle = tempfile.NamedTemporaryFile(prefix="jingxiaoguan_contract_", suffix=".zip", delete=False)
    archive_path = Path(handle.name)
    handle.close()
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file in files:
            archive.write(file, arcname=(Path(folder.name) / file.relative_to(folder)).as_posix())
    return archive_path


def candidates(root: Path):
    for path in sorted(root.iterdir(), key=lambda item: item.name):
        if path.name.startswith("合同抽取清单_") or path.name.startswith("批量入队结果_"):
            continue
        if path.is_file():
            if path.suffix.lower() in SUPPORTED_SUFFIXES:
                yield path, [path], None
            else:
                yield path, [], f"不支持的根目录文件类型：{path.suffix or '无扩展名'}"
            continue
        files = eligible_files(path)
        if not files:
            yield path, [], "合同包内没有 PDF、DOC 或 DOCX"
        elif len(files) > MAX_PACKAGE_FILES:
            yield path, files, f"合同包包含 {len(files)} 个可解析文件，超过 {MAX_PACKAGE_FILES} 个限制"
        elif sum(file.stat().st_size for file in files) > MAX_PACKAGE_BYTES:
            yield path, files, "合同包可解析文件总大小超过 1GB 限制"
        else:
            yield path, files, None


def main() -> int:
    parser = argparse.ArgumentParser(description="批量提交合同目录到异步解析队列")
    parser.add_argument("--input-dir", type=Path, required=True, help="合同目录；第一层文件/文件夹为合同边界")
    parser.add_argument("--parse-url", default="http://127.0.0.1:8100", help="Parse Service 地址")
    parser.add_argument("--created-by", default="batch-import-20260821")
    parser.add_argument("--result-file", type=Path, default=None, help="JSONL 结果文件；默认写入输入目录")
    parser.add_argument("--execute", action="store_true", help="实际上传；未指定时只做预检")
    parser.add_argument("--limit", type=int, default=0, help="最多处理多少个候选，用于小批验证")
    args = parser.parse_args()

    root = args.input_dir.resolve()
    if not root.is_dir():
        raise SystemExit(f"输入目录不存在：{root}")
    result_path = args.result_file or root / "批量入队结果_20260821.jsonl"
    completed = load_completed(result_path) if args.execute else set()
    endpoint = args.parse_url.rstrip("/") + "/jobs/upload"

    stats = {"total": 0, "ready": 0, "invalid": 0, "skipped_resume": 0, "queued": 0, "duplicates": 0, "failed": 0}
    with httpx.Client(timeout=httpx.Timeout(connect=10, read=180, write=180, pool=10)) as client:
        if args.execute:
            health = client.get(args.parse_url.rstrip("/") + "/health")
            health.raise_for_status()
        for path, files, invalid_reason in candidates(root):
            if args.limit and stats["total"] >= args.limit:
                break
            stats["total"] += 1
            fingerprint = source_fingerprint(path, files) if files else ""
            base = {"fingerprint": fingerprint, "source_name": path.name, "source_path": str(path), "file_count": len(files)}
            if invalid_reason:
                stats["invalid"] += 1
                print(f"[skip] {path.name}: {invalid_reason}")
                if args.execute:
                    append_result(result_path, {**base, "status": "invalid", "reason": invalid_reason})
                continue
            if path.is_file() and path.stat().st_size > MAX_SINGLE_FILE_BYTES:
                reason = "单合同文件超过 500MB 限制"
                stats["invalid"] += 1
                print(f"[skip] {path.name}: {reason}")
                if args.execute:
                    append_result(result_path, {**base, "status": "invalid", "reason": reason})
                continue
            stats["ready"] += 1
            if not args.execute:
                print(f"[ready] {'合同包' if path.is_dir() else '单文件'} {path.name}（{len(files)} 个可解析文件）")
                continue
            if fingerprint in completed:
                stats["skipped_resume"] += 1
                print(f"[resume-skip] {path.name}")
                continue
            temp_zip: Path | None = None
            try:
                if path.is_dir():
                    temp_zip = package_folder(path, files)
                    with temp_zip.open("rb") as upload:
                        response = client.post(endpoint, params={"created_by": args.created_by}, files={"files": (f"{path.name}.zip", upload, "application/zip")})
                else:
                    with path.open("rb") as upload:
                        response = client.post(endpoint, params={"created_by": args.created_by}, files={"files": (path.name, upload, "application/pdf" if path.suffix.lower() == ".pdf" else "application/octet-stream")})
                response.raise_for_status()
                jobs = response.json().get("jobs", [])
                statuses = {job.get("status", "queued") for job in jobs}
                status = "skipped_duplicate" if statuses == {"skipped_duplicate"} else "queued"
                stats["duplicates" if status == "skipped_duplicate" else "queued"] += 1
                append_result(result_path, {**base, "status": status, "jobs": jobs})
                print(f"[{status}] {path.name}: {len(jobs)} 个任务")
            except Exception as exc:
                stats["failed"] += 1
                append_result(result_path, {**base, "status": "failed", "reason": f"{type(exc).__name__}: {exc}"})
                print(f"[failed] {path.name}: {type(exc).__name__}: {exc}", file=sys.stderr)
            finally:
                if temp_zip is not None:
                    temp_zip.unlink(missing_ok=True)
    print(json.dumps(stats, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
