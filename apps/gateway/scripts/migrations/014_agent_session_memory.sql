-- 综合检索会话事实摘要：只保存对象、年份、考核线和已返回编号等业务上下文，
-- 不保存 SQL、Prompt、模型推理或内部评分。

BEGIN;

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS context_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_retention
  ON agent_sessions(updated_at) WHERE deleted_at IS NULL;

COMMIT;
