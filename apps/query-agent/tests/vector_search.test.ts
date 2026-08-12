/**
 * T07 —— vector_search 两阶段 + 双形态单测（fake embed/recall/rerank，无需真服务）。
 *
 * 验收（工单 §验收标准）：
 *   · 语义提问 → embed → 召回 topK → rerank topN≤8，每片带四字段 metadata
 *   · 双形态：fragments（片段+出处）/ ids（去重 contract_ids 供联动）
 *   · 混合检索：filter 被正确下传给召回（缩小范围）
 *   · 端点失败 → 工具如实回灌，不编造片段
 */

import { describe, it, expect, vi } from "vitest";
import type { Embedder, Recaller, Reranker, Fragment, RecallFilter } from "../src/vectorClients.js";
import { twoStageSearch, toContractIds, makeVectorSearchTool } from "../src/vector_search.js";

function frag(id: number, no: string, field: string, content: string, cat = ""): Fragment {
  return { contract_id: id, contract_no: no, field, module_category: cat, content };
}

class FakeEmbedder implements Embedder {
  calls: string[] = [];
  async embed(text: string) { this.calls.push(text); return new Array(2560).fill(0.1); }
}

class FakeRecaller implements Recaller {
  lastTopK = 0;
  lastFilter?: RecallFilter;
  constructor(private rows: Fragment[]) {}
  async recall(_v: number[], topK: number, filter?: RecallFilter) {
    this.lastTopK = topK; this.lastFilter = filter;
    return this.rows;
  }
}

// 精排 fake：把命中按 content 长度降序（确定性），返回 index+score。
class FakeReranker implements Reranker {
  async rerank(_q: string, docs: string[], topN: number) {
    return docs
      .map((d, index) => ({ index, score: d.length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }
}

const ROWS = [
  frag(101, "HT-1", "service", "短", "智能巡检"),
  frag(101, "HT-1", "settlement_terms", "中等长度内容"),
  frag(202, "HT-2", "service", "这是一段最长的服务内容原文文本"),
];

describe("twoStageSearch —— 召回 → 精排", () => {
  it("embed 一次 → 召回默认 topK=50 → 精排默认 topN=8，按相关性降序", async () => {
    const emb = new FakeEmbedder();
    const rec = new FakeRecaller(ROWS);
    const frags = await twoStageSearch("智能巡检", { embedder: emb, recaller: rec, reranker: new FakeReranker() });
    expect(emb.calls).toEqual(["智能巡检"]);
    expect(rec.lastTopK).toBe(50);
    // 最长内容(202)排第一，带 score
    expect(frags[0].contract_id).toBe(202);
    expect(frags[0].score).toBeGreaterThan(0);
    // 每片带四字段 metadata
    expect(Object.keys(frags[0])).toEqual(
      expect.arrayContaining(["contract_id", "contract_no", "field", "module_category", "content"]),
    );
  });

  it("top_n 截断到 ≤8（这里传 2）", async () => {
    const frags = await twoStageSearch("x",
      { embedder: new FakeEmbedder(), recaller: new FakeRecaller(ROWS), reranker: new FakeReranker() },
      { topN: 2 });
    expect(frags.length).toBe(2);
  });

  it("混合检索：filter 被下传给召回（缩小范围）", async () => {
    const rec = new FakeRecaller([ROWS[0]]);
    await twoStageSearch("x",
      { embedder: new FakeEmbedder(), recaller: rec, reranker: new FakeReranker() },
      { filter: { contract_id: 101, field: "service" }, topK: 20 });
    expect(rec.lastTopK).toBe(20);
    expect(rec.lastFilter).toEqual({ contract_id: 101, field: "service" });
  });

  it("召回为空 → 直接返回空，不调 rerank", async () => {
    const rerankSpy = { rerank: vi.fn() };
    const frags = await twoStageSearch("x",
      { embedder: new FakeEmbedder(), recaller: new FakeRecaller([]), reranker: rerankSpy as unknown as Reranker });
    expect(frags).toEqual([]);
    expect(rerankSpy.rerank).not.toHaveBeenCalled();
  });
});

describe("toContractIds —— 去重保序", () => {
  it("按相关性先后去重 contract_id", () => {
    const ids = toContractIds([frag(202, "HT-2", "service", "a"), frag(101, "HT-1", "service", "b"), frag(202, "HT-2", "x", "c")]);
    expect(ids).toEqual([202, 101]);
  });
});

describe("vector_search 工具 —— 双形态", () => {
  const deps = { embedder: new FakeEmbedder(), recaller: new FakeRecaller(ROWS), reranker: new FakeReranker() };

  it("mode=fragments（默认）返回片段原文+出处", async () => {
    const tool = makeVectorSearchTool(deps);
    const r = await tool.execute("t", { query: "智能巡检" });
    const d = r.details as any;
    expect(d.mode).toBe("fragments");
    expect(d.fragments[0].content).toBeTruthy();
    expect(d.fragments[0].contract_no).toBeTruthy();
  });

  it("mode=ids 返回去重 contract_ids（联动 sql_query）", async () => {
    const tool = makeVectorSearchTool(deps);
    const r = await tool.execute("t", { query: "智能巡检", mode: "ids" });
    const d = r.details as any;
    expect(d.mode).toBe("ids");
    expect(d.contract_ids).toEqual([202, 101]); // 最长(202)排前
    expect(d.fragments).toBeUndefined();
  });

  it("端点失败 → 如实回灌，不编造片段", async () => {
    const boom: Recaller = { async recall() { throw new Error("Milvus unreachable"); } };
    const tool = makeVectorSearchTool({ embedder: new FakeEmbedder(), recaller: boom, reranker: new FakeReranker() });
    const r = await tool.execute("t", { query: "x" });
    const d = r.details as any;
    expect(d.error).toBe("vector_search_error");
    expect(r.content[0].text).toContain("语义检索失败");
  });
});
