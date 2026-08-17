"""epms-sync 配置 —— 从 apps/epms-sync/.env 读（python-dotenv）。

真实值在 .env（已被 .gitignore 挡住）；本模块提供带默认值的 Config。
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()  # 默认加载 cwd 下的 .env；cron 下用 `cd apps/epms-sync` 保证
except ImportError:  # 未装 python-dotenv 时退化为仅环境变量
    pass

_APP_DIR = Path(__file__).resolve().parents[2]  # apps/epms-sync
_REPO_DATA = _APP_DIR.parents[1] / "data"  # hetong-agent/data


@dataclass(frozen=True)
class Config:
    # EPMS 登录
    epms_base_url: str = os.getenv("EPMS_BASE_URL", "http://47.99.86.222:8995").rstrip("/")
    epms_username: str = os.getenv("EPMS_USERNAME", "")
    epms_password: str = os.getenv("EPMS_PASSWORD", "")
    epms_login_post_url: str = os.getenv("EPMS_LOGIN_POST_URL", "/saas/userLoginCtrl/authLogin.do")
    epms_login_preset: str = os.getenv("EPMS_LOGIN_PRESET", "auth_login2")
    epms_login_warm_url: str = os.getenv("EPMS_LOGIN_WARM_URL", "/saas/")

    # MinerU（图片解析）
    mineru_base_url: str = os.getenv("MINERU_BASE_URL", "http://192.168.121.33:8000").rstrip("/")

    # 关键词词表数据库（contracts 库，ai_keywords/ai_keyword_terms）
    pg_url: str = os.getenv("PG_URL", "")

    # 数据目录与状态
    attach_dir: Path = Path(os.getenv("ATTACH_DIR", str(_REPO_DATA / "EPMS")))
    md_dir: Path = Path(os.getenv("MD_DIR", str(_REPO_DATA / "md-epms")))
    state_path: Path = Path(os.getenv("STATE_PATH", str(_REPO_DATA / "epms-sync-state.json")))

    # 增量起始日期：已统计到 2026-08-15，从其后（08-16）开始
    initial_start_time: str = os.getenv("EPMS_INITIAL_START_TIME", "2026-08-16")


def load_config() -> Config:
    return Config()
