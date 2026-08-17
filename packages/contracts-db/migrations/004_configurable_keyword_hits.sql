-- 004 — 配置驱动的合同关键词命中。
-- 关键词管理、模块定义和正式合同命中必须在同一 contracts 库中，
-- 否则页面上修改的配置无法影响真实台账。

BEGIN;

CREATE TABLE IF NOT EXISTS ai_keywords (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  match_rules TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_keyword_terms (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword_id  BIGINT NOT NULL REFERENCES ai_keywords(id) ON DELETE CASCADE,
  term        TEXT NOT NULL,
  UNIQUE(keyword_id, term)
);

-- 一条记录就是一个可追溯的“父词/子词在某段正文中命中”。
CREATE TABLE IF NOT EXISTS contract_keyword_hits (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id     BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  module_key      TEXT REFERENCES contract_modules(module_key) ON DELETE SET NULL,
  keyword_id      BIGINT NOT NULL REFERENCES ai_keywords(id) ON DELETE CASCADE,
  matched_term    TEXT,
  paragraph_no    INT,
  paragraph_text  TEXT,
  source          TEXT NOT NULL DEFAULT 'automatic'
                    CHECK (source IN ('automatic', 'manual', 'fulltext')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_id, module_key, keyword_id, matched_term, paragraph_no, source)
);
CREATE INDEX IF NOT EXISTS idx_ckh_contract_module ON contract_keyword_hits(contract_id, module_key);
CREATE INDEX IF NOT EXISTS idx_ckh_keyword ON contract_keyword_hits(keyword_id);

-- 人工核对不是合同级“AI 判定”，而是对某合同×模块×父词的包含/排除覆盖。
CREATE TABLE IF NOT EXISTS contract_keyword_overrides (
  contract_id  BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  module_key   TEXT NOT NULL REFERENCES contract_modules(module_key) ON DELETE CASCADE,
  keyword_id   BIGINT NOT NULL REFERENCES ai_keywords(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('include', 'exclude')),
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, module_key, keyword_id)
);

-- 默认父词 AI；管理员可在关键词管理页维护子词。不会覆盖已有人工配置。
INSERT INTO ai_keywords(name, match_rules) VALUES ('AI', '子词完全包含匹配')
ON CONFLICT (name) DO NOTHING;
INSERT INTO ai_keyword_terms(keyword_id, term)
SELECT k.id, v.term
FROM ai_keywords k
CROSS JOIN (VALUES
  ('人工智能'), ('智能体'), ('大模型'), ('NLP'), ('OCR'), ('机器学习'),
  ('深度学习'), ('算法模型'), ('神经网络'), ('大语言模型')
) AS v(term)
WHERE k.name = 'AI'
ON CONFLICT DO NOTHING;

-- 预置四模块的第三项由旧“岗位说明”升级为项目名称；module_key 保持稳定，
-- 以免破坏已有外键。历史命中不会自动重扫，只有用户发起重扫才按新标题配置更新。
UPDATE contract_modules
   SET name='项目名称', anchor_names=ARRAY['项目名称','项目概况','项目简介'],
       recognition_rule='按标题章节自动归类：项目名称/项目概况', sort_order=0
 WHERE module_key='role';

COMMIT;
