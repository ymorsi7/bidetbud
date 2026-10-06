#!/usr/bin/env python3
"""OCR unique Happy Bidet / San Bidet screenshots into .tmp-ocr/texts.json."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path("/Users/yusufmorsi/Documents/GitHub/bidetbeacon")
ASSETS = Path(
    "/Users/yusufmorsi/.cursor/projects/Users-yusufmorsi-Documents-GitHub-bidetbeacon/assets"
)
OUT = ROOT / ".tmp-ocr"
WORKERS = 5


def md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def unique_images() -> list[Path]:
    seen: dict[str, Path] = {}
    if not ASSETS.exists():
        raise SystemExit(f"missing assets dir {ASSETS}")
    for p in sorted(ASSETS.iterdir()):
        if p.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        digest = md5(p)
        if digest not in seen:
            seen[digest] = p
    return list(seen.values())


def ocr_one(src: Path, dest_jpg: Path) -> tuple[str, str]:
    dest_jpg.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "sips",
            "-s",
            "format",
            "jpeg",
            "-Z",
            "2000",
            str(src),
            "--out",
            str(dest_jpg),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    txt_base = dest_jpg.with_suffix("")
    subprocess.run(
        [
            "tesseract",
            dest_jpg.name,
            txt_base.name,
            "-l",
            "eng",
            "--psm",
            "6",
        ],
        cwd=str(dest_jpg.parent),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    txt_path = dest_jpg.with_suffix(".txt")
    text = txt_path.read_text(encoding="utf-8", errors="replace") if txt_path.exists() else ""
    return src.name, text


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    images = unique_images()
    print(f"unique images: {len(images)}", flush=True)
    results: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = []
        for i, src in enumerate(images):
            dest = OUT / f"{i:03d}.jpg"
            futs.append(pool.submit(ocr_one, src, dest))
        done = 0
        for fut in as_completed(futs):
            name, text = fut.result()
            results[name] = text
            done += 1
            if done % 20 == 0 or done == len(images):
                print(f"ocr {done}/{len(images)}", flush=True)
    (OUT / "texts.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    nonempty = sum(1 for t in results.values() if t.strip())
    print(f"wrote {OUT / 'texts.json'} nonempty={nonempty}/{len(results)}")


if __name__ == "__main__":
    sys.exit(main())
