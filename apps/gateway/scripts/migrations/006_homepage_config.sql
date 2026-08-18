-- 首页配置属于运营库：按角色、用户或全局默认指定登录首页。
CREATE TABLE IF NOT EXISTS sys_homepage_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  relation_type VARCHAR(20) NOT NULL CHECK (relation_type IN ('角色', '用户', '全局默认')),
  target_name VARCHAR(200) NOT NULL DEFAULT '',
  route VARCHAR(255) NOT NULL,
  component VARCHAR(255) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status SMALLINT NOT NULL DEFAULT 1 CHECK (status IN (0, 1)),
  create_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  update_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  delete_status SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sys_homepage_config_active
  ON sys_homepage_config (delete_status, status, priority, id);

DROP TRIGGER IF EXISTS trg_sys_homepage_config_upd ON sys_homepage_config;
CREATE TRIGGER trg_sys_homepage_config_upd
  BEFORE UPDATE ON sys_homepage_config
  FOR EACH ROW EXECUTE FUNCTION set_update_time();
