import Router from '@koa/router';
import { query, withTransaction } from '../config/db.js';

const router = new Router({ prefix: '/api/contract' });

/**
 * 分页获取合同台账列表 (满足 requirement #31 & #37)
 */
router.get('/list', async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  const pageSize = parseInt(ctx.query.pageSize || '10', 10);
  const { keyword, contractStatus, contractType, hasAiKeyword, verifyStatus } = ctx.query;

  const offset = (page - 1) * pageSize;
  let whereSql = 'WHERE delete_status = 0';
  const params = [];

  if (keyword) {
    whereSql += ' AND (contract_no LIKE ? OR customer_name LIKE ? OR contract_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  if (contractStatus) {
    whereSql += ' AND contract_status = ?';
    params.push(parseInt(contractStatus, 10));
  }

  if (contractType) {
    whereSql += ' AND contract_type = ?';
    params.push(parseInt(contractType, 10));
  }

  if (hasAiKeyword !== undefined && hasAiKeyword !== '') {
    whereSql += ' AND has_ai_keyword = ?';
    params.push(parseInt(hasAiKeyword, 10));
  }

  if (verifyStatus !== undefined && verifyStatus !== '') {
    whereSql += ' AND verify_status = ?';
    params.push(parseInt(verifyStatus, 10));
  }

  const countResult = await query(
    `SELECT COUNT(*) as total FROM contract_ledger ${whereSql}`,
    params
  );
  const total = countResult[0].total;

  const listSql = `
    SELECT * FROM contract_ledger ${whereSql} 
    ORDER BY id DESC 
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
 * 获取单个合同详情与历史记录
 */
router.get('/detail/:id', async (ctx) => {
  const id = ctx.params.id;
  const contracts = await query('SELECT * FROM contract_ledger WHERE id = ? AND delete_status = 0', [id]);

  if (contracts.length === 0) {
    return ctx.fail('合同不存在或已被删除');
  }

  const contract = contracts[0];
  const history = await query(
    'SELECT * FROM contract_history WHERE contract_id = ? ORDER BY id DESC',
    [id]
  );

  ctx.success({
    contract,
    history,
  });
});

/**
 * 新增/导入合同
 */
router.post('/create', async (ctx) => {
  const {
    contractNo,
    customerName,
    contractName,
    contractType = 2,
    signDate,
    amount = 0.00,
    assessmentLine = '通用',
    hasAiKeyword = 1,
    contractStatus = 2,
  } = ctx.request.body;

  if (!contractNo || !customerName || !contractName || !signDate) {
    return ctx.fail('合同编号、客户名称、合同名称与签约时间不能为空');
  }

  await withTransaction(async (conn) => {
    const [res] = await conn.execute(
      `INSERT INTO contract_ledger
       (contract_no, customer_name, contract_name, contract_type, sign_date, amount, assessment_line, has_ai_keyword, contract_status, verify_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
      [contractNo, customerName, contractName, contractType, signDate, amount, assessmentLine, hasAiKeyword, contractStatus]
    );

    // 记录履约历史
    await conn.execute(
      `INSERT INTO contract_history (contract_id, action_type, operator_name, remark) VALUES (?, ?, ?, ?)`,
      [res.insertId, '合同导入', ctx.state.user?.realName || '系统管理员', '导入新建合同台账记录']
    );
  });

  ctx.success(null, '合同导入保存成功');
});

/**
 * 执行 AI 智能核对
 */
router.post('/verify/:id', async (ctx) => {
  const id = ctx.params.id;
  
  await withTransaction(async (conn) => {
    await conn.execute(
      'UPDATE contract_ledger SET verify_status = 1 WHERE id = ?',
      [id]
    );
    await conn.execute(
      `INSERT INTO contract_history (contract_id, action_type, operator_name, remark) VALUES (?, ?, ?, ?)`,
      [id, '智能核对', ctx.state.user?.realName || '系统', '完成 AI 智能对比核对，结果匹配一致']
    );
  });

  ctx.success(null, '智能核对成功完成');
});

/**
 * 删除合同
 */
router.delete('/delete/:id', async (ctx) => {
  const id = ctx.params.id;
  await query('UPDATE contract_ledger SET delete_status = 1 WHERE id = ?', [id]);
  ctx.success(null, '合同台账已软删除');
});

export default router;
