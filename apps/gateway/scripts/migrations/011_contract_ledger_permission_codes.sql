-- 合同与订单台账使用可独立分配的精确权限标识。
UPDATE sys_menu SET permission = 'contract:ledger', update_time = now()
WHERE path = '/ledger' AND delete_status = 0;

UPDATE sys_menu SET permission = 'contract:orders', update_time = now()
WHERE path = '/orders' AND delete_status = 0;
