-- 综合检索会话：按登录用户持久化业务可见的问答和结果，不保存 SQL/提示词/内部评分。

BEGIN;

CREATE TABLE IF NOT EXISTS agent_sessions (
  id            UUID PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES sys_user(id),
  title         VARCHAR(200) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_updated
  ON agent_sessions(user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS agent_messages (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content       TEXT NOT NULL,
  result_data   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session
  ON agent_messages(session_id, id);

CREATE OR REPLACE FUNCTION set_agent_session_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_sessions_upd ON agent_sessions;
CREATE TRIGGER trg_agent_sessions_upd
  BEFORE UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION set_agent_session_updated_at();

COMMIT;
