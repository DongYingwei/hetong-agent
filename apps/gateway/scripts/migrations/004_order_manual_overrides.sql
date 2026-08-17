-- EPMS 源数据不可被页面编辑直接覆盖。人工改动作为覆盖层保存，后续同步仍保留来源事实。
CREATE TABLE IF NOT EXISTS order_manual_overrides (
  order_id BIGINT PRIMARY KEY REFERENCES sys_order(id) ON DELETE CASCADE,
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
