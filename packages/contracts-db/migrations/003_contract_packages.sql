-- 003 — 合同包与来源文件追溯（多文件合同解析）
BEGIN;

CREATE TABLE IF NOT EXISTS contract_packages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  package_key TEXT NOT NULL UNIQUE,
  primary_source_path TEXT,
  draft_id BIGINT UNIQUE REFERENCES contracts_draft(id) ON DELETE SET NULL,
  contract_id BIGINT UNIQUE REFERENCES contracts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS contract_sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  package_id BIGINT NOT NULL REFERENCES contract_packages(id) ON DELETE CASCADE,
  source_sha256 TEXT NOT NULL,
  source_relative_path TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('pdf','docx','doc')),
  markdown_path TEXT,
  markdown_sha256 TEXT,
  role TEXT NOT NULL DEFAULT 'attachment' CHECK (role IN ('primary','attachment','irrelevant')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (package_id, source_relative_path)
);
CREATE INDEX IF NOT EXISTS idx_contract_sources_sha ON contract_sources(source_sha256);

COMMIT;
