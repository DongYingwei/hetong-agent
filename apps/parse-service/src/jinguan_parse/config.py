"""解析侧配置 —— 从 .env 读端点（pydantic-settings，评测确认复用开源）。

端点封在此、从 env 读（S2/S3 决策）。真实值在 apps/parse-service/.env（被 .gitignore 挡住）。
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # MinerU
    mineru_base_url: str = "http://192.168.121.33:8000"
    mineru_parse_path: str = "/file_parse"
    mineru_backend: str = "vlm-http-client"
    mineru_server_url: str = ""  # vlm-http-client/hybrid-http-client 需要的 openai 兼容 VLM 服务地址
    mineru_timeout_s: int = 300

    # 云端 DeepSeek 兜底（OpenAI 兼容）。本地主模型抽取失败或关键字段不足时才调用。
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-v4-flash"
    llm_api_key: str = ""
    # 单次结构化抽取的网络/模型响应上限；超时应明确失败，不能无限占用上传任务。
    llm_timeout_s: int = 180
    # 本地优先模型：同一份真实合同基准中，27B 比原 30B 抽取出更多关键字段。
    llm_primary_base_url: str = "http://192.168.121.32:6013/v1"
    llm_primary_model: str = "Qwen3.8-27B"
    llm_primary_api_key: str = "EMPTY"

    # 向量端点（T04/T07 用）
    embed_base_url: str = "http://192.168.121.33:8008"
    embed_model: str = "Qwen3-Embedding-4B"
    rerank_base_url: str = "http://192.168.121.33:8012"
    rerank_model: str = "Qwen3-Reranker-8B"

    milvus_uri: str = "http://localhost:19530"
    pg_url: str = "postgresql://postgres:pw@localhost:5432/contracts"

    # 原始合同与 Markdown 缓存必须是持久目录；生产环境应配置到挂载数据盘。
    pdf_root: str = str(_REPO_ROOT / "data" / "pdf")
    # 当前已入库合同的缓存目录为 data/md-file；部署时通过 MARKDOWN_ROOT 保持同一目录。
    markdown_root: str = str(_REPO_ROOT / "data" / "md-file")

    # AI 业绩关键词台账（§6.2 词表来源）。sheet「AI业绩关键词」：A=大方向 B=具体技术。
    ledger_xlsx: str = "demo/合同台账-V2.xlsx"
    keyword_sheet: str = "AI业绩关键词"


def load_settings(env_file: str | None = None) -> Settings:
    """加载配置。测试可传入独立 env_file 或直接构造 Settings(**overrides)。"""
    if env_file is not None:
        return Settings(_env_file=env_file)  # type: ignore[call-arg]
    return Settings()
