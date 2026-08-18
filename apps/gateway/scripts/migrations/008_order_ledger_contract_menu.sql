-- 订单台账归属“合同管理”，与合同台账共用合同管理权限字符。
UPDATE sys_menu
SET permission = 'contract:*', update_time = now()
WHERE path = '/orders' AND delete_status = 0;

-- 修复早期菜单数据中订单未挂到合同管理目录的情况。
UPDATE sys_menu child
SET parent_id = parent.id, update_time = now()
FROM sys_menu parent
WHERE child.path = '/orders'
  AND child.delete_status = 0
  AND parent.path = '/contract'
  AND parent.delete_status = 0
  AND child.parent_id IS DISTINCT FROM parent.id;
