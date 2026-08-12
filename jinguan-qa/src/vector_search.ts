/**
 * vector_search —— 只读语义检索工具。
 *
 * 职责：当提问无法用已知标签命中、需要语义模糊匹配时（如“找和智能巡检类似的合同”），
 * 用查询文本在向量库做相似度检索 + metadata 过滤，返回命中的 contract_ids。
 *
 * 联动契约：本工具【只返回 id 列表】，不做统计。Agent 拿到 contract_ids 后，
 * 再调用 sql_query 传入这些 id 做求和/计数。这样职责单一、便于评测。
 *
 * ⚠️ effect 声明为 read：向量库连接细节封在工具内部（endpoint/key 从 env 读），
 * 对 CoreMind 只暴露只读语义。
 */

interface VectorSearchParams {
  /** 语义查询文本，例：智能巡检 / 类似运维服务 */
  query: string;
  /** 可选：先用 metadata 缩小范围，再做相似度（混合检索） */
  filters?: {
    industry?: string;
    contract_type?: string;
    tag_ai?: 0 | 1;
  };
  /** 返回条数上限，默认 50 */
  top_k?: number;
}

interface VectorHit {
  contract_id: number;
  score: number;
}

interface VectorResult {
  query: string;
  contract_ids: number[]; // 供 sql_query 二次统计
  hits: VectorHit[]; // 带分数，便于 Agent/评测判断相关性
}

export default {
  name: "vector_search",
  description:
    "对合同分段原文做语义相似度检索，用于标签命中不了的模糊提问（如“类似/相关/相似”）。" +
    "返回命中的 contract_ids 列表，供后续 sql_query 二次统计。可选 metadata 过滤缩小范围。",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "语义查询文本" },
      filters: {
        type: "object",
        properties: {
          industry: { type: "string" },
          contract_type: { type: "string" },
          tag_ai: { type: "number", enum: [0, 1] },
        },
        additionalProperties: false,
      },
      top_k: { type: "number", description: "返回条数上限，默认 50" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  execute: async (_toolCallId: string, params: VectorSearchParams) => {
    // ───────────────────────────────────────────────────────
    // TODO(你实现)：
    //   1. 对 params.query 生成 embedding（调你的 embedding 模型）；
    //   2. 在向量库做相似度检索 + params.filters 的 metadata 过滤；
    //   3. 取 top_k（默认 50），去重后收集 contract_id。
    //
    // 示例形态（替换成你的向量库客户端）：
    //   const vec = await embed(params.query);
    //   const hits = await vectorStore.search(vec, { filter: params.filters, topK: params.top_k ?? 50 });
    // ───────────────────────────────────────────────────────
    const hits: VectorHit[] = []; // TODO
    const result: VectorResult = {
      query: params.query,
      contract_ids: [...new Set(hits.map((h) => h.contract_id))],
      hits,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: result,
    };
  },
};
