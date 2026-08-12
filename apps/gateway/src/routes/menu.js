import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/menu' });

/**
 * 获取系统菜单列表 (MySQL 数据库)
 */
router.get('/list', async (ctx) => {
  const sql = 'SELECT * FROM sys_menu WHERE delete_status = 0 ORDER BY sort ASC, id ASC';
  const list = await query(sql);
  ctx.success(list);
});

/**
 * 创建菜单
 */
router.post('/create', async (ctx) => {
  const { name, type = '菜单', parentId = 0, path = '', permission = '', sort = 1, status = 1 } = ctx.request.body;
  if (!name) {
    return ctx.fail('菜单名称不能为空');
  }

  await query(
    'INSERT INTO sys_menu (name, type, parent_id, path, permission, sort, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, type, parentId, path, permission, sort, status]
  );
  ctx.success(null, '菜单创建成功');
});

/**
 * 修改菜单
 */
router.put('/update', async (ctx) => {
  const { id, name, type, parentId, path, permission, sort, status } = ctx.request.body;
  if (!id || !name) {
    return ctx.fail('菜单ID和名称不能为空');
  }

  await query(
    'UPDATE sys_menu SET name = ?, type = ?, parent_id = ?, path = ?, permission = ?, sort = ?, status = ? WHERE id = ?',
    [name, type, parentId, path, permission, sort, status, id]
  );
  ctx.success(null, '菜单更新成功');
});

/**
 * 软删除菜单
 */
router.delete('/delete/:id', async (ctx) => {
  const id = ctx.params.id;
  await query('UPDATE sys_menu SET delete_status = 1 WHERE id = ?', [id]);
  ctx.success(null, '菜单已软删除');
});

export default router;
