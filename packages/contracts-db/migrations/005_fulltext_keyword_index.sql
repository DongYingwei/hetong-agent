-- 005 — 全文关键词隐藏索引。分段命中仍使用 automatic；全文命中以 fulltext 单独保存。

BEGIN;

ALTER TABLE contract_keyword_hits
  DROP CONSTRAINT IF EXISTS contract_keyword_hits_source_check;
ALTER TABLE contract_keyword_hits
  ADD CONSTRAINT contract_keyword_hits_source_check
  CHECK (source IN ('automatic', 'manual', 'fulltext'));

CREATE INDEX IF NOT EXISTS idx_ckh_contract_source
  ON contract_keyword_hits(contract_id, source);

COMMIT;
