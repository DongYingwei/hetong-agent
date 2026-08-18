-- 已确认的框架合同—订单关联：合同事实在独立 contracts 库，故 contract_id 不设跨库外键。
-- 导入/维护接口必须同时校验 contracts.id 与 sys_order.id，避免无效关联进入业务金额统计。
CREATE TABLE IF NOT EXISTS contract_order_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL REFERENCES sys_order(id) ON DELETE CASCADE,
  source_contract_no TEXT NOT NULL,
  source_order_no TEXT NOT NULL,
  link_method TEXT NOT NULL DEFAULT 'manual' CHECK (link_method IN ('manual', 'import')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'invalid')),
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, order_id)
);

-- 一个订单在任意时刻只能归入一份已确认有效合同，保证框架订单金额不会重复计入。
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_order_links_confirmed_order
  ON contract_order_links(order_id) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_contract_order_links_contract_status
  ON contract_order_links(contract_id, status);
