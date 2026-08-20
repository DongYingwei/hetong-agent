-- 008 — 将异步队列上线前已生成的草稿回填为“解析完成、待核对”任务。
-- 这样旧同步上传的合同也能在合同台账中可见；不重新调用 MinerU/模型，不改草稿内容。
BEGIN;

INSERT INTO contract_parse_jobs (
  package_id, status, total_files, processed_files, progress, current_file,
  draft_id, extractor_provider, attempt_count, started_at, finished_at
)
SELECT
  cp.id,
  'succeeded',
  COUNT(cs.id) FILTER (WHERE cs.source_type = 'pdf'),
  COUNT(cs.id) FILTER (WHERE cs.source_type = 'pdf'),
  100,
  COALESCE(MAX(cs.source_relative_path) FILTER (WHERE cs.role = 'primary'), cp.primary_source_path),
  cp.draft_id,
  'qwen',
  1,
  cp.created_at,
  cp.created_at
FROM contract_packages cp
LEFT JOIN contract_sources cs ON cs.package_id = cp.id
LEFT JOIN contract_parse_jobs existing ON existing.package_id = cp.id
WHERE cp.status = 'draft'
  AND cp.draft_id IS NOT NULL
  AND existing.id IS NULL
GROUP BY cp.id, cp.draft_id, cp.primary_source_path, cp.created_at;

COMMIT;
