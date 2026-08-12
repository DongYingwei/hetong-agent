# 04 — 草稿区→核对→正式库 + 片段持久化 + 建向量

**What to build:** 人工核对通过后：写入 `contracts`(confirmed=1，带 `_ai_raw` 留痕) + 持久化 MinerU 完整分段片段(四模块单独存) → qwen3-embedding → 写 Milvus；草稿区不建向量；批处理+HTTP API 双入口；文件指纹去重；失败标记不阻断整批；片段同步(标签更新只改 metadata，原文更新重建向量，按模块增量)。

**Blocked by:** T03(有草稿数据才能核对入正式库)

**Status:** ✅ done（四切片全完成；G5 已拍板 2026-08-12）· **HITL**

> **切片进度**：
> - ✅ **切片1 · 核对→正式库**（`confirm.py`）：草稿(confirmed=0) → 写 contracts(confirmed=1, confirmed_by/at + _ai_raw 搬运) + module_hits JSONB 展开成 contract_module_hits 行 + 支持人工 overrides + 删草稿防重复核对。真 PG 集成测试 4/4 绿。
> - ✅ **切片2 · 片段持久化 + 建向量**（`vector.py`）：Qwen3-Embedding(OpenAI 兼容 vLLM,**真调确认 2560 维**) + Milvus collection(pymilvus,metadata 四字段+COSINE) + markdown→切片(复用T02)→建向量。**真 Milvus(v2.4.5) + 真 embedding 集成测试通过**。草稿加 mineru_md 列存全文,核对后据此切片(仅正式库,坑9)。开源:openai+pymilvus(评测确认);**LlamaIndex 评估结论=切片2不用,留 T07/T08 候选**。
> - ✅ **切片3 · 片段同步**（`sync.py` + `vector.update_metadata_by_contract` + api `/sync`）：**G5 拍板=显式函数调用**（`sync_source_update`/`sync_label_update` + `/sync/{id}/source`、`/sync/{id}/labels` 端点，不引入事件/MQ）。**原文重传比 MD5**：同则 unchanged 跳过，异则更新正式库 md/md5 + `delete_by_contract` + 用新全文重切重建；**只改标签**：仅更新 Milvus metadata（contract_no/field/module_category），不重算 embedding。DDL `002` 给正式库加 `mineru_md`+`mineru_md5`（核对时从草稿搬运，`confirm.py` 已接）。fake 向量 + 真临时 PG 6/6 绿。
> - ✅ **切片4 · 批处理 + HTTP 入口 + 指纹去重**（`ingest.py` + `api.py`）：SHA-256 流式指纹去重、断点续跑、单份失败不阻断整批(§8)、FastAPI `/parse` 单份上传入口(共用 ingest_one 核心)。真 PG 6/6 绿。开源:FastAPI(评测确认,已装)。
>
> **设计决策(需留意)**：核对后**删除草稿行**（草稿表 CHECK(confirmed=0) 无法就地标记；删除防重复核对，代价是草稿审计留痕丢失——如需审计可后续改为归档表）。

## 九维度

- **功能范围**：核对写正式库；片段落 `contract_chunks` + 写 Milvus；批处理(断点续跑)+HTTP 单份入口；SHA-256 去重；片段同步。
- **非目标**：不做查询侧检索/RAG(→T07/T08)；Milvus collection schema/维度属实现细节。
- **用户/系统流程**：人工核对 draft → 置 confirmed=1 写正式库 → 片段+向量落库；标签/原文更新触发同步。
- **数据与状态变化**：draft→`contracts`(confirmed=1)；`contract_chunks` 增行；Milvus 增向量。**草稿区(confirmed=0)绝不建向量。**
- **接口/模块边界**：S3 产出、S2 只读消费的契约点；embedding/Milvus 端点封在解析侧。
- **权限与安全**：仅核对背书数据入向量——「查询只读已背书数据」核心保障(坑9)。
- **失败处理**：单份建向量失败 → 标记待人工，不阻断整批(§8)。
- **兼容性**：metadata 四字段与 T01/T02/T07 同名；同步须保证命中片段 metadata = 正式库当前值。
- **可观察性 · 🟡 HITL 依赖**：**需 G2：qwen3-embedding/Milvus 端点**方可部署；**需 G5：片段同步机制决策**(事件/批量/版本号)方可定实现设计。测试用 fake 客户端可先行(靠 T02 接缝)。

## 验收标准（可观测）

- [ ] 核对通过 → `contracts` 出现 confirmed=1 行，带 `confirmed_by`/`confirmed_at` + `_ai_raw` 留痕
- [ ] 该合同 `contract_chunks` 有分段片段(四模块单独存)；fake/真 Milvus 收到对应写入调用
- [ ] 草稿态(confirmed=0)合同**不触发**任何向量写入(用例断言 0 次)
- [ ] 同一文件二次投递被**指纹拦截**；标签 0→1 更新**只改 metadata**不重算向量
- [ ] 批处理断点续跑；单份失败标记待人工、不阻断整批

## 验证方法

```bash
# 单元：fake Milvus 断言写入时机（不依赖 G2）
pytest tests/test_confirm_vectorize.py -v
# 集成（需 G2 端点）：核对→查 chunks + Milvus count
python confirm.py --id <draft_id>
psql "$PG_URL" -c "SELECT count(*) FROM contract_chunks WHERE contract_id=..."
```

## 完成定义

fake Milvus 单测断言「核对后建、草稿不建、标签更新只改 metadata」全绿；(需 G2)集成路径核对→写正式库+chunks+Milvus 通；指纹去重与失败不阻断整批可验。**前置：G2 端点 + G5 同步机制决策。**
