# jinguan-parse — 经小管合同解析模块（Python）

解析侧运行时。与 `jinguan-qa`（查询侧 TS）不同运行时，仅通过共享 **PostgreSQL**（`contracts-db`）与 **Milvus** 耦合。解析侧**写**、查询侧**只读**（坑6 / ADR-0003）。

## 测试接缝（T02，全工作唯一新增）

`process_one_contract(mineru_json, milvus_client, embed_client) -> Chunk[]`
— 解析侧「处理一份合同」的函数边界（§S3 Testing Decisions 的最高稳定测试点）。依赖**接受而非创建**：真实 Milvus/embedding 客户端在 T04 注入；测试注入 fake，断言结构感知切分 + metadata 四字段 + 四模块独立 + 建向量被调用。

## 布局

```
src/jinguan_parse/chunking.py   # 结构感知切分 + 接缝（§7.6.2/§7.6.3）
tests/test_process_one_contract.py
tests/fakes.py                  # 记录式 Milvus / 固定向量 embedding
fixtures/demo_mineru.json       # demo MinerU 段输入
```

## 验证

```bash
cd jinguan-parse && python3 -m pytest tests/ -v
```

## 尚未做（后续工单）

- 真实 MinerU 调用 + LLM 分组抽取 20 AI 字段 → T03（需 G3 模块锚点清单）
- 核对入正式库 + 真建向量 + 片段同步 → T04（需 G2 端点、G5 同步机制）
- Milvus collection schema / embedding 维度 / 索引类型：实现阶段定
