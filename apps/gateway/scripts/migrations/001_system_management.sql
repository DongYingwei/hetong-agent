-- 为已部署的早期运营库补齐系统管理所需结构。
-- 使用：docker exec -i hetong-contracts-db psql -U postgres -d contract_assistant < 此文件

BEGIN;

CREATE OR REPLACE FUNCTION set_update_time() RETURNS trigger AS $$
BEGIN
  NEW.update_time = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS job_title VARCHAR(100),
  ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email VARCHAR(100),
  ADD COLUMN IF NOT EXISTS telephone VARCHAR(30),
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS identity VARCHAR(50) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS resp_department VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sort INT NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS sys_role (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_code VARCHAR(50) NOT NULL UNIQUE,
  role_name VARCHAR(100) NOT NULL,
  perm_key VARCHAR(255),
  sort INT NOT NULL DEFAULT 1,
  status SMALLINT NOT NULL DEFAULT 1,
  create_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  update_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  delete_status SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sys_menu (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT '菜单',
  parent_id INT NOT NULL DEFAULT 0,
  path VARCHAR(255) NOT NULL DEFAULT '',
  permission VARCHAR(255) NOT NULL DEFAULT '',
  sort INT NOT NULL DEFAULT 1,
  status SMALLINT NOT NULL DEFAULT 1,
  create_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  update_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  delete_status SMALLINT NOT NULL DEFAULT 0
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sys_user','sys_role','sys_menu'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_upd ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_upd BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_update_time()', t);
  END LOOP;
END $$;

INSERT INTO sys_role (role_code, role_name, perm_key, sort, status) VALUES
  ('admin', '系统管理员', '*', 1, 1),
  ('contract_manager', '合同管理员', 'contract:*', 2, 1),
  ('business_user', '业务用户', 'contract:view', 3, 1)
ON CONFLICT (role_code) DO NOTHING;

INSERT INTO sys_menu (name, type, parent_id, path, permission, sort, status)
SELECT v.name, v.type, v.parent_id, v.path, v.permission, v.sort, v.status
FROM (VALUES
  ('合同台账', '菜单', 0, '/ledger', 'contract:view', 1, 1),
  ('合同管理', '菜单', 0, '/contracts', 'contract:view', 2, 1),
  ('系统管理', '目录', 0, '/system', '', 90, 1),
  ('用户管理', '菜单', 0, '/system/users', 'system:user', 91, 1),
  ('角色管理', '菜单', 0, '/system/roles', 'system:role', 92, 1),
  ('菜单管理', '菜单', 0, '/system/menus', 'system:menu', 93, 1)
) AS v(name, type, parent_id, path, permission, sort, status)
WHERE NOT EXISTS (
  SELECT 1 FROM sys_menu m
  WHERE m.path = v.path AND m.delete_status = 0
);

COMMIT;
