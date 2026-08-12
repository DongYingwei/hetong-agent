"""结构感知切分 —— T02 核心。

来源：合同解析模块-需求方案 §7.6.2（切分策略）、§7.6.3（片段 metadata 四字段）。

设计（codebase-design）：`process_one_contract` 是深模块——小接口后藏结构感知切分逻辑。
依赖【接受而非创建】：milvus_client / embed_client 由调用方注入（真实 or fake），
接缝就在函数签名，测试替换 fake 客户端，不 mock 内部。

本模块只负责【切分 + 组装 chunk + 调注入的客户端建向量】。真实 MinerU/qwen3/Milvus
的连接细节不在此处——那是 T03/T04 接真实客户端时的事。
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any, Protocol


# ─────────────────────────────────────────────────────────────
# 片段与 metadata（§7.6.3 四字段）
# ─────────────────────────────────────────────────────────────
@dataclass
class Chunk:
    """一段合同原文片段。metadata 四字段严格对齐 §7.6.3 与 contracts-db 的 contract_chunks 列名。"""

    contract_id: int          # §7.6.3 关联正式库合同
    contract_no: str          # §7.6.3 合同号，供出处标注
    field: str                # §7.6.3 来源字段/章节：模块段=module_key（service/tech/…），非模块段=字段/章节名（settlement_terms / 前言…）
    module_category: str | None  # §7.6.3 命中的 AI 大方向（若属四模块，否则 None）
    content: str              # 片段原文
    chunk_index: int = 0      # 同一 field 内顺序

    def metadata(self) -> dict[str, Any]:
        """写入 Milvus 时的 metadata 载荷——只含四字段（§7.6.3）。"""
        return {
            "contract_id": self.contract_id,
            "contract_no": self.contract_no,
            "field": self.field,
            "module_category": self.module_category,
        }


# ─────────────────────────────────────────────────────────────
# 注入依赖的接口（Protocol）——真实实现在 T04，测试用 fake
# ─────────────────────────────────────────────────────────────
class EmbedClient(Protocol):
    def embed(self, text: str) -> list[float]: ...


class MilvusClient(Protocol):
    def upsert(self, vector: list[float], metadata: dict[str, Any], content: str) -> None: ...


# ─────────────────────────────────────────────────────────────
# 模块是【配置驱动】的（原型「合同模块」页可新增）——不再硬编码固定四模块。
# 调用方传入当前启用的 module_key 集合（来自 contract_modules 配置表）；
# MinerU 段以 module_key 声明其模块归属（属四模块之一或 None）。
# 下面的默认集合只是【无配置时的兜底】，正式路径应显式传入配置。
# ─────────────────────────────────────────────────────────────
DEFAULT_MODULE_KEYS = frozenset({"service", "tech", "role", "staff"})

# 超长父块的二次切分阈值（字符）。§7.6.2「超长再按条款/段落二次切」。
# 定为 120：单条款级父块（如一句结算/仲裁条款）保持整块；多条款长模块段
# （服务内容/技术要求等常达数百字）触发按条款二次切并重叠。真实调参随评测数据（G4）。
MAX_PARENT_CHARS = 120
# 重叠句数（§7.6.2「重叠 1–2 句防条款被切断」）。
OVERLAP_SENTENCES = 1


def _split_sentences(text: str) -> list[str]:
    """按中文句末标点切句，保留标点。用于超长二次切与重叠。"""
    out: list[str] = []
    buf = ""
    for ch in text:
        buf += ch
        if ch in "。！？；":
            out.append(buf.strip())
            buf = ""
    if buf.strip():
        out.append(buf.strip())
    return out


def _split_long(text: str) -> list[str]:
    """超长父块 → 按句二次切，块间重叠 OVERLAP_SENTENCES 句。"""
    sents = _split_sentences(text)
    if len(text) <= MAX_PARENT_CHARS or len(sents) <= 1:
        return [text]

    pieces: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for s in sents:
        cur.append(s)
        cur_len += len(s)
        if cur_len >= MAX_PARENT_CHARS:
            pieces.append("".join(cur))
            # 重叠：保留末尾 OVERLAP_SENTENCES 句作为下一块开头
            cur = cur[-OVERLAP_SENTENCES:] if OVERLAP_SENTENCES else []
            cur_len = sum(len(x) for x in cur)
    if cur and (not pieces or "".join(cur) != pieces[-1]):
        pieces.append("".join(cur))
    return pieces


def build_chunks(
    mineru_json: dict[str, Any],
    module_keys: frozenset[str] | set[str] | None = None,
) -> list[Chunk]:
    """结构感知切分：MinerU 段 → 父块（按 field），超长二次切，模块段单独存。

    输入契约（MinerU 段的最小形态）：
        { "contract_id": int, "contract_no": str,
          "segments": [ { "field": str, "text": str,
                          "module_key": str | None,        # 属哪个配置模块（service/tech/…）；否则 None
                          "module_category": str | None }, ... ] }

    - `module_keys`：当前启用的模块标识集合（来自 contract_modules 配置）。省略时用兜底集合。
    - 模块段的 chunk.field 记为其 module_key（与 contract_modules / contract_chunks 对齐）；
      非模块段的 field 记为 seg["field"]（如 settlement_terms / 前言）。
    每个 segment 是一个"父块来源"。同 field 的多段按出现序 chunk_index 递增。
    """
    contract_id = mineru_json["contract_id"]
    contract_no = mineru_json["contract_no"]
    mod_keys = frozenset(module_keys) if module_keys is not None else DEFAULT_MODULE_KEYS

    chunks: list[Chunk] = []
    per_field_index: dict[str, int] = {}
    for seg in mineru_json.get("segments", []):
        mod_key = seg.get("module_key")
        # 模块段：field 取 module_key（须在启用集合内）；非模块段取原 field。
        if mod_key is not None and mod_key in mod_keys:
            fld = mod_key
        else:
            fld = seg["field"]
        mod_cat = seg.get("module_category")
        for piece in _split_long(seg["text"]):
            idx = per_field_index.get(fld, 0)
            chunks.append(
                Chunk(
                    contract_id=contract_id,
                    contract_no=contract_no,
                    field=fld,
                    module_category=mod_cat,
                    content=piece,
                    chunk_index=idx,
                )
            )
            per_field_index[fld] = idx + 1
    return chunks


def process_one_contract(
    mineru_json: dict[str, Any],
    milvus_client: MilvusClient,
    embed_client: EmbedClient,
    module_keys: frozenset[str] | set[str] | None = None,
) -> list[Chunk]:
    """T02 接缝：处理一份合同 → 切分片段并（经注入客户端）建向量。

    这是解析侧【唯一新增的测试接缝】（§S3 Testing Decisions）。真实客户端与模块配置在 T04 注入；
    测试注入 fake + 显式 module_keys，断言"切分正确 + metadata 四字段 + 模块段独立 + 建向量被调用"。

    `module_keys` 来自 contract_modules 配置（可新增模块）；省略用兜底集合。
    返回切分出的 chunk 列表（供 T04 落库 contract_chunks）。
    """
    chunks = build_chunks(mineru_json, module_keys=module_keys)
    for c in chunks:
        vec = embed_client.embed(c.content)
        milvus_client.upsert(vector=vec, metadata=c.metadata(), content=c.content)
    return chunks
