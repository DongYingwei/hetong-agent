/**
 * vector_search —— 只读语义检索工具（两阶段 + 双形态，ADR-0003 / 坑4）。
 *
 * 两阶段：query → embed(2560维) → Milvus 召回 top_k=50（+可选标量过滤，混合检索）
 *         → reranker 精排 top_n≤8。
 *
 * 双形态（单工具，不拆二，坑4）——由 `mode` 决定输出：
 *   · mode="fragments"（默认，RAG）：返回精排后的片段原文 + 四字段 metadata，供 T08 带出处生成。
 *   · mode="ids"（语义路由）：返回去重 contract_ids，供 sql_query 联动二次统计（兼容 S1）。
 *
 * 端点/客户端封在 vectorClients（env 读），依赖注入 → 单测用 fake，不打真服务。
 */

import {
  Embedder, Recaller, Reranker, RecallFilter, Fragment,
  QwenEmbedder, MilvusRecaller, QwenReranker,
} from "./vectorClients.js";

const DEFAULT_TOP_K = 50; // 召回
const DEFAULT_TOP_N = 8;  // 精排

export interface TwoStageDeps {
  embedder: Embedder;
  recaller: Recaller;
  reranker: Reranker;
}

/** 两阶段检索核心：召回 top_k → 精排 top_n。返回带 score 的片段（降序）。 */
export async function twoStageSearch(
  query: string,
  deps: TwoStageDeps,
  opts: { topK?: number; topN?: number; filter?: RecallFilter } = {},
): Promise<Fragment[]> {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const topN = opts.topN ?? DEFAULT_TOP_N;

  const vector = await deps.embedder.embed(query);
  const recalled = await deps.recaller.recall(vector, topK, opts.filter);
  if (recalled.length === 0) return [];

  const ranked = await deps.reranker.rerank(query, recalled.map((f) => f.content), topN);
  // 按 rerank 结果重排，附分数，截断 top_n。
  return ranked
    .slice(0, topN)
    .map(({ index, score }) => ({ ...recalled[index], score }))
    .filter((f) => f.contract_id !== undefined);
}

/** 片段列表 → 去重 contract_ids（保序：按精排相关性先后）。 */
export function toContractIds(fragments: Fragment[]): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const f of fragments) {
    if (!seen.has(f.contract_id)) {
      seen.add(f.contract_id);
      ids.push(f.contract_id);
    }
  }
  return ids;
}

interface VectorSearchParams {
  /** 语义查询文本。 */
  query: string;
  /** 输出形态：fragments=片段原文+出处（RAG，默认）；ids=去重 contract_ids（联动 sql_query）。 */
  mode?: "fragments" | "ids";
  /** 混合检索标量过滤：锁定单合同 / 限定模块字段 / 限定 AI 大方向。 */
  filter?: RecallFilter;
  /** 召回条数，默认 50。 */
  top_k?: number;
  /** 精排条数，默认 8。 */
  top_n?: number;
}

/** 生产装配：真实 env 客户端。测试直接调 twoStageSearch(注入 fake)，不走这里。 */
function defaultDeps(): TwoStageDeps {
  return { embedder: new QwenEmbedder(), recaller: new MilvusRecaller(), reranker: new QwenReranker() };
}

export function makeVectorSearchTool(deps?: TwoStageDeps) {
  // 惰性装配：不在 import/构造期建真实 Milvus 连接（避免副作用）；execute 首次用到才建。
  let resolved: TwoStageDeps | undefined = deps;
  const getDeps = () => (resolved ??= defaultDeps());
  return {
    name: "vector_search",
    description:
      "对合同分段原文做语义检索（两阶段：召回 50 → 精排 8）。用于标签命中不了的模糊提问" +
      "（“类似/相似/相关”）或需要合同原文片段的问题。mode=fragments 返回片段原文+出处供带出处作答；" +
      "mode=ids 返回去重 contract_ids 供 sql_query 二次统计。filter 可锁定单合同(contract_id)或模块(field)。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "语义查询文本" },
        mode: {
          type: "string",
          enum: ["fragments", "ids"],
          description: "fragments=片段原文+出处（RAG，默认）；ids=去重 contract_ids（联动统计）",
        },
        filter: {
          type: "object",
          properties: {
            contract_id: { type: "number", description: "锁定单合同" },
            field: { type: "string", description: "限定来源字段/模块（如 service）" },
            module_category: { type: "string", description: "限定 AI 大方向" },
          },
          additionalProperties: false,
        },
        top_k: { type: "number", description: "召回条数，默认 50" },
        top_n: { type: "number", description: "精排条数，默认 8" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async (_toolCallId: string, params: VectorSearchParams) => {
      try {
        const fragments = await twoStageSearch(params.query, getDeps(), {
          topK: params.top_k,
          topN: params.top_n,
          filter: params.filter,
        });
        const mode = params.mode ?? "fragments";
        const result =
          mode === "ids"
            ? { query: params.query, mode, contract_ids: toContractIds(fragments) }
            : { query: params.query, mode, fragments };
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
        };
      } catch (e) {
        const message = (e as Error).message;
        // 端点不可达等 → 如实回灌，Agent 说检索失败，不编造片段。
        return {
          content: [{ type: "text", text: `语义检索失败：${message}` }],
          details: { error: "vector_search_error", message },
        };
      }
    },
  };
}

export default makeVectorSearchTool();
