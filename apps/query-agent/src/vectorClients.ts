/**
 * 向量检索的三个外部客户端 —— embedding / Milvus 召回 / reranker 精排。
 *
 * 端点契约（2026-08-12 真调确认，与解析侧 vector.py 同源）：
 *   · embedding: http://192.168.121.33:8008/v1/embeddings（vLLM OpenAI 兼容），
 *                Qwen3-Embedding-4B，2560 维。
 *   · Milvus:    localhost:19530（standalone v2.4.5），collection contract_chunks
 *                （vector 2560 COSINE + metadata 四字段 + content），由 T04 建好，只读消费。
 *   · reranker:  http://192.168.121.33:8012/v1/rerank（vLLM），Qwen3-Reranker-4B。
 *
 * 设计：每个客户端是小接口后的深模块，端点从 env 读；依赖注入 → 单测用 fake，不打真服务
 * （对齐解析侧 §S3 Testing Decisions）。对 CoreMind 只暴露 read（契合 network:deny）。
 */

import OpenAI from "openai";
import { MilvusClient } from "@zilliz/milvus2-sdk-node";

export const COLLECTION = "contract_chunks";
export const EMBED_DIM = 2560;

/** 召回/精排的片段（Milvus 命中行 + rerank 分数）。 */
export interface Fragment {
  contract_id: number;
  contract_no: string;
  field: string;
  module_category: string;
  content: string;
  score?: number; // rerank 相关性分（精排后填）
}

// ─────────────────────────────────────────────
// ① embedding 客户端（OpenAI 兼容 vLLM）
// ─────────────────────────────────────────────
export interface Embedder {
  embed(text: string): Promise<number[]>;
}

export class QwenEmbedder implements Embedder {
  private client: OpenAI;
  private model: string;
  constructor(baseUrl = process.env.EMBED_BASE_URL ?? "http://192.168.121.33:8008",
              model = process.env.EMBED_MODEL ?? "Qwen3-Embedding-4B") {
    this.client = new OpenAI({ baseURL: baseUrl + "/v1", apiKey: "not-needed" });
    this.model = model;
  }
  async embed(text: string): Promise<number[]> {
    const resp = await this.client.embeddings.create({ model: this.model, input: text });
    return resp.data[0].embedding as number[];
  }
}

// ─────────────────────────────────────────────
// ② Milvus 召回客户端（标量过滤 + 向量相似，混合检索）
// ─────────────────────────────────────────────
/** 标量过滤：锁定单合同 / 限定模块字段等（混合检索先缩小再向量）。 */
export interface RecallFilter {
  contract_id?: number;
  field?: string;
  module_category?: string;
}

export interface Recaller {
  recall(vector: number[], topK: number, filter?: RecallFilter): Promise<Fragment[]>;
}

export class MilvusRecaller implements Recaller {
  private client: MilvusClient;
  constructor(uri = process.env.MILVUS_URI ?? "http://localhost:19530") {
    this.client = new MilvusClient({ address: uri });
  }

  /** 把 RecallFilter 编成 Milvus 布尔表达式（只用已建标量索引的字段）。 */
  private buildExpr(filter?: RecallFilter): string | undefined {
    if (!filter) return undefined;
    const parts: string[] = [];
    if (filter.contract_id !== undefined) parts.push(`contract_id == ${filter.contract_id}`);
    if (filter.field !== undefined) parts.push(`field == "${filter.field}"`);
    if (filter.module_category !== undefined)
      parts.push(`module_category == "${filter.module_category}"`);
    return parts.length ? parts.join(" and ") : undefined;
  }

  async recall(vector: number[], topK: number, filter?: RecallFilter): Promise<Fragment[]> {
    const res = await this.client.search({
      collection_name: COLLECTION,
      data: [vector],
      limit: topK,
      filter: this.buildExpr(filter),
      output_fields: ["contract_id", "contract_no", "field", "module_category", "content"],
      metric_type: "COSINE",
    });
    return (res.results ?? []).map((r: Record<string, unknown>) => ({
      contract_id: Number(r.contract_id),
      contract_no: String(r.contract_no),
      field: String(r.field),
      module_category: String(r.module_category ?? ""),
      content: String(r.content),
    }));
  }
}

// ─────────────────────────────────────────────
// ③ reranker 客户端（vLLM /v1/rerank）
// ─────────────────────────────────────────────
export interface Reranker {
  /** 返回按相关性降序的下标 + 分数（不改传入顺序，只给排序结果）。 */
  rerank(query: string, docs: string[], topN: number): Promise<{ index: number; score: number }[]>;
}

export class QwenReranker implements Reranker {
  private url: string;
  private model: string;
  constructor(baseUrl = process.env.RERANK_BASE_URL ?? "http://192.168.121.33:8012",
              model = process.env.RERANK_MODEL ?? "Qwen3-Reranker-4B") {
    this.url = baseUrl + "/v1/rerank";
    this.model = model;
  }
  async rerank(query: string, docs: string[], topN: number) {
    const resp = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, query, documents: docs, top_n: topN }),
    });
    if (!resp.ok) throw new Error(`reranker HTTP ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as { results: { index: number; relevance_score: number }[] };
    return data.results.map((r) => ({ index: r.index, score: r.relevance_score }));
  }
}
