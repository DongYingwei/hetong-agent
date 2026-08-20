-- 旧版订单编辑将字段存于 order_manual_overrides JSON 覆盖层。
-- 新版直接以 sys_order 为唯一事实来源；执行一次本迁移，将既有人工编辑写回主表后清除覆盖层。
BEGIN;

DO $$
DECLARE
  column_name TEXT;
BEGIN
  FOR column_name IN
    SELECT a.attname
      FROM pg_attribute a
     WHERE a.attrelid = 'public.sys_order'::regclass
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND a.attname NOT IN ('id', 'created_at', 'updated_at')
  LOOP
    EXECUTE format(
      'UPDATE sys_order AS o
          SET %1$I = (jsonb_populate_record(o, m.values)).%1$I
         FROM order_manual_overrides AS m
        WHERE o.id=m.order_id AND m.values ? %2$L',
      column_name, column_name
    );
  END LOOP;
END $$;

UPDATE sys_order SET updated_at=now()
 WHERE id IN (SELECT order_id FROM order_manual_overrides);
DELETE FROM order_manual_overrides;

COMMIT;
