-- 订单每日增量同步：来源快照与人工字段覆盖分层。
-- sys_order 继续是页面/检索唯一读模型；本表只保存 EPMS 最新来源值和人工修改意图。
BEGIN;

CREATE TABLE IF NOT EXISTS order_sync_sources (
  order_id BIGINT PRIMARY KEY REFERENCES sys_order(id) ON DELETE CASCADE,
  source_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_uuid TEXT,
  source_audit_time TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_field_overrides (
  order_id BIGINT NOT NULL REFERENCES sys_order(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  manual_value JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_order_field_overrides_order ON order_field_overrides(order_id);

COMMENT ON TABLE order_sync_sources IS 'EPMS 最新来源快照，供增量同步比较和人工修改回退';
COMMENT ON TABLE order_field_overrides IS '订单人工编辑的字段级保护；每日 EPMS 同步不得覆盖';

COMMIT;
