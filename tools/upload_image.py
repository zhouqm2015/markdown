#!/usr/bin/env python3
"""Upload image (local path or URL) to ImgBB and print URL.

Usage:
  python3 upload_image.py <image_path_or_url>

Auth:
  Requires IMGBB_API_KEY environment variable.

  The script auto-loads .env files (KEY=VALUE format) from these locations,
  in order. The first match wins, existing env vars are not overwritten:
  1. Current working directory: ./.env
  2. Skill root: [SKILL_DIR]/.env (one level up from this script)
  3. User home: ~/.env
  4. Project tools sibling: ../.env from this file when under tools/

  Get a free key at https://api.imgbb.com (registration required).

Fallback:
  If IMGBB_API_KEY is missing, try anonymous Catbox upload (HTTPS URL).

Output:
  Final image URL printed to stdout. Errors to stderr with exit code 1.
"""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def _load_dotenv_if_present() -> None:
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[1] / ".env",
        Path(__file__).resolve().parent.parent / ".env",
        Path.home() / ".env",
    ]
    for env_path in candidates:
        if not env_path.exists():
            continue
        try:
            for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        except Exception:
            continue


def _is_url(s: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(s)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    except Exception:
        return False


def _read_bytes_from_url(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "huashu-image-upload/upload_image.py"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def _read_bytes_from_file(path: str) -> bytes:
    p = Path(path).expanduser().resolve()
    if not p.exists() or not p.is_file():
        raise FileNotFoundError(f"File not found: {p}")
    return p.read_bytes()


def upload_to_imgbb(image_bytes: bytes, api_key: str) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    form_data = urllib.parse.urlencode({"key": api_key, "image": encoded}).encode("ascii")
    req = urllib.request.Request(
        "https://api.imgbb.com/1/upload",
        data=form_data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")
            payload = json.loads(body)
            msg = (payload.get("error") or {}).get("message") or f"HTTP {e.code}"
        except Exception:
            msg = f"HTTP {e.code}"
        raise RuntimeError(f"ImgBB upload failed: {msg}") from e

    payload = json.loads(body)
    if not payload.get("success"):
        msg = (payload.get("error") or {}).get("message") or f"HTTP {status}"
        raise RuntimeError(f"ImgBB upload failed: {msg}")
    data = payload.get("data") or {}
    url = data.get("url") or data.get("display_url")
    if not url:
        raise RuntimeError("ImgBB upload failed: missing url in response")
    return url


def _multipart(fields: dict[str, str], files: dict[str, tuple[str, bytes, str]]) -> tuple[bytes, str]:
    boundary = "----HuashuUploadBoundary7MA4YWxkTrZu0gW"
    lines: list[bytes] = []
    for name, value in fields.items():
        lines.append(f"--{boundary}".encode())
        lines.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        lines.append(b"")
        lines.append(value.encode())
    for name, (filename, content, ctype) in files.items():
        lines.append(f"--{boundary}".encode())
        lines.append(
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode()
        )
        lines.append(f"Content-Type: {ctype}".encode())
        lines.append(b"")
        lines.append(content)
    lines.append(f"--{boundary}--".encode())
    lines.append(b"")
    body = b"\r\n".join(lines)
    return body, f"multipart/form-data; boundary={boundary}"


def upload_to_catbox(image_bytes: bytes, filename: str = "image.png") -> str:
    ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    body, content_type = _multipart(
        {"reqtype": "fileupload"},
        {"fileToUpload": (filename, image_bytes, ctype)},
    )
    req = urllib.request.Request(
        "https://catbox.moe/user/api.php",
        data=body,
        method="POST",
        headers={
            "Content-Type": content_type,
            "User-Agent": "huashu-image-upload/upload_image.py",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        url = resp.read().decode("utf-8").strip()
    if not url.startswith("http"):
        raise RuntimeError(f"Catbox upload failed: {url[:200]}")
    return url


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] in {"-h", "--help"}:
        print(__doc__.strip())
        return 0

    _load_dotenv_if_present()
    source = sys.argv[1]
    try:
        if _is_url(source):
            image_bytes = _read_bytes_from_url(source)
            filename = Path(urllib.parse.urlparse(source).path).name or "image.png"
        else:
            image_bytes = _read_bytes_from_file(source)
            filename = Path(source).name

        api_key = os.getenv("IMGBB_API_KEY")
        if api_key:
            print(upload_to_imgbb(image_bytes, api_key))
        else:
            print(
                "Warning: IMGBB_API_KEY missing, fallback to Catbox",
                file=sys.stderr,
            )
            print(upload_to_catbox(image_bytes, filename))
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
