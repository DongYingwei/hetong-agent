-- 真实产品菜单：合同业务入口平级；仅“系统管理”是目录。
UPDATE sys_menu
SET parent_id = 0, update_time = now()
WHERE path IN ('/ledger', '/orders', '/agent-search', '/keywords', '/sections')
  AND delete_status = 0;

-- 历史原型的无效目录及旧路由不再展示，保留记录以便审计。
UPDATE sys_menu
SET delete_status = 1, update_time = now()
WHERE path IN ('/contract', '/contracts', '/system/users', '/system/roles', '/system/menus')
  AND delete_status = 0;
