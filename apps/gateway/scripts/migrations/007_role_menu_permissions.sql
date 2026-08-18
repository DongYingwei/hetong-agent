-- 角色与菜单的真实授权关系。权限不再保存在浏览器 localStorage。
CREATE TABLE IF NOT EXISTS sys_role_menu_permission (
  role_id INTEGER NOT NULL REFERENCES sys_role(id) ON DELETE CASCADE,
  menu_id INTEGER NOT NULL REFERENCES sys_menu(id) ON DELETE CASCADE,
  create_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, menu_id)
);

-- 补齐当前应用实际使用的菜单；已有菜单不修改、不删除。
INSERT INTO sys_menu (name, type, parent_id, path, permission, sort, status)
SELECT v.name, v.type, COALESCE(parent.id, 0), v.path, v.permission, v.sort, 1
FROM (VALUES
  ('合同管理', '目录', NULL::text, '/contract', '', 1),
  ('合同台账', '菜单', '/contract', '/ledger', 'contract:ledger', 1),
  ('订单台账', '菜单', '/contract', '/orders', 'order:ledger', 2),
  ('综合检索', '菜单', '/contract', '/agent-search', 'contract:search', 3),
  ('关键词管理', '菜单', '/contract', '/keywords', 'contract:keywords', 4),
  ('模块配置', '菜单', '/contract', '/sections', 'contract:sections', 5),
  ('系统管理', '目录', NULL::text, '/system', '', 90),
  ('菜单管理', '菜单', '/system', '/menu', 'system:menu', 1),
  ('首页配置', '菜单', '/system', '/homepage', 'system:homepage', 2),
  ('用户管理', '菜单', '/system', '/users', 'system:users', 3),
  ('角色管理', '菜单', '/system', '/roles', 'system:roles', 4),
  ('部门管理', '菜单', '/system', '/departments', 'system:departments', 5),
  ('我的部门', '菜单', '/system', '/my-department', 'system:my-department', 6),
  ('文件管理', '菜单', '/system', '/files', 'system:files', 7)
) AS v(name, type, parent_path, path, permission, sort)
LEFT JOIN sys_menu parent ON parent.path = v.parent_path AND parent.delete_status = 0
WHERE NOT EXISTS (SELECT 1 FROM sys_menu m WHERE m.path = v.path AND m.delete_status = 0);

-- 现有 admin 角色迁移为拥有全部启用菜单，其他角色由管理员在页面按需分配。
INSERT INTO sys_role_menu_permission (role_id, menu_id)
SELECT r.id, m.id
FROM sys_role r CROSS JOIN sys_menu m
WHERE r.role_code = 'admin' AND r.delete_status = 0 AND m.delete_status = 0 AND m.status = 1
ON CONFLICT DO NOTHING;
