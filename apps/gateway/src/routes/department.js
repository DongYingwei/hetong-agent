import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/department' });

/**
 * 获取部门列表（运营 PostgreSQL 数据库）
 */
router.get('/list', async (ctx) => {
  const sql = 'SELECT * FROM sys_department WHERE delete_status = 0 ORDER BY sort ASC, id ASC';
  const list = await query(sql);
  ctx.success(list);
});

/**
 * 创建部门（保存至运营 PostgreSQL 数据库）
 */
router.post('/create', async (ctx) => {
  let { parentId = 0, parentName = '', deptCode = '', deptName, leader = '', sort = 1, status = 1 } = ctx.request.body;
  if (!deptName) {
    return ctx.fail('部门名称不能为空');
  }

  // 根据 parentName 在数据库中查得 parent_id
  if (parentName && parentName !== '顶级部门' && parentName !== '无' && (!parentId || parentId === 0)) {
    const parentRows = await query('SELECT id FROM sys_department WHERE dept_name = ? AND delete_status = 0 LIMIT 1', [parentName]);
    if (parentRows && parentRows.length > 0) {
      parentId = parentRows[0].id;
    } else {
      parentId = 1; // 默认挂在总公司(1)下方
    }
  }

  if (!deptCode) {
    deptCode = 'A01B' + Math.floor(Math.random() * 80 + 10);
  }

  await query(
    'INSERT INTO sys_department (parent_id, dept_code, dept_name, leader, sort, status) VALUES (?, ?, ?, ?, ?, ?)',
    [parentId, deptCode, deptName, leader, sort, status]
  );
  ctx.success(null, '部门创建成功');
});

/**
 * 修改部门（保存至运营 PostgreSQL 数据库）
 */
router.put('/update', async (ctx) => {
  const { id, parentId = 0, deptCode = '', deptName, leader = '', sort = 1, status = 1 } = ctx.request.body;
  if (!id) {
    return ctx.fail('部门ID不能为空');
  }

  await query(
    'UPDATE sys_department SET parent_id = ?, dept_code = ?, dept_name = ?, leader = ?, sort = ?, status = ? WHERE id = ?',
    [parentId, deptCode, deptName, leader, sort, status, id]
  );
  ctx.success(null, '部门更新成功');
});

/**
 * 软删除部门
 */
router.delete('/delete/:id', async (ctx) => {
  const id = ctx.params.id;
  await query('UPDATE sys_department SET delete_status = 1 WHERE id = ?', [id]);
  ctx.success(null, '部门已软删除');
});

export default router;
