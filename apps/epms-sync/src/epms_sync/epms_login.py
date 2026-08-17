"""EPMS 登录 —— 用账号密码换取 Cookie，带 TTL 缓存（移植自 epms_process/epms_password_login）。"""

from __future__ import annotations

import sys
import threading
import time
from urllib.parse import urljoin

import requests

from .config import Config

# 与浏览器表单一致的固定键（authLogin.do）
_FORM_PRESETS: dict[str, dict[str, str]] = {
    "auth_login2": {
        "twoConfirm": "",
        "isTj": "undefined",
        "captcha": "",
        "yzm": "",
        "mobilePhone": "",
        "oneConfirm": "",
        "oneConfirm1": "",
    },
}

_cache_hdr: str | None = None
_cache_exp: float = 0.0
_lock = threading.Lock()


def normalize_cookie_header(cookie_hdr: str) -> str:
    """Cookie 头规范化：只保留第一个 JSESSIONID，其它同名取最后一次。"""
    chunks: list[tuple[str, str]] = []
    for part in cookie_hdr.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, _, val = part.partition("=")
        name = name.strip()
        if not name:
            continue
        chunks.append((name, f"{name}={val.strip()}"))

    jsession_first: str | None = None
    other_order: list[str] = []
    other_last: dict[str, str] = {}
    for name, full in chunks:
        if name.upper() == "JSESSIONID":
            if jsession_first is None:
                jsession_first = full
            continue
        if name not in other_last:
            other_order.append(name)
        other_last[name] = full

    out: list[str] = []
    if jsession_first:
        out.append(jsession_first)
    for n in other_order:
        out.append(other_last[n])
    return "; ".join(out)


def _abs_url(base: str, path_or_url: str) -> str:
    path_or_url = path_or_url.strip()
    if path_or_url.lower().startswith(("http://", "https://")):
        return path_or_url
    return urljoin(base.rstrip("/") + "/", path_or_url.lstrip("/"))


def _cookie_header_from_session(sess: requests.Session) -> str:
    return "; ".join(f"{c.name}={c.value}" for c in sess.cookies)


def _try_login(cfg: Config) -> str | None:
    if not (cfg.epms_username and cfg.epms_password):
        return None

    sess = requests.Session()
    sess.trust_env = False

    # warm GET 拿首包会话
    try:
        warm_url = _abs_url(cfg.epms_base_url, cfg.epms_login_warm_url)
        sess.get(warm_url, timeout=(15, 30), allow_redirects=True)
    except requests.RequestException as e:
        print(f"[epms-sync] warm GET failed: {e}", file=sys.stderr)

    payload: dict[str, str] = dict(_FORM_PRESETS.get(cfg.epms_login_preset, {}))
    payload["username"] = cfg.epms_username
    payload["password"] = cfg.epms_password

    login_url = _abs_url(cfg.epms_base_url, cfg.epms_login_post_url)
    try:
        r = sess.post(
            login_url,
            data=payload,
            timeout=(15, 60),
            allow_redirects=True,
            headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
        )
    except requests.RequestException as e:
        print(f"[epms-sync] POST login failed: {e}", file=sys.stderr)
        return None

    if r.status_code >= 400:
        snippet = (r.text or "")[:300].replace("\n", " ")
        print(f"[epms-sync] login HTTP {r.status_code} body={snippet!r}", file=sys.stderr)
        return None

    hdr = _cookie_header_from_session(sess)
    # authLogin.do 把 X-Access-Token 写在 Set-Cookie 里，值需带引号
    if hdr and "X-Access-Token" not in hdr.upper():
        for c in sess.cookies:
            if c.name.lower() == "x-access-token" and c.value:
                v = c.value.strip()
                if not (v.startswith('"') and v.endswith('"')):
                    v = f'"{v}"'
                sep = "; " if hdr else ""
                hdr = f"{hdr}{sep}X-Access-Token={v}"

    if not hdr.strip():
        print("[epms-sync] login OK but no Cookie in session", file=sys.stderr)
        return None
    return normalize_cookie_header(hdr)


def get_cookie_header(cfg: Config, *, force: bool = False) -> str | None:
    """返回规范化 Cookie 头（带 TTL 缓存）。登录失败返回 None。"""
    global _cache_hdr, _cache_exp
    if not (cfg.epms_username and cfg.epms_password):
        return None

    now = time.time()
    with _lock:
        if not force and _cache_hdr and now < _cache_exp:
            return _cache_hdr
        hdr = _try_login(cfg)
        if hdr:
            _cache_hdr = hdr
            _cache_exp = now + 1800  # 30 分钟 TTL
        else:
            _cache_hdr = None
            _cache_exp = 0.0
        return _cache_hdr
