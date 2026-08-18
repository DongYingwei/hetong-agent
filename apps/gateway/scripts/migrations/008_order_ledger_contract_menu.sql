-- 订单台账是与合同台账平级的业务菜单，但归入合同管理权限范围。
UPDATE sys_menu
SET permission = 'contract:*', update_time = now()
WHERE path = '/orders' AND delete_status = 0;

UPDATE sys_menu SET parent_id = 0, update_time = now()
WHERE path = '/orders' AND delete_status = 0;
