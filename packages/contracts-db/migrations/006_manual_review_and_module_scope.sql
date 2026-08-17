-- 正式入库/向量化 与 人工复核是两个独立状态：历史合同先全部进入待核对队列。
CREATE TABLE IF NOT EXISTS contract_manual_reviews (
  contract_id BIGINT PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
  status SMALLINT NOT NULL DEFAULT 0 CHECK (status IN (0, 1)), -- 0 待核对，1 已核对
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO contract_manual_reviews(contract_id, status)
SELECT id, 0 FROM contracts
ON CONFLICT (contract_id) DO NOTHING;

-- 模块配置适配范围：合同、订单、或两者通用；历史四模块默认两者通用。
ALTER TABLE contract_modules
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all'
  CHECK (scope IN ('contract', 'order', 'all'));
UPDATE contract_modules SET scope='all' WHERE scope IS NULL;

-- 网关查询库使用只读角色；角色在开发环境不存在时不阻断迁移。
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jinguan_readonly') THEN
    GRANT SELECT ON contract_manual_reviews TO jinguan_readonly;
  END IF;
END $$;
