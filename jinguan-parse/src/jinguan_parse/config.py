"""解析侧配置 —— 从 .env 读端点（pydantic-settings，评测确认复用开源）。

端点封在此、从 env 读（S2/S3 决策）。真实值在 jinguan-parse/.env（被 .gitignore 挡住）。
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # MinerU
    mineru_base_url: str = "http://192.168.121.33:8000"
    mineru_parse_path: str = "/file_parse"
    mineru_backend: str = "vlm-http-client"
    mineru_server_url: str = ""  # vlm-http-client/hybrid-http-client 需要的 openai 兼容 VLM 服务地址
    mineru_timeout_s: int = 300

    # LLM（DeepSeek，OpenAI 兼容）
    llm_base_url: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-v4-flash"
    llm_api_key: str = ""

    # 向量端点（T04/T07 用）
    embed_base_url: str = "http://192.168.121.33:8008"
    embed_model: str = "Qwen3-Embedding-4B"
    rerank_base_url: str = "http://192.168.121.33:8012"
    rerank_model: str = "Qwen3-Reranker-4B"

    milvus_uri: str = "http://localhost:19530"
    pg_url: str = "postgresql://postgres:pw@localhost:5432/contracts"


def load_settings(env_file: str | None = None) -> Settings:
    """加载配置。测试可传入独立 env_file 或直接构造 Settings(**overrides)。"""
    if env_file is not None:
        return Settings(_env_file=env_file)  # type: ignore[call-arg]
    return Settings()
