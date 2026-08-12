import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/homepage' });

/**
 * 获取首页配置列表 (MySQL 数据库)
 */
router.get('/list', async (ctx) => {
  const sql = 'SELECT * FROM sys_homepage_config WHERE delete_status = 0 ORDER BY priority ASC, id DESC';
  const list = await query(sql);
  ctx.success(list);
});

/**
 * 创建首页配置
 */
router.post('/create', async (ctx) => {
  const { relationType = '角色', targetName = '', route = '', component = '', priority = 0, status = 1 } = ctx.request.body;
  if (!route || !component) {
    return ctx.fail('首页路由与组件地址不能为空');
  }

  await query(
    'INSERT INTO sys_homepage_config (relation_type, target_name, route, component, priority, status) VALUES (?, ?, ?, ?, ?, ?)',
    [relationType, targetName, route, component, priority, status]
  );
  ctx.success(null, '首页配置创建成功');
});

/**
 * 修改首页配置
 */
router.put('/update', async (ctx) => {
  const { id, relationType, targetName, route, component, priority, status } = ctx.request.body;
  if (!id) {
    return ctx.fail('配置ID不能为空');
  }

  await query(
    'UPDATE sys_homepage_config SET relation_type = ?, target_name = ?, route = ?, component = ?, priority = ?, status = ? WHERE id = ?',
    [relationType, targetName, route, component, priority, status, id]
  );
  ctx.success(null, '首页配置更新成功');
});

/**
 * 软删除首页配置
 */
router.delete('/delete/:id', async (ctx) => {
  const id = ctx.params.id;
  await query('UPDATE sys_homepage_config SET delete_status = 1 WHERE id = ?', [id]);
  ctx.success(null, '首页配置已软删除');
});

export default router;
