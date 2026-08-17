CREATE TABLE IF NOT EXISTS keyword_rescan_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('contract','order','all')),
  overwrite_manual BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','completed_with_errors','failed')),
  requested_by TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  total_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keyword_rescan_job_items (
  job_id BIGINT NOT NULL REFERENCES keyword_rescan_jobs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('contract','order')),
  entity_id BIGINT NOT NULL,
  entity_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','success','skipped','failed')),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  PRIMARY KEY(job_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_keyword_rescan_jobs_created ON keyword_rescan_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_rescan_items_job_status ON keyword_rescan_job_items(job_id, status);
