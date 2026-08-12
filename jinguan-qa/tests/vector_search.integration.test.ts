/**
 * T07 集成 —— 真 embedding(.33:8008) + 真 reranker(.33:8012) + 真 Milvus(localhost:19530)。
 *
 * 端点/服务任一不可达则整组跳过（对齐解析侧集成测试风格）。
 * 用独立临时 collection 灌几条真向量，跑 twoStageSearch，断言 top_n 片段结构 + 混合过滤，
 * 收尾 drop 临时 collection，不污染正式 contract_chunks。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MilvusClient, DataType } from "@zilliz/milvus2-sdk-node";
import { QwenEmbedder, QwenReranker, MilvusRecaller, EMBED_DIM, type Recaller, type RecallFilter, type Fragment } from "../src/vectorClients.js";
import { twoStageSearch } from "../src/vector_search.js";

const EMBED_URL = process.env.EMBED_BASE_URL ?? "http://192.168.121.33:8008";
const RERANK_URL = process.env.RERANK_BASE_URL ?? "http://192.168.121.33:8012";
const MILVUS_URI = process.env.MILVUS_URI ?? "http://localhost:19530";
const TEST_COLLECTION = "test_contract_chunks_t07";

async function up(url: string): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 4000);
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

let ready = false;
let client: MilvusClient;

/** 直连临时 collection 的召回器（复用 MilvusRecaller 逻辑，仅换 collection 名）。 */
class TempRecaller implements Recaller {
  constructor(private c: MilvusClient) {}
  private expr(f?: RecallFilter) {
    if (!f) return undefined;
    const p: string[] = [];
    if (f.contract_id !== undefined) p.push(`contract_id == ${f.contract_id}`);
    if (f.field !== undefined) p.push(`field == "${f.field}"`);
    return p.length ? p.join(" and ") : undefined;
  }
  async recall(vector: number[], topK: number, filter?: RecallFilter): Promise<Fragment[]> {
    const res = await this.c.search({
      collection_name: TEST_COLLECTION, data: [vector], limit: topK,
      filter: this.expr(filter),
      output_fields: ["contract_id", "contract_no", "field", "module_category", "content"],
      metric_type: "COSINE",
    });
    return (res.results ?? []).map((r: Record<string, unknown>) => ({
      contract_id: Number(r.contract_id), contract_no: String(r.contract_no),
      field: String(r.field), module_category: String(r.module_category ?? ""), content: String(r.content),
    }));
  }
}

beforeAll(async () => {
  const [e, rk] = await Promise.all([up(EMBED_URL + "/v1/models"), up(RERANK_URL + "/v1/models")]);
  let mv = false;
  try { client = new MilvusClient({ address: MILVUS_URI }); await client.listCollections(); mv = true; } catch { mv = false; }
  ready = e && rk && mv;
  if (!ready) return;

  if ((await client.hasCollection({ collection_name: TEST_COLLECTION })).value) {
    await client.dropCollection({ collection_name: TEST_COLLECTION });
  }
  await client.createCollection({
    collection_name: TEST_COLLECTION,
    fields: [
      { name: "id", data_type: DataType.Int64, is_primary_key: true, autoID: true },
      { name: "vector", data_type: DataType.FloatVector, dim: EMBED_DIM },
      { name: "contract_id", data_type: DataType.Int64 },
      { name: "contract_no", data_type: DataType.VarChar, max_length: 128 },
      { name: "field", data_type: DataType.VarChar, max_length: 128 },
      { name: "module_category", data_type: DataType.VarChar, max_length: 128 },
      { name: "content", data_type: DataType.VarChar, max_length: 65535 },
    ],
  });
  await client.createIndex({ collection_name: TEST_COLLECTION, field_name: "vector", index_type: "AUTOINDEX", metric_type: "COSINE" });
  await client.loadCollection({ collection_name: TEST_COLLECTION });

  const emb = new QwenEmbedder();
  const docs = [
    { contract_id: 101, contract_no: "HT-T07-1", field: "service", module_category: "智能巡检", content: "提供电力设备智能巡检与AIOps运维服务" },
    { contract_id: 202, contract_no: "HT-T07-2", field: "settlement_terms", module_category: "", content: "按季度结算，每季度末提交结算单" },
  ];
  const rows = [];
  for (const d of docs) rows.push({ ...d, vector: await emb.embed(d.content) });
  await client.insert({ collection_name: TEST_COLLECTION, data: rows });
  await client.flush({ collection_names: [TEST_COLLECTION] });

  // insert → searchable 有 ~1s 延迟：轮询到可召回再放行测试。
  const probe = await emb.embed("智能巡检");
  for (let i = 0; i < 15; i++) {
    const r = await client.search({ collection_name: TEST_COLLECTION, data: [probe], limit: 1, metric_type: "COSINE", output_fields: ["contract_id"] });
    if ((r.results ?? []).length > 0) break;
    await new Promise((s) => setTimeout(s, 1000));
  }
}, 60000);

afterAll(async () => {
  if (ready && client) {
    try { await client.dropCollection({ collection_name: TEST_COLLECTION }); } catch { /* noop */ }
  }
});

describe("T07 真集成 —— embed + Milvus + rerank 两阶段", () => {
  it("语义提问「智能巡检」→ 相关片段(101)排在前，带四字段 metadata", async ({ skip }) => {
    if (!ready) return skip();
    const frags = await twoStageSearch("智能巡检运维", {
      embedder: new QwenEmbedder(), recaller: new TempRecaller(client), reranker: new QwenReranker(),
    }, { topK: 10, topN: 8 });
    expect(frags.length).toBeGreaterThan(0);
    expect(frags.length).toBeLessThanOrEqual(8);
    expect(frags[0].contract_id).toBe(101); // 巡检相关片段最相关
    for (const key of ["contract_id", "contract_no", "field", "module_category", "content"]) {
      expect(frags[0]).toHaveProperty(key);
    }
  }, 60000);

  it("混合检索：filter contract_id=202 只召回该合同片段", async ({ skip }) => {
    if (!ready) return skip();
    const frags = await twoStageSearch("结算", {
      embedder: new QwenEmbedder(), recaller: new TempRecaller(client), reranker: new QwenReranker(),
    }, { topK: 10, topN: 8, filter: { contract_id: 202 } });
    expect(frags.length).toBeGreaterThan(0);
    expect(frags.every((f) => f.contract_id === 202)).toBe(true);
  }, 60000);
});
