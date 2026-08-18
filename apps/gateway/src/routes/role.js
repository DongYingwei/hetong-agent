import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/role' });

/**
 * 获取角色列表 (MySQL 数据库)
 */
router.get('/list', async (ctx) => {
  const sql = 'SELECT * FROM sys_role WHERE delete_status = 0 ORDER BY sort ASC, id ASC';
  const list = await query(sql);
  ctx.success(list);
});

/** 读取角色已分配的真实菜单 ID。 */
router.get('/:id/menus', async (ctx) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) return ctx.fail('角色ID无效', 400);
  const list = await query(
    `SELECT menu_id FROM sys_role_menu_permission WHERE role_id = ? ORDER BY menu_id`,
    [id],
  );
  ctx.success({ menuIds: list.map((row) => Number(row.menu_id)) });
});

/** 覆盖保存角色菜单权限。 */
router.put('/:id/menus', async (ctx) => {
  const id = Number(ctx.params.id);
  const menuIds = [...new Set((ctx.request.body?.menuIds || []).map(Number).filter((item) => Number.isInteger(item) && item > 0))];
  const roles = await query('SELECT id FROM sys_role WHERE id = ? AND delete_status = 0', [id]);
  if (!roles.length) return ctx.fail('角色不存在', 404);
  if (menuIds.length) {
    const menus = await query('SELECT id FROM sys_menu WHERE id = ANY(?::int[]) AND delete_status = 0', [menuIds]);
    if (menus.length !== menuIds.length) return ctx.fail('包含不存在的菜单', 400);
  }
  await query('DELETE FROM sys_role_menu_permission WHERE role_id = ?', [id]);
  for (const menuId of menuIds) {
    await query('INSERT INTO sys_role_menu_permission(role_id, menu_id) VALUES (?, ?)', [id, menuId]);
  }
  ctx.success({ roleId: id, menuIds }, '权限已保存');
});

/**
 * 创建角色
 */
router.post('/create', async (ctx) => {
  const { roleCode, roleName, permKey, sort = 1, status = 1 } = ctx.request.body;
  if (!roleCode || !roleName) {
    return ctx.fail('角色编号与角色名称不能为空');
  }

  await query(
    'INSERT INTO sys_role (role_code, role_name, perm_key, sort, status) VALUES (?, ?, ?, ?, ?)',
    [roleCode, roleName, permKey, sort, status]
  );
  ctx.success(null, '角色创建成功');
});

/**
 * 修改角色
 */
router.put('/update', async (ctx) => {
  const { id, roleCode, roleName, permKey, sort, status } = ctx.request.body;
  if (!id) {
    return ctx.fail('角色ID不能为空');
  }

  await query(
    'UPDATE sys_role SET role_code = ?, role_name = ?, perm_key = ?, sort = ?, status = ? WHERE id = ?',
    [roleCode, roleName, permKey, sort, status, id]
  );
  ctx.success(null, '角色更新成功');
});

/**
 * 软删除角色
 */
router.delete('/delete/:id', async (ctx) => {
  const id = ctx.params.id;
  await query('UPDATE sys_role SET delete_status = 1 WHERE id = ?', [id]);
  ctx.success(null, '角色已软删除');
});

export default router;
