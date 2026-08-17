-- EPMS 订单台账的唯一事实来源。订单属于运营库 contract_assistant，
-- 与解析库 contracts 分开，不能与合同台账互相覆盖。
CREATE TABLE IF NOT EXISTS sys_order (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  project_no TEXT, project_name TEXT, detail_project_no TEXT,
  customer_order_no TEXT, order_name TEXT, contract_no TEXT, customer_name TEXT,
  assessment_line TEXT, customer_line TEXT, customer_type TEXT, settlement_type TEXT,
  order_type TEXT, order_attr TEXT, salesperson TEXT, customer_contract_no TEXT,
  customer_service_target TEXT, customer_pm TEXT, customer_order_name TEXT,
  created_date DATE, accepted_date DATE, start_date DATE, end_date DATE, est_invoice_date DATE,
  order_status TEXT, tax_rate NUMERIC(12,4), amount NUMERIC(18,2), amount_ex_tax NUMERIC(18,2),
  detail_order_no TEXT, customer_detail_order_no TEXT, redemption_days INTEGER,
  is_last_order TEXT, detail_tax_rate NUMERIC(12,4), detail_amount NUMERIC(18,2),
  detail_amount_ex_tax NUMERIC(18,2), deduct_amount NUMERIC(18,2), deduct_amount_ex_tax NUMERIC(18,2),
  stop_invoice_amount NUMERIC(18,2), stop_invoice_amount_ex_tax NUMERIC(18,2),
  confirmed_income_amount NUMERIC(18,2), confirmed_income_amount_ex_tax NUMERIC(18,2),
  unconfirmed_income_amount NUMERIC(18,2), unconfirmed_income_amount_ex_tax NUMERIC(18,2),
  invoiced_amount NUMERIC(18,2), invoiced_amount_ex_tax NUMERIC(18,2),
  returned_amount NUMERIC(18,2), returned_amount_ex_tax NUMERIC(18,2),
  invoiced_unreturned_amount NUMERIC(18,2), invoiced_unreturned_amount_ex_tax NUMERIC(18,2),
  region TEXT, province TEXT, city TEXT, delivery_list TEXT, income_confirmed INTEGER,
  maker TEXT, make_time TIMESTAMP, detail_maker TEXT, detail_make_time TIMESTAMP,
  updater TEXT, update_time TIMESTAMP, auditor TEXT, audit_time TIMESTAMP,
  has_attachment TEXT, latest_attachment_time TIMESTAMP, source_uuid TEXT, epms_attach_status TEXT,
  attachment_count INTEGER NOT NULL DEFAULT 0, has_eml TEXT NOT NULL DEFAULT '否',
  tag_ai SMALLINT NOT NULL DEFAULT 0, hit_keyword TEXT, ai_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  delete_status SMALLINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sys_order_project_no ON sys_order(project_no);
CREATE INDEX IF NOT EXISTS idx_sys_order_tag_ai ON sys_order(tag_ai);
CREATE INDEX IF NOT EXISTS idx_sys_order_customer_name ON sys_order(customer_name);

-- 与合同 contract_module_hits 采用相同模块键：role=项目名称、service=服务内容、tech=技术要求、staff=人员需求。
CREATE TABLE IF NOT EXISTS order_module_hits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES sys_order(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN ('role','service','tech','staff')),
  hit SMALLINT NOT NULL DEFAULT 0 CHECK (hit IN (0,1)),
  keywords TEXT, raw_text TEXT, model_raw TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_order_module_hits_lookup ON order_module_hits(order_id, module_key, hit);
