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
