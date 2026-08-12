# 01 — PostgreSQL 建表(29 字段台账)+ 种子字典

**What to build:** 一套可执行的 PG migration：`contracts`(25 非模块台账列 + 17 AI 留痕列 + tag_ai + 物化时间列) + `contracts_draft`(草稿区) + `contract_chunks`(片段表) + **`contract_modules`(可新增模块配置) + `contract_module_hits`(模块命中明细，替代 mod_* 宽列)**；字典种子(合同类型/状态/金额口径/核对状态/AI 大方向) + 4 预置模块(含锚点变体)可查。INSERT 一行样本 → SELECT 回读字段完整、物化列正确。

> ⚠️ **ADR-0004**：模块改配置驱动。原 `contracts.mod_service/tech/role/staff` + `mod_*_ai/kw/cat` 16 宽列**移除**，模块级命中/原文/留痕收敛到 `contract_module_hits`（每合同×每模块一行），模块定义在 `contract_modules`（可新增，永不 ALTER）。

**Blocked by:** None — 可以立即开始（frontier）。

**Status:** ✅ done（2026-08-12 端到端验证过·Docker PG16·含配置驱动模块）· **AFK**

## 九维度

- **功能范围**：三张表 DDL；20 AI 列 + 6 手工列(NULLABLE) + 3 系统列 + 留痕列；物化 `sign_year/quarter/half`·`end_year`；字典种子(合同类型/状态/金额口径/核对状态/AI 大方向 10 类)。
- **非目标**：不抽取任何字段值(→T03)；不建向量(→T04)；不迁移运营表(→T10)。
- **用户/系统流程**：跑 migration → 空表就位 → 后续 T03 写草稿、T04 写正式库、T05 对照写 schema。
- **数据与状态变化**：建表 + 种子 INSERT。`confirmed` 默认 0；正式库靠 T04 置 1。
- **接口/模块边界**：DDL 是解析侧(写)与查询侧(读)的**共享契约**；字段名即 Milvus metadata 名。
- **权限与安全**：建表用管理员角色；此单**不**建只读角色(G1，随 T06 部署)。
- **失败处理**：migration 幂等/可重跑；字段与 §5.3 不符即 fail，不静默跳过。
- **兼容性**：字段名须与 T05 schema skill、T03/T04 metadata 严格同名，全链一致。
- **可观察性**：`\d contracts` 列全 29；种子行可 SELECT；migration 有版本号/日志。

## 验收标准（可观测）

- [x] `\d contracts` 输出 29 列，逐一对应解析需求 §5.3；6 手工列为 NULLABLE
- [x] 每个 AI 列有配套 `<field>_ai_raw` 留痕列；表含 `confirmed`/`confirmed_by`/`confirmed_at`
- [x] INSERT 含 `sign_date` 的样本行后，`SELECT sign_year,sign_quarter,sign_half` 返回正确物化值
- [x] `contracts_draft`、`contract_chunks` 建成；SELECT 种子字典 5 类均有行
- [x] PG 连接与 migration 脚本可执行、可重跑

## 验证方法

```bash
psql "$PG_URL" -f migrations/001_contracts.sql
psql "$PG_URL" -c "\d contracts" | grep -c '^ '        # 期望 29
# INSERT sign_date='2026-04-02' → 断言 sign_quarter=2
psql "$PG_URL" -c "SELECT count(*) FROM contract_chunks"  # 表存在
```

## 完成定义

migration 可执行且幂等；29 字段与物化列断言全绿；三张表 + 5 类种子字典就位；字段名与全链(T03/T04/T05)约定一致。
