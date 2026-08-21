-- 009 — 上传文件名前置编码生成合同号建议值；草稿内部 DRAFT-* 键保持不变。
BEGIN;

ALTER TABLE contracts_draft
  ADD COLUMN IF NOT EXISTS suggested_contract_no TEXT;

COMMENT ON COLUMN contracts_draft.suggested_contract_no IS
  '由上传文件名生成的合同号建议值，人工核对可修改，不能视为未核对合同的正式编号';

-- 回填异步队列上线前已有草稿。只处理文件名开头的明确编码，无法识别则保留空值。
WITH source_code AS (
  SELECT DISTINCT ON (cp.draft_id)
    cp.draft_id,
    upper(substring(regexp_replace(cs.source_relative_path, '^.*/', '')
      FROM '^((?:[A-Za-z]+(?:/[A-Za-z]+)?-)?[A-Za-z]+-[0-9]{4,}(?:-[0-9]+)?)')) AS code
  FROM contract_packages cp
  JOIN contract_sources cs ON cs.package_id = cp.id AND cs.source_type = 'pdf'
  WHERE cp.draft_id IS NOT NULL
  ORDER BY cp.draft_id, CASE WHEN cs.role = 'primary' THEN 0 ELSE 1 END, cs.id
)
UPDATE contracts_draft d
SET suggested_contract_no = CASE
  WHEN s.code LIKE 'HSSLC-%' THEN 'HSSL/C-' || substring(s.code FROM 7)
  WHEN s.code LIKE 'HSKJ/C-%' THEN s.code
  WHEN s.code ~ '^(ZCKJ|RQKJ|HSSL|JZX)(/C)?-' THEN s.code
  ELSE 'HSKJ/C-' || s.code
END
FROM source_code s
WHERE d.id = s.draft_id
  AND s.code IS NOT NULL
  AND (d.suggested_contract_no IS NULL OR d.suggested_contract_no = '');

COMMIT;
