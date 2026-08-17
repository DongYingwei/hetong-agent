import Router from '@koa/router';
import { Readable } from 'node:stream';
import { query, queryRead } from '../config/db.js';
import { config } from '../config/index.js';

const router = new Router({ prefix: '/api/contract' });

// 台账/详情不传输数十 MB 的 MinerU 原文；原文只在核对页按需由解析服务读取。
const CONTRACT_COLUMNS = `contracts.id, contracts.contract_no, contracts.assessment_line, contracts.bid_no,
  contracts.related_main_no, contracts.framework_alias, contracts.customer_name, contracts.contract_name,
  contracts.customer_contract_no, contracts.signing_entity, contracts.contract_type, contracts.sign_date,
  contracts.start_date, contracts.end_date, contracts.amount_type, contracts.amount, contracts.tax_rate,
  contracts.settlement_terms, contracts.post_eval, contracts.deposit_amount, contracts.deposit_refund,
  contracts.arbitration, contracts.authorizer, contracts.status, contracts.expiry_warning, contracts.tag_ai,
  contracts.sign_year, contracts.sign_quarter, contracts.sign_half, contracts.end_year, contracts.confirmed,
  contracts.confirmed_by, contracts.confirmed_at`;

/**
 * 合同台账 = 查询库 contracts（解析写入、已核对入库的真实合同）。
 * 运营库 contract_ledger 已退役（种子假数据）。这里只读消费查询库。
 *
 * 字段映射：查询库 contracts → LedgerView 期望形状。
 *   · contract_type 是文本（"框架"等），前端用 dict 映射数字码——原样透传文本，
 *     dict 取不到 label 时前端显示原文，不影响展示。
 *   · 正式入库与人工核对独立；verify_status 由 contract_manual_reviews 决定。
 *   · 查询库无 contract_status/warning_status → 给默认值（2=执行中 / 0=正常）。
 */
function mapContractRow(r) {
  return {
    ...r,
    contract_status: 2, // 查询库无此列；已入库合同默认"执行中"
    verify_status: Number(r.review_status || 0),
    warning_status: r.expiry_warning ? 1 : 0,
    has_ai_keyword: r.tag_ai ?? 0,
  };
}

/** 读取合同模块命中，供台账动态列和详情页复用。查询库是唯一事实来源。 */
async function attachModuleHits(rows) {
  if (rows.length === 0) return rows;
  const ids = rows.map((row) => row.id);
  const hits = await queryRead(
    `SELECT contract_id, module_key, hit, keywords, category, raw_text
       FROM contract_module_hits
      WHERE contract_id = ANY($1::bigint[])
      ORDER BY contract_id, module_key`,
    [ids],
  );
  const byContract = new Map();
  for (const hit of hits) {
    const list = byContract.get(hit.contract_id) || [];
    list.push(hit);
    byContract.set(hit.contract_id, list);
  }
  return rows.map((row) => ({ ...mapContractRow(row), module_hits: byContract.get(row.id) || [] }));
}

/** 查询库中启用的合同模块；运营库旧 contract_section 不参与真实合同检索。 */
router.get('/modules', async (ctx) => {
  const modules = await queryRead(
    `SELECT module_key, name, anchor_names, recognition_rule, sort_order, scope
       FROM contract_modules WHERE enabled = TRUE ORDER BY sort_order, module_key`,
  );
  ctx.success({ list: modules });
});

/**
 * 分页获取合同台账列表（读查询库 contracts）。
 */
router.get('/list', async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  const pageSize = parseInt(ctx.query.pageSize || '10', 10);
  const { keyword, hasAiKeyword, moduleKey, moduleKeyword, verifyStatus } = ctx.query;

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
  if (verifyStatus !== undefined && verifyStatus !== '') {
    whereSql += ` AND COALESCE(cr.status, 0) = $${++n}`;
    params.push(parseInt(verifyStatus, 10));
  }
  if (moduleKey) {
    whereSql += ` AND EXISTS (
      SELECT 1 FROM contract_module_hits cmh
       WHERE cmh.contract_id = contracts.id AND cmh.module_key = $${++n} AND cmh.hit = 1`;
    params.push(moduleKey);
    if (moduleKeyword) {
      whereSql += ` AND cmh.keywords ILIKE $${++n}`;
      params.push(`%${moduleKeyword}%`);
    }
    whereSql += ')';
  }

  const fromSql = 'FROM contracts LEFT JOIN contract_manual_reviews cr ON cr.contract_id=contracts.id';
  const countResult = await queryRead(`SELECT COUNT(*) AS total ${fromSql} ${whereSql}`, params);
  const total = parseInt(countResult[0].total, 10);

  const listSql = `SELECT ${CONTRACT_COLUMNS}, COALESCE(cr.status, 0) AS review_status ${fromSql} ${whereSql} ORDER BY contracts.id DESC LIMIT ${pageSize} OFFSET ${offset}`;
  const list = await attachModuleHits(await queryRead(listSql, params));

  ctx.success({ list, total, page, pageSize });
});

/**
 * 获取单个合同详情（读查询库 contracts）。
 */
router.get('/detail/:id', async (ctx) => {
  const id = parseInt(ctx.params.id, 10);
  const contracts = await queryRead(`SELECT ${CONTRACT_COLUMNS}, COALESCE(cr.status,0) AS review_status
    FROM contracts LEFT JOIN contract_manual_reviews cr ON cr.contract_id=contracts.id WHERE contracts.id = $1`, [id]);

  if (contracts.length === 0) {
    return ctx.fail('合同不存在');
  }

  const [contract] = await attachModuleHits(contracts);
  ctx.success({
    contract,
    history: [], // 查询库无操作历史（那是运营库概念）
  });
});

/** 命中证据及人工覆盖由解析服务写查询库；网关不直接越权写。 */
router.get('/:id/keyword-hits', async (ctx) => {
  const resp = await fetch(`${config.parse.url}/contract/${ctx.params.id}/keyword-hits`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return ctx.fail(data.detail || '读取关键词命中失败', 502);
  ctx.success(data);
});

/** 原始 PDF 仍留在合同数据目录；由解析服务按合同—源文件关联安全读取。 */
router.get('/:id/original-pdf', async (ctx) => {
  const sourceId = ctx.query.sourceId ? `?source_id=${encodeURIComponent(ctx.query.sourceId)}` : '';
  const resp = await fetch(`${config.parse.url}/contract/${ctx.params.id}/original-pdf${sourceId}`);
  if (!resp.ok || !resp.body) {
    const data = await resp.json().catch(() => ({}));
    return ctx.fail(data.detail || '未找到合同原始 PDF', resp.status === 404 ? 404 : 502);
  }
  ctx.status = 200;
  ctx.set('Content-Type', resp.headers.get('content-type') || 'application/pdf');
  const length = resp.headers.get('content-length');
  if (length) ctx.set('Content-Length', length);
  const disposition = resp.headers.get('content-disposition');
  if (disposition) ctx.set('Content-Disposition', disposition);
  ctx.body = Readable.fromWeb(resp.body);
});

router.get('/:id/source-files', async (ctx) => {
  const resp = await fetch(`${config.parse.url}/contract/${ctx.params.id}/source-files`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return ctx.fail(data.detail || '读取合同附件失败', 502);
  ctx.success(data);
});

router.put('/:id/keyword-overrides', async (ctx) => {
  const resp = await fetch(`${config.parse.url}/contract/${ctx.params.id}/keyword-overrides`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(ctx.request.body || {}), updated_by: ctx.state.user?.username || 'web-verify' }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return ctx.fail(data.detail || '保存关键词核对失败', 502);
  ctx.success(data, '关键词核对已保存');
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
  const resp = await fetch(`${config.parse.url}/contract/${ctx.params.id}/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewed_by: ctx.state.user?.username || 'web-verify' }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return ctx.fail(data.detail || '保存核对状态失败', resp.status === 404 ? 404 : 502);
  ctx.success(data, '合同已标记为已核对');
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
