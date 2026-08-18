-- 合同管理员只拥有合同业务菜单，不拥有系统管理菜单。
INSERT INTO sys_role_menu_permission (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r JOIN sys_menu m ON m.path IN ('/ledger', '/orders', '/agent-search', '/keywords', '/sections')
WHERE r.role_code = 'contract_manager' AND r.delete_status = 0 AND m.delete_status = 0
ON CONFLICT DO NOTHING;
