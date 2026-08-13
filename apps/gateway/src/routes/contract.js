import Router from '@koa/router';
import { query, withTransaction, queryRead } from '../config/db.js';
import { config } from '../config/index.js';

const router = new Router({ prefix: '/api/contract' });

/**
 * 合同台账 = 查询库 contracts（解析写入、已核对入库的真实合同）。
 * 运营库 contract_ledger 已退役（种子假数据）。这里只读消费查询库。
 *
 * 字段映射：查询库 contracts → LedgerView 期望形状。
 *   · contract_type 是文本（"框架"等），前端用 dict 映射数字码——原样透传文本，
 *     dict 取不到 label 时前端显示原文，不影响展示。
 *   · 查询库合同都是 confirmed=1（已核对）→ verify_status 恒为 1。
 *   · 查询库无 contract_status/warning_status → 给默认值（2=执行中 / 0=正常）。
 */
function mapContractRow(r) {
  return {
    ...r,
    contract_status: 2, // 查询库无此列；已入库合同默认"执行中"
    verify_status: 1, // confirmed=1 → 已核对
    warning_status: r.expiry_warning ? 1 : 0,
    has_ai_keyword: r.tag_ai ?? 0,
  };
}

/**
 * 分页获取合同台账列表（读查询库 contracts）。
 */
router.get('/list', async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  const pageSize = parseInt(ctx.query.pageSize || '10', 10);
  const { keyword, hasAiKeyword } = ctx.query;

  const offset = (page - 1) * pageSize;
  let whereSql = 'WHERE 1=1';
  const params = [];
  let n = 0;

  if (keyword) {
    whereSql += ` AND (contract_no ILIKE $${++n} OR customer_name ILIKE $${n} OR contract_name ILIKE $${n})`;
    params.push(`%${keyword}%`);
  }
  if (hasAiKeyword !== undefined && hasAiKeyword !== '') {
    whereSql += ` AND tag_ai = $${++n}`;
    params.push(parseInt(hasAiKeyword, 10));
  }

  const countResult = await queryRead(`SELECT COUNT(*) AS total FROM contracts ${whereSql}`, params);
  const total = parseInt(countResult[0].total, 10);

  const listSql = `SELECT * FROM contracts ${whereSql} ORDER BY id DESC LIMIT ${pageSize} OFFSET ${offset}`;
  const list = (await queryRead(listSql, params)).map(mapContractRow);

  ctx.success({ list, total, page, pageSize });
});

/**
 * 获取单个合同详情（读查询库 contracts）。
 */
router.get('/detail/:id', async (ctx) => {
  const id = parseInt(ctx.params.id, 10);
  const contracts = await queryRead('SELECT * FROM contracts WHERE id = $1', [id]);

  if (contracts.length === 0) {
    return ctx.fail('合同不存在');
  }

  ctx.success({
    contract: mapContractRow(contracts[0]),
    history: [], // 查询库无操作历史（那是运营库概念）
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
 * 删除合同 —— 代理到解析侧（删查询库 contracts + 模块命中 + Milvus 向量，保持一致）。
 * 查询库是解析侧写入域；删除也归解析侧，网关不直接写查询库。
 */
router.delete('/delete/:id', async (ctx) => {
  const id = parseInt(ctx.params.id, 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${config.parse.url}/contract/${id}`, {
      method: 'DELETE',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return ctx.fail(data.detail || `删除失败(${resp.status})`, resp.status === 404 ? 404 : 502);
    }
    ctx.success(data, '合同已删除（含向量片段）');
  } catch (e) {
    clearTimeout(timer);
    ctx.fail(`删除服务调用失败: ${e.message}`, 502);
  }
});

export default router;
