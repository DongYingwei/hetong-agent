-- 当前系统管理仅发布四项：菜单、首页配置、用户、角色。
UPDATE sys_menu
SET delete_status = 1, update_time = now()
WHERE path IN ('/departments', '/my-department', '/files')
  AND delete_status = 0;
