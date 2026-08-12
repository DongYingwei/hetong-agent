# 02 — 解析模块测试接缝（全工作唯一新增接缝）

**What to build:** Python 侧「处理一份合同」函数边界接缝——给定一份 MinerU JSON 输出 → 断言产出的分段片段集符合结构感知规则、metadata 四字段齐全。用 fake/记录式 Milvus 和 embedding 客户端，不打真服务。这是全工作**唯一必须新增**的接缝（解析模块当前无对应测试基建）。

**Blocked by:** None — 可与 T01 并行（frontier）。

**Status:** ✅ done（2026-08-12 · pytest 8/8 绿）· **AFK**（纯 fake，无外部依赖）

## 九维度

- **功能范围**：定型函数签名 `process_one_contract(mineru_json) → chunk[]`；fake Milvus(记录写入)、fake embedding(固定向量)；结构感知切分与 metadata 断言。
- **非目标**：不调真 MinerU/qwen3/Milvus；不实现抽取逻辑(→T03)与建向量落库(→T04)。
- **用户/系统流程**：给 demo MinerU JSON → 函数产 chunk[] → 测试断言切分+metadata；T03/T04 复用同一接缝。
- **数据与状态变化**：纯函数无副作用；fake 客户端仅记录调用，供断言「写入了什么」。
- **接口/模块边界**：codebase-design 最高稳定测试点——解析侧对外唯一测试接缝，替换真实客户端而非 mock 内部实现。
- **权限与安全**：无外部连接；接缝隔离真服务。
- **失败处理**：切分/metadata 不符即断言失败——测试即规格。
- **兼容性**：chunk metadata 四字段名与 T01 DDL / T07 检索 filter 同名。
- **可观察性**：测试套件绿/红即信号；fake 客户端可打印被写入的 chunk 集。

## 验收标准（可观测）

- [x] 函数签名定型：input MinerU JSON → output chunk[]，被测试直接调用
- [x] 切分断言：按章节/字段切父块、超长按条款切、重叠 1–2 句——三条各有用例
- [x] 每片 metadata 四字段齐全：`contract_id`·`contract_no`·`field`·`module_category`
- [x] 四模块片段**单独存储**可断言；fake Milvus 记录到预期写入次数
- [x] 一份 demo MinerU JSON → 切分+metadata 断言全绿

## 验证方法

```bash
pytest tests/test_process_one_contract.py -v
# 断言：切分规则 / metadata 四字段 / 四模块独立 / fake Milvus 写入次数
```

## 完成定义

`process_one_contract` 签名定型且被测试直接调用；fake Milvus/embedding 客户端就位；结构感知切分与四字段 metadata 用例全绿；T03/T04 可复用此接缝。
