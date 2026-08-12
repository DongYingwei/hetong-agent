-- init_pg.sql — Koa 网关【运营库】PostgreSQL DDL + 种子（T10 · MySQL→PG 迁移）
--
-- 坑1/坑6：全系统统一 PostgreSQL，原型 init.sql(MySQL) 废弃、不再使用。
-- 这是网关运营表（用户/字典/台账/关键词/范本/文件/历史），与解析/查询侧的 contracts-db
-- 是【不同库】——运营 CRUD 用本库；查询智能体只读 contracts-db。
--
-- 迁移要点：
--   · INT AUTO_INCREMENT PRIMARY KEY → INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
--   · DATETIME DEFAULT CURRENT_TIMESTAMP → TIMESTAMPTZ DEFAULT now()
--   · ON UPDATE CURRENT_TIMESTAMP（MySQL 专有）→ 触发器（见文末 set_update_time）
--   · TINYINT → SMALLINT；反引号去除；ENGINE/CHARSET 去除
--   · INSERT ... ON DUPLICATE KEY UPDATE → INSERT ... ON CONFLICT ... DO NOTHING/UPDATE
-- 幂等：CREATE TABLE IF NOT EXISTS + ON CONFLICT。

BEGIN;

-- 通用 updated_at 触发器函数（替代 MySQL 的 ON UPDATE CURRENT_TIMESTAMP）
CREATE OR REPLACE FUNCTION set_update_time() RETURNS trigger AS $$
BEGIN
  NEW.update_time = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS sys_user (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password      VARCHAR(100) NOT NULL,
  real_name     VARCHAR(50)  NOT NULL,
  role          SMALLINT     NOT NULL DEFAULT 1,   -- 0管理员 1普通用户
  status        SMALLINT     NOT NULL DEFAULT 1,   -- 1启用 0禁用
  department    VARCHAR(100),
  phone         VARCHAR(30),
  create_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  update_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  delete_status SMALLINT     NOT NULL DEFAULT 0
);

-- 2. 数据字典表
CREATE TABLE IF NOT EXISTS sys_dict (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dict_type   VARCHAR(50)  NOT NULL,
  dict_label  VARCHAR(50)  NOT NULL,
  dict_value  VARCHAR(50)  NOT NULL,
  sort_order  INT          DEFAULT 0,
  remark      VARCHAR(255),
  create_time TIMESTAMPTZ  NOT NULL DEFAULT now(),
  update_time TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT sys_dict_type_value_unique UNIQUE (dict_type, dict_value)
);

-- 3. 合同台账表（原型运营表；与查询侧 contracts-db 的 contracts 不同表）
CREATE TABLE IF NOT EXISTS contract_ledger (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_no    VARCHAR(50)   NOT NULL UNIQUE,
  customer_name  VARCHAR(100)  NOT NULL,
  contract_name  VARCHAR(150)  NOT NULL,
  contract_type  SMALLINT      NOT NULL DEFAULT 1,
  sign_date      DATE          NOT NULL,
  amount         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  assessment_line VARCHAR(50)  DEFAULT '通用',
  has_ai_keyword SMALLINT      NOT NULL DEFAULT 0,
  contract_status SMALLINT     NOT NULL DEFAULT 2,
  verify_status  SMALLINT      NOT NULL DEFAULT 0,
  warning_status SMALLINT      NOT NULL DEFAULT 0,
  create_time    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  update_time    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  delete_status  SMALLINT      NOT NULL DEFAULT 0
);

-- 4. 关键词管理表
CREATE TABLE IF NOT EXISTS contract_keyword (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword_name  VARCHAR(50)  NOT NULL,
  category      VARCHAR(50)  NOT NULL,
  description   VARCHAR(255),
  status        SMALLINT     NOT NULL DEFAULT 1,
  create_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  update_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  delete_status SMALLINT     NOT NULL DEFAULT 0
);

-- 5. 合同范本模块表
CREATE TABLE IF NOT EXISTS contract_section (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  section_title VARCHAR(100) NOT NULL,
  category      VARCHAR(50)  NOT NULL,
  content       TEXT         NOT NULL,
  version       VARCHAR(20)  DEFAULT 'v1.0',
  create_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  update_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  delete_status SMALLINT     NOT NULL DEFAULT 0
);

-- 6. 文件持久化管理表（3 个月保留期限）
CREATE TABLE IF NOT EXISTS sys_file (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  file_name     VARCHAR(150) NOT NULL,
  file_path     VARCHAR(255) NOT NULL,
  file_url      VARCHAR(255) NOT NULL,
  file_size     BIGINT       NOT NULL,
  file_type     VARCHAR(50),
  uploader_id   INT,
  upload_time   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expire_time   TIMESTAMPTZ  NOT NULL,           -- 上传时间 + 3 个月
  delete_status SMALLINT     NOT NULL DEFAULT 0
);

-- 7. 合同履约与核对历史表
CREATE TABLE IF NOT EXISTS contract_history (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id   INT          NOT NULL,
  action_type   VARCHAR(50)  NOT NULL,
  operator_name VARCHAR(50)  NOT NULL,
  remark        VARCHAR(255),
  create_time   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- update_time 自动维护触发器（对有 update_time 的表）
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sys_user','sys_dict','contract_ledger','contract_keyword','contract_section'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_upd ON %1$s', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_upd BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION set_update_time()', t);
  END LOOP;
END $$;

-- ==================== 初始种子数据 ====================

INSERT INTO sys_user (username, password, real_name, role, status) VALUES
  ('admin', '53801c1df9e41f90b77ae9756980732b', '张三', 0, 1),
  ('user',  '53801c1df9e41f90b77ae9756980732b', '李四', 1, 1)
ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password;

INSERT INTO sys_dict (dict_type, dict_label, dict_value, sort_order, remark) VALUES
  ('contract_status', '流水中', '1', 1, '审批流水中'),
  ('contract_status', '已签约', '2', 2, '双方已盖章签约'),
  ('contract_status', '已闭环', '3', 3, '合同履约完成闭环'),
  ('contract_status', '已作废', '4', 4, '合同终止作废'),
  ('contract_type', '框架协议', '1', 1, '主框架协议'),
  ('contract_type', '单项合同', '2', 2, '独立单项服务合同'),
  ('contract_type', '补充协议', '3', 3, '变更补充条款'),
  ('contract_type', '解除协议', '4', 4, '提前解除协议'),
  ('contract_type', '变更协议', '5', 5, '条款变更协议'),
  ('verify_status', '未核对', '0', 1, '尚未进行AI智能核对'),
  ('verify_status', '已核对', '1', 2, '核对一致无误'),
  ('verify_status', '异常', '2', 3, '条款偏差风险预警'),
  ('user_role', '管理员', '0', 1, '超级系统管理员'),
  ('user_role', '普通用户', '1', 2, '普通业务操作人员')
ON CONFLICT (dict_type, dict_value) DO NOTHING;

INSERT INTO contract_ledger (contract_no, customer_name, contract_name, contract_type, sign_date, amount, assessment_line, has_ai_keyword, contract_status, verify_status, warning_status) VALUES
  ('HT-2026-0892', '兴晟泽科技有限公司', '智能运维服务合同', 2, '2026-07-15', 860000.00, '电力', 1, 2, 0, 0),
  ('HT-2026-0751', '国网电力服务中心', '年度技术框架协议', 1, '2026-06-20', 2500000.00, '电力', 1, 2, 1, 0),
  ('HT-2026-0610', '华南建工集团有限公司', '信息化系统采购升级合同', 2, '2026-05-18', 1200000.00, '建筑', 0, 1, 0, 1),
  ('HT-2026-0422', '远东通信股份有限公司', '网络安全优化服务补充协议', 3, '2026-04-10', 350000.00, '通信', 1, 3, 1, 0)
ON CONFLICT (contract_no) DO NOTHING;

INSERT INTO contract_keyword (keyword_name, category, description, status) VALUES
  ('人工智能算力租用', '核心业务', '涵盖GPU/NPU算力租赁及调度条款', 1),
  ('SLA可用性99.9%', '服务标准', '运维服务等级考核指标线', 1),
  ('违约金不超过10%', '风险控制', '违约赔偿责任上限管控', 1),
  ('数据保密协议', '合规管理', '客户敏感数据脱敏与保密约定', 1)
ON CONFLICT DO NOTHING;

INSERT INTO contract_section (section_title, category, content, version) VALUES
  ('保密条款', '通用条款', '双方应对在履行本合同过程中知悉的乙方商业秘密、技术数据及客户资料严格保密...', 'v1.0'),
  ('违约责任条款', '风险管控', '任何一方违反本合同约定的履行义务，应向守约方支付合同总额5%的违约金...', 'v1.1'),
  ('不可抗力条款', '免责约定', '因自然灾害、战争、国家政策重大调整等不可抗力因素导致合同无法履行的，双方互不承担违约责任...', 'v1.0')
ON CONFLICT DO NOTHING;

COMMIT;
