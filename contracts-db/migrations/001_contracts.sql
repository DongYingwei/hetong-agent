-- 001_contracts.sql — 经小管合同库 · 正式表 / 草稿表 / 片段表
--
-- 权威字段来源：合同解析模块-需求方案 §5.3（台账 V2 · 29 字段）
--   · 模块级字段（mod_*_ai/kw/cat）来源 §6.3
--   · AI 字段留痕（<field>_ai_raw）、记录级核对列 来源 §7.2
--   · 片段 metadata 四字段 来源 §7.6.3
--
-- 这是解析侧（写）与查询侧（读）的【共享契约】。字段名即 Milvus metadata 名，
-- 全链（jinguan-parse / jinguan-qa / schema skill）严格同名。
--
-- 幂等：全部 IF NOT EXISTS / CREATE OR REPLACE，可重复执行。

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 物化时间列的确定性生成函数（供 GENERATED 列使用）
-- sign_year/quarter/half 由 sign_date 计算；end_year 由 end_date 计算。
-- ─────────────────────────────────────────────────────────────

-- ============================================================
-- 正式库 contracts —— 人工核对通过后写入；查询智能体只读此表。
-- 29 字段（§5.3）+ 模块级派生列（§6.3）+ AI 留痕列（§7.2）+ 记录级核对列。
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- —— §5.3 合同检索信息（1,4-7 手工；NULLABLE 占位）——
  contract_no             TEXT        NOT NULL,               -- 1  手工·唯一键（我方合同号）
  assessment_line         TEXT,                               -- 4  手工
  bid_no                  TEXT,                               -- 5  手工
  related_main_no         TEXT,                               -- 6  手工（补充/解除/变更协议才填）
  framework_alias         TEXT,                               -- 7  手工（单项合同填 "/"）

  -- —— §5.3 概要信息（2-3,8-13 AI）——
  customer_name           TEXT,                               -- 2  AI（甲方，多客户全列）
  contract_name           TEXT,                               -- 3  AI
  customer_contract_no    TEXT,                               -- 8  AI（客方合同号）
  signing_entity          TEXT,                               -- 9  AI（我方签约主体）
  contract_type           TEXT,                               -- 10 AI 枚举（框架/单项/补充/解除/变更协议）
  sign_date               DATE,                               -- 11 AI（+物化 sign_year/quarter/half）
  start_date              DATE,                               -- 12 AI
  end_date                DATE,                               -- 13 AI（+物化 end_year 供断档预警）

  -- —— §5.3 金额及结算（14-17 AI）——
  amount_type             TEXT,                               -- 14 AI 枚举（上限/预估/固定金额）
  amount                  DECIMAL,                            -- 15 AI 可空（框架协议可能无金额→NULL）
  tax_rate                TEXT,                               -- 16 AI 文本（多税率全列出，非数值列）
  settlement_terms        TEXT,                               -- 17 AI 长文本（原文→入向量库）

  -- —— §5.3 商务条款（18-22 AI）——
  post_eval               TEXT,                               -- 18 AI（是/否）
  deposit_amount          DECIMAL,                            -- 19 AI 可空（履约保证金金额）
  deposit_refund          TEXT,                               -- 20 AI 长文本（退还条件·原文）
  arbitration             TEXT,                               -- 21 AI 长文本（仲裁方式·原文）
  authorizer              TEXT,                               -- 22 AI（授权人）

  -- —— §5.3 风控管理（23 手工；24 系统）——
  status                  TEXT,                               -- 23 手工 枚举（流水中/已签约/已闭环/已作废）
  expiry_warning          TEXT,                               -- 24 系统自动 计算列（到期前4/3/2/1月推送）

  -- —— §5.3 关键词解析（25 AI/代码汇总）——
  tag_ai                  INT         NOT NULL DEFAULT 0,     -- 25 任一模块命中即1（§6 汇总）
  -- 注：§5.3 第26-29行的四模块原文与 §6.3 的模块级命中结果（命中/关键词/大方向）
  --     不再作为 contracts 的固定宽列——模块已改为【配置驱动】（原型「合同模块」可新增）。
  --     模块定义见 contract_modules；每合同×每模块的命中与原文见 contract_module_hits。
  --     新增模块 = 配置表插行 + 明细表多行，永不 ALTER contracts。

  -- —— 物化时间列（§5.3 第11/13行；ETL 入库时预计算）——
  sign_year               INT         GENERATED ALWAYS AS (EXTRACT(YEAR    FROM sign_date)::INT) STORED,
  sign_quarter            INT         GENERATED ALWAYS AS (EXTRACT(QUARTER FROM sign_date)::INT) STORED,
  sign_half               INT         GENERATED ALWAYS AS (CASE WHEN sign_date IS NULL THEN NULL
                                                               WHEN EXTRACT(QUARTER FROM sign_date) <= 2 THEN 1
                                                               ELSE 2 END) STORED,
  end_year                INT         GENERATED ALWAYS AS (EXTRACT(YEAR    FROM end_date)::INT) STORED,

  -- —— §7.2 记录级核对列 ——
  confirmed               INT         NOT NULL DEFAULT 1,     -- 正式库行天然已核对；见 CHECK
  confirmed_by            TEXT,
  confirmed_at            TIMESTAMPTZ,

  CONSTRAINT contracts_no_unique      UNIQUE (contract_no),
  CONSTRAINT contracts_confirmed_ck   CHECK (confirmed = 1)  -- 正式库只存已背书数据（坑9）
);

-- —— §7.2 AI 字段留痕列（<field>_ai_raw：AI 原始候选，供比对与审计）——
-- 17 个非模块 AI 字段各配一列。模块级原文的留痕在 contract_module_hits.raw_text。
-- 用 ALTER 逐列 IF NOT EXISTS，保持幂等且与上表分离、易审。
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS customer_name_ai_raw         TEXT,
  ADD COLUMN IF NOT EXISTS contract_name_ai_raw         TEXT,
  ADD COLUMN IF NOT EXISTS customer_contract_no_ai_raw  TEXT,
  ADD COLUMN IF NOT EXISTS signing_entity_ai_raw        TEXT,
  ADD COLUMN IF NOT EXISTS contract_type_ai_raw         TEXT,
  ADD COLUMN IF NOT EXISTS sign_date_ai_raw             TEXT,
  ADD COLUMN IF NOT EXISTS start_date_ai_raw            TEXT,
  ADD COLUMN IF NOT EXISTS end_date_ai_raw              TEXT,
  ADD COLUMN IF NOT EXISTS amount_type_ai_raw           TEXT,
  ADD COLUMN IF NOT EXISTS amount_ai_raw                TEXT,
  ADD COLUMN IF NOT EXISTS tax_rate_ai_raw              TEXT,
  ADD COLUMN IF NOT EXISTS settlement_terms_ai_raw      TEXT,
  ADD COLUMN IF NOT EXISTS post_eval_ai_raw             TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount_ai_raw        TEXT,
  ADD COLUMN IF NOT EXISTS deposit_refund_ai_raw        TEXT,
  ADD COLUMN IF NOT EXISTS arbitration_ai_raw           TEXT,
  ADD COLUMN IF NOT EXISTS authorizer_ai_raw            TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_sign_year   ON contracts (sign_year);
CREATE INDEX IF NOT EXISTS idx_contracts_contract_type ON contracts (contract_type);
CREATE INDEX IF NOT EXISTS idx_contracts_industry_tag ON contracts (tag_ai);

-- ============================================================
-- 草稿区 contracts_draft —— AI 解析产出候选，confirmed=0。查询侧永不读（§7.1）。
-- 与 contracts 同构（含全部 AI 列 + _ai_raw + 模块级列 + 物化列），便于核对搬运。
-- 差异：无 confirmed=1 的 CHECK；contract_no 允许重复（同一合同可多次解析成草稿）。
-- ============================================================
CREATE TABLE IF NOT EXISTS contracts_draft (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_no             TEXT        NOT NULL,
  assessment_line         TEXT,
  bid_no                  TEXT,
  related_main_no         TEXT,
  framework_alias         TEXT,
  customer_name           TEXT,
  contract_name           TEXT,
  customer_contract_no    TEXT,
  signing_entity          TEXT,
  contract_type           TEXT,
  sign_date               DATE,
  start_date              DATE,
  end_date                DATE,
  amount_type             TEXT,
  amount                  DECIMAL,
  tax_rate                TEXT,
  settlement_terms        TEXT,
  post_eval               TEXT,
  deposit_amount          DECIMAL,
  deposit_refund          TEXT,
  arbitration             TEXT,
  authorizer              TEXT,
  status                  TEXT,
  expiry_warning          TEXT,
  tag_ai                  INT         NOT NULL DEFAULT 0,
  -- 模块级命中与原文改为配置驱动 → contract_module_hits（草稿态命中亦落明细表，靠 confirmed 区分）。
  sign_year               INT         GENERATED ALWAYS AS (EXTRACT(YEAR    FROM sign_date)::INT) STORED,
  sign_quarter            INT         GENERATED ALWAYS AS (EXTRACT(QUARTER FROM sign_date)::INT) STORED,
  sign_half               INT         GENERATED ALWAYS AS (CASE WHEN sign_date IS NULL THEN NULL
                                                               WHEN EXTRACT(QUARTER FROM sign_date) <= 2 THEN 1
                                                               ELSE 2 END) STORED,
  end_year                INT         GENERATED ALWAYS AS (EXTRACT(YEAR    FROM end_date)::INT) STORED,
  confirmed               INT         NOT NULL DEFAULT 0,     -- 草稿态
  confirmed_by            TEXT,
  confirmed_at            TIMESTAMPTZ,
  source_sha256           TEXT,                               -- 文件指纹（T04 去重用）
  mineru_md               TEXT,                               -- MinerU 全文 markdown，核对后据此切片建向量（T04 切片2）
  -- 草稿阶段的模块命中存 JSONB（正式表外键无法引用未入库的草稿；ADR-0004）。
  -- 每元素 = {module_key, hit, keywords, category, raw_text, raw_text_ai_raw}。
  -- 核对入正式库时（T04）展开写 contract_module_hits 行。
  module_hits             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT contracts_draft_confirmed_ck CHECK (confirmed = 0)
);

ALTER TABLE contracts_draft
  ADD COLUMN IF NOT EXISTS customer_name_ai_raw         TEXT,
  ADD COLUMN IF NOT EXISTS contract_name_ai_raw         TEXT,
  ADD COLUMN IF NOT EXISTS customer_contract_no_ai_raw  TEXT,
  ADD COLUMN IF NOT EXISTS signing_entity_ai_raw        TEXT,
  ADD COLUMN IF NOT EXISTS contract_type_ai_raw         TEXT,
  ADD COLUMN IF NOT EXISTS sign_date_ai_raw             TEXT,
  ADD COLUMN IF NOT EXISTS start_date_ai_raw            TEXT,
  ADD COLUMN IF NOT EXISTS end_date_ai_raw              TEXT,
  ADD COLUMN IF NOT EXISTS amount_type_ai_raw           TEXT,
  ADD COLUMN IF NOT EXISTS amount_ai_raw                TEXT,
  ADD COLUMN IF NOT EXISTS tax_rate_ai_raw              TEXT,
  ADD COLUMN IF NOT EXISTS settlement_terms_ai_raw      TEXT,
  ADD COLUMN IF NOT EXISTS post_eval_ai_raw             TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount_ai_raw        TEXT,
  ADD COLUMN IF NOT EXISTS deposit_refund_ai_raw        TEXT,
  ADD COLUMN IF NOT EXISTS arbitration_ai_raw           TEXT,
  ADD COLUMN IF NOT EXISTS authorizer_ai_raw            TEXT;

-- ============================================================
-- 合同模块配置 contract_modules —— 【可新增】模块定义（原型「合同模块」页）。
-- 新增模块 = 此表插一行；无需改 contracts / contract_module_hits 结构。
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_modules (
  module_key       TEXT        PRIMARY KEY,          -- 稳定标识（service/tech/role/staff/…），代码与查询用
  name             TEXT        NOT NULL,             -- 展示名（服务内容/技术要求/…）
  anchor_names     TEXT[]      NOT NULL DEFAULT '{}',-- 对应合同内模块名称（章节锚点变体，§6.4）
  recognition_rule TEXT,                             -- AI 如何识别（按标题章节归类）
  enabled          BOOLEAN     NOT NULL DEFAULT TRUE,-- 启用/停用
  sort_order       INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 模块命中明细 contract_module_hits —— 每合同 × 每模块一行（替代原 mod_*_ai/kw/cat 宽列）。
-- §6.3 模块级结果 + §5.3 第26-29行模块原文 + §7.2 留痕，全部收敛到此表。
-- 新增模块 → 此表自然多一行，永不 ALTER。查询侧 mod_service_ai=1 → JOIN 此表。
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_module_hits (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id      BIGINT      NOT NULL,             -- 关联 contracts.id
  module_key       TEXT        NOT NULL,             -- 关联 contract_modules.module_key
  hit              INT         NOT NULL DEFAULT 0,   -- §6.3 该模块是否命中 0/1
  keywords         TEXT,                             -- §6.3 命中的具体关键词（逗号分隔）
  category         TEXT,                             -- §6.3 命中词所属 AI 大方向
  raw_text         TEXT,                             -- §5.3 26-29 模块原文（→向量库）
  raw_text_ai_raw  TEXT,                             -- §7.2 AI 原始候选留痕
  CONSTRAINT cmh_contract_module_unique UNIQUE (contract_id, module_key),
  CONSTRAINT cmh_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE,
  CONSTRAINT cmh_module_fk   FOREIGN KEY (module_key)  REFERENCES contract_modules (module_key)
);

CREATE INDEX IF NOT EXISTS idx_cmh_contract ON contract_module_hits (contract_id);
CREATE INDEX IF NOT EXISTS idx_cmh_module   ON contract_module_hits (module_key);
CREATE INDEX IF NOT EXISTS idx_cmh_hit      ON contract_module_hits (module_key, hit);

-- ============================================================
-- 片段表 contract_chunks —— 解析侧持久化的 MinerU 全文分段片段（§7.6）。
-- metadata 四字段（§7.6.3）；四模块单独存储靠 field/module_category 区分。
-- 仅核对入正式库后建向量（§7.6.4）；草稿区不建向量。
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_chunks (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id             BIGINT      NOT NULL,               -- §7.6.3 关联正式库，回 PG JOIN/统计
  contract_no             TEXT        NOT NULL,               -- §7.6.3 合同号，供出处标注
  field                   TEXT        NOT NULL,               -- §7.6.3 来源字段/章节（settlement_terms/mod_service/前言…）
  module_category         TEXT,                               -- §7.6.3 命中的 AI 大方向（若属四模块）
  chunk_index             INT         NOT NULL DEFAULT 0,     -- 同一 field 内片段顺序
  content                 TEXT        NOT NULL,               -- 片段原文
  milvus_synced           BOOLEAN     NOT NULL DEFAULT FALSE, -- 是否已写入 Milvus（同步状态位）
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_chunks_fk FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_contract  ON contract_chunks (contract_id);
CREATE INDEX IF NOT EXISTS idx_chunks_field     ON contract_chunks (field);
CREATE INDEX IF NOT EXISTS idx_chunks_module    ON contract_chunks (module_category);

COMMIT;
