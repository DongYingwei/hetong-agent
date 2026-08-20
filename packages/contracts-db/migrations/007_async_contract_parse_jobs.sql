-- 007 — 合同异步解析任务。上传与解析解耦，任务在服务重启后可恢复。
BEGIN;

ALTER TABLE contract_packages DROP CONSTRAINT IF EXISTS contract_packages_status_check;
ALTER TABLE contract_packages ADD CONSTRAINT contract_packages_status_check
  CHECK (status IN ('queued', 'running', 'draft', 'confirmed', 'failed'));

CREATE TABLE IF NOT EXISTS contract_parse_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  package_id BIGINT NOT NULL UNIQUE REFERENCES contract_packages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  queue_order BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  total_files INTEGER NOT NULL DEFAULT 0 CHECK (total_files >= 0),
  processed_files INTEGER NOT NULL DEFAULT 0 CHECK (processed_files >= 0),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  current_file TEXT,
  extractor_provider TEXT NOT NULL DEFAULT 'qwen'
    CHECK (extractor_provider IN ('qwen', 'deepseek')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  draft_id BIGINT UNIQUE REFERENCES contracts_draft(id) ON DELETE SET NULL,
  error_message TEXT,
  created_by TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_parse_jobs_queue
  ON contract_parse_jobs(status, queue_order);

-- 网关台账首屏需要展示“解析中/失败”任务，仍只授予查询账号 SELECT 权限。
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jinguan_readonly') THEN
    GRANT SELECT ON contract_parse_jobs TO jinguan_readonly;
  END IF;
END $$;

COMMIT;
