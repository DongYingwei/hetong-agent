-- 订单台账是与合同台账平级的业务菜单，使用独立权限标识。
UPDATE sys_menu
SET permission = 'contract:orders', update_time = now()
WHERE path = '/orders' AND delete_status = 0;

UPDATE sys_menu SET parent_id = 0, update_time = now()
WHERE path = '/orders' AND delete_status = 0;
