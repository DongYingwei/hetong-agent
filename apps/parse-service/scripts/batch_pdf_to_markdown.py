#!/usr/bin/env python3
"""批量调用 MinerU，把 PDF 转成 Markdown 并维护内容指纹映射。

用法（在 apps/parse-service 下）：
    ./scripts/batch_pdf_to_markdown.py /path/to/pdfs
    ./scripts/batch_pdf_to_markdown.py /a/one.pdf /a/contracts /a/other.pdf --output-dir /a/md-pdf
    python3 scripts/batch_pdf_to_markdown.py --lookup /path/to/new-upload.pdf --output-dir /path/to/md-pdf

目录会递归扫描 PDF，Word（.doc/.docx）及其他文件会忽略。输出保持源目录相对层级，
默认输出目录是单一输入的同级 ``md-pdf/``；混合/多个输入时必须给 ``--output-dir``。
其中 ``manifest.json`` 按 PDF SHA-256 保存 PDF → Markdown 映射；同一 PDF 改名或重新上传仍可用 --lookup 命中。
失败只记录并继续下一份，退出码在有失败时为 2。
"""

from __future__ import annotations

import argparse
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "src"))

from jinguan_parse.clients import HttpMineruClient  # noqa: E402
from jinguan_parse.config import load_settings  # noqa: E402
from jinguan_parse.pdf_markdown_cache import (  # noqa: E402
    convert_pdf,
    iter_pdfs,
    markdown_for_pdf,
)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="批量 PDF → Markdown（带 SHA-256 映射）")
    parser.add_argument("sources", nargs="*", type=pathlib.Path, help="PDF 文件或目录（目录递归扫描）")
    parser.add_argument("--output-dir", type=pathlib.Path, help="Markdown 缓存目录，默认 <source_dir>/md-pdf")
    parser.add_argument("--source-root", type=pathlib.Path, help="输出层级的共同根目录，默认根据输入自动推断")
    parser.add_argument("--force", action="store_true", help="同一 PDF 已缓存时也重新调用 MinerU")
    parser.add_argument("--lookup", type=pathlib.Path, help="仅按 PDF 指纹查询现有映射，不调用 MinerU")
    args = parser.parse_args(argv)
    if args.lookup and args.sources:
        parser.error("--lookup 不接受 PDF/目录输入")
    if not args.lookup and not args.sources:
        parser.error("请提供 PDF/目录输入，或使用 --lookup")
    if args.lookup and not args.output_dir:
        parser.error("--lookup 需要 --output-dir")
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.lookup:
        if not args.lookup.is_file():
            print(f"✗ PDF 不存在：{args.lookup}")
            return 1
        match = markdown_for_pdf(args.lookup, args.output_dir)
        if match:
            print(match)
            return 0
        print("未命中：该 PDF 尚未转换，或对应 Markdown 已被删除。")
        return 3

    missing = [p for p in args.sources if not p.exists()]
    if missing:
        for path in missing:
            print(f"✗ 路径不存在：{path}")
        return 1
    if len(args.sources) > 1 and not args.output_dir:
        print("✗ 同时处理多个文件/目录时，请明确指定 --output-dir")
        return 1
    sole = args.sources[0].resolve() if len(args.sources) == 1 else None
    output = (args.output_dir or (sole / "md-pdf" if sole.is_dir() else sole.parent / "md-pdf")).resolve()
    paths: list[pathlib.Path] = []
    ignored_word = 0
    for item in args.sources:
        resolved = item.resolve()
        if resolved.is_file():
            if resolved.suffix.lower() == ".pdf":
                paths.append(resolved)
            elif resolved.suffix.lower() in {".doc", ".docx"}:
                ignored_word += 1
            else:
                print(f"⏭ 非 PDF，跳过：{resolved}")
        else:
            paths.extend(p for p in iter_pdfs(resolved) if output not in p.parents)
            ignored_word += sum(1 for p in resolved.rglob("*") if p.is_file() and p.suffix.lower() in {".doc", ".docx"})
    paths = sorted(set(paths))
    if not paths:
        print("✗ 未找到 PDF")
        return 1
    if args.source_root:
        source_root = args.source_root.resolve()
        if not source_root.is_dir() or any(source_root not in p.parents and p != source_root for p in paths):
            print("✗ --source-root 必须是所有输入 PDF 的共同父目录")
            return 1
    elif sole and sole.is_dir():
        source_root = sole
    else:
        source_root = pathlib.Path(os.path.commonpath([str(p.parent) for p in paths]))

    settings = load_settings(".env")
    mineru = HttpMineruClient(settings)
    print(f"MinerU: {settings.mineru_base_url}  backend={settings.mineru_backend}")
    print(f"输出目录：{output}")
    print(f"层级根目录：{source_root}")
    if ignored_word:
        print(f"提示：忽略 Word 文件 {ignored_word} 个")
    converted = cached = failed = 0
    for index, pdf in enumerate(paths, start=1):
        relative = pdf.relative_to(source_root)
        print(f"[{index}/{len(paths)}] {relative}", end=" … ", flush=True)
        try:
            status, markdown = convert_pdf(
                pdf, output, mineru, source_root,
                markdown_relative_path=relative,
                force=args.force,
            )
            if status == "converted":
                converted += 1
                print(f"已转换 → {markdown.name}")
            else:
                cached += 1
                print(f"已缓存 → {markdown.name}")
        except Exception as exc:
            failed += 1
            print(f"失败：{type(exc).__name__}: {exc}")
    print(f"完成：新转换 {converted}，缓存命中 {cached}，失败 {failed}")
    print(f"映射清单：{output / 'manifest.json'}")
    return 2 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
