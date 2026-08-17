-- 系统管理：部门表及默认组织树。
-- 幂等执行：可安全用于已部署的 contract_assistant 运营库。

BEGIN;

CREATE OR REPLACE FUNCTION set_update_time() RETURNS trigger AS $$
BEGIN
  NEW.update_time = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS sys_department (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id     BIGINT       NOT NULL DEFAULT 0,
  dept_code     VARCHAR(50)  NOT NULL UNIQUE,
  dept_name     VARCHAR(100) NOT NULL,
  leader        VARCHAR(100) NOT NULL DEFAULT '',
  sort          INT          NOT NULL DEFAULT 1,
  status        SMALLINT     NOT NULL DEFAULT 1,
  create_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  update_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  delete_status SMALLINT     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sys_department_parent_active
  ON sys_department (parent_id, sort, id)
  WHERE delete_status = 0;

CREATE INDEX IF NOT EXISTS idx_sys_department_name_active
  ON sys_department (dept_name)
  WHERE delete_status = 0;

DROP TRIGGER IF EXISTS trg_sys_department_upd ON sys_department;
CREATE TRIGGER trg_sys_department_upd
  BEFORE UPDATE ON sys_department
  FOR EACH ROW EXECUTE FUNCTION set_update_time();

-- 默认组织树只补不存在的编码，不覆盖后续人工维护的部门信息。
INSERT INTO sys_department (parent_id, dept_code, dept_name, sort)
VALUES (0, 'HQ', '总公司', 1)
ON CONFLICT (dept_code) DO NOTHING;

INSERT INTO sys_department (parent_id, dept_code, dept_name, sort)
SELECT id, 'IT', '信息技术部', 1 FROM sys_department WHERE dept_code = 'HQ'
ON CONFLICT (dept_code) DO NOTHING;

INSERT INTO sys_department (parent_id, dept_code, dept_name, sort)
SELECT id, 'LEGAL', '法务部', 2 FROM sys_department WHERE dept_code = 'HQ'
ON CONFLICT (dept_code) DO NOTHING;

INSERT INTO sys_department (parent_id, dept_code, dept_name, sort)
SELECT id, 'CONTRACT', '合同管理部', 3 FROM sys_department WHERE dept_code = 'HQ'
ON CONFLICT (dept_code) DO NOTHING;

INSERT INTO sys_department (parent_id, dept_code, dept_name, sort)
SELECT id, 'OPERATIONS', '运营管理部', 4 FROM sys_department WHERE dept_code = 'HQ'
ON CONFLICT (dept_code) DO NOTHING;

COMMIT;
