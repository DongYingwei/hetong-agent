-- 010 — 特殊主体的建议合同号统一为 <主体>/C-<编码>。
-- 009 曾保留 ZCKJ-/RQKJ-/HSSL-/JZX- 原样；按业务规则修正历史草稿建议值。
BEGIN;

UPDATE contracts_draft
SET suggested_contract_no = CASE
  WHEN suggested_contract_no LIKE 'ZCKJ-%' THEN 'ZCKJ/C-' || substring(suggested_contract_no FROM 6)
  WHEN suggested_contract_no LIKE 'RQKJ-%' THEN 'RQKJ/C-' || substring(suggested_contract_no FROM 6)
  WHEN suggested_contract_no LIKE 'HSSL-%' THEN 'HSSL/C-' || substring(suggested_contract_no FROM 6)
  WHEN suggested_contract_no LIKE 'JZX-%' THEN 'JZX/C-' || substring(suggested_contract_no FROM 5)
  ELSE suggested_contract_no
END
WHERE suggested_contract_no ~ '^(ZCKJ|RQKJ|HSSL|JZX)-';

COMMIT;
