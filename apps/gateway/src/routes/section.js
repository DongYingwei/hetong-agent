import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/section' });

/**
 * 分页获取范本模块列表 (一比一还原 demo.html 结构与字段)
 */
router.get('/list', async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  const pageSize = parseInt(ctx.query.pageSize || '10', 10);
  const keyword = ctx.query.keyword || '';
  const offset = (page - 1) * pageSize;

  let whereSql = 'WHERE delete_status = 0';
  const params = [];

  if (keyword) {
    whereSql += ' AND (section_title LIKE ? OR sub_names LIKE ? OR rules_desc LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const countResult = await query(
    `SELECT COUNT(*) as total FROM contract_section ${whereSql}`,
    params
  );
  const total = countResult[0].total;

  const listSql = `
    SELECT * FROM contract_section ${whereSql} 
    ORDER BY id ASC 
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  const list = await query(listSql, params);

  ctx.success({
    list,
    total,
    page,
    pageSize,
  });
});

/**
 * 创建范本模块
 */
router.post('/create', async (ctx) => {
  const { sectionTitle, category = '核心模块', subNames = '', rulesDesc = '', status = 1 } = ctx.request.body;

  if (!sectionTitle) {
    return ctx.fail('模块名称不能为空');
  }

  await query(
    'INSERT INTO contract_section (section_title, category, sub_names, keyword_count, hit_count, rules_desc, status) VALUES (?, ?, ?, 0, 0, ?, ?)',
    [sectionTitle, category, subNames, rulesDesc, status]
  );

  ctx.success(null, '范本模块新增成功');
});

/**
 * 更新范本模块
 */
router.put('/update', async (ctx) => {
  const { id, sectionTitle, category = '核心模块', subNames = '', rulesDesc = '', status = 1 } = ctx.request.body;

  if (!id) {
    return ctx.fail('范本模块ID不能为空');
  }

  await query(
    'UPDATE contract_section SET section_title = ?, category = ?, sub_names = ?, rules_desc = ?, status = ? WHERE id = ?',
    [sectionTitle, category, subNames, rulesDesc, status, id]
  );

  ctx.success(null, '范本模块更新成功');
});

/**
 * 删除范本模块
 */
router.delete('/delete/:id', async (ctx) => {
  const id = ctx.params.id;
  await query('UPDATE contract_section SET delete_status = 1 WHERE id = ?', [id]);
  ctx.success(null, '范本模块已软删除');
});

export default router;
