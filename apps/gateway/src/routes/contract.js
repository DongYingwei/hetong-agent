import Router from '@koa/router';
import { Readable } from 'node:stream';
import { queryRead } from '../config/db.js';
import { config } from '../config/index.js';
import { mapContractLedgerRow } from '../services/contractLedgerMapping.js';

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
 *   · 合同状态直接使用审核台账原值；空值不再伪造为旧演示页的数字状态。
 */
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
  return rows.map((row) => ({ ...mapContractLedgerRow(row), module_hits: byContract.get(row.id) || [] }));
}

/**
 * 未核对合同在台账中展示其持久任务状态；它们不属于 contracts 查询集合，
 * 因而不会进入综合检索、金额统计或导出。
 */
async function listUnconfirmedParseJobs() {
  const rows = await queryRead(`SELECT j.id,j.status,j.progress,j.current_file,j.error_message,j.draft_id,j.created_at,
      d.contract_name,cp.primary_source_path
    FROM contract_parse_jobs j
    JOIN contract_packages cp ON cp.id=j.package_id
    LEFT JOIN contracts_draft d ON d.id=j.draft_id
    WHERE j.status IN ('queued','running','succeeded','failed')
      -- 人工核对后 contract_packages 已关联正式合同；此时只应展示正式台账行，
      -- 不能继续把历史解析任务混入列表造成同一合同重复。
      AND cp.contract_id IS NULL
    ORDER BY j.created_at DESC`);
  return rows.map((job) => ({
    id: -Number(job.id),
    parse_job_id: Number(job.id),
    draft_id: job.draft_id,
    // 草稿尚未人工确认，文件名不能被误填为合同号。
    contract_no: '',
    customer_name: '—', contract_name: parseJobContractName(job), contract_type: '',
    sign_date: null, amount: null, assessment_line: '—', status: '—',
    expiry_warning: 0, tag_ai: 0, confirmed: 0,
    review_status: job.status === 'failed' ? 2 : job.status === 'succeeded' ? 0 : 3,
    parse_status: job.status, parse_progress: job.progress, parse_error: job.error_message,
  }));
}

function parseJobContractName(job) {
  const extracted = String(job.contract_name || '').trim();
  if (extracted && !extracted.startsWith('DRAFT-')) return extracted;
  const raw = String(job.current_file || job.primary_source_path || '').trim();
  const base = raw.split(/[\\/]/).filter(Boolean).pop() || '';
  return base.replace(/\.(pdf|docx|doc)$/i, '') || '合同解析任务';
}

/** 查询库中启用的合同模块；运营库旧 contract_section 不参与真实合同检索。 */
router.get('/modules', async (ctx) => {
  const modules = await queryRead(
    `SELECT module_key, name, anchor_names, recognition_rule, sort_order, scope
       FROM contract_modules
      WHERE enabled = TRUE AND scope IN ('contract', 'all')
      ORDER BY sort_order, module_key`,
  );
  ctx.success({ list: modules });
});

/**
 * 分页获取合同台账列表（读查询库 contracts）。
 */
router.get('/list', async (ctx) => {
  const page = parseInt(ctx.query.page || '1', 10);
  const pageSize = parseInt(ctx.query.pageSize || '10', 10);
  const { keyword, hasAiKeyword, moduleKey, moduleKeyword, verifyStatus, contractStatus, contractType,
    moduleFilters = '', includeParseJobs = '' } = ctx.query;

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
  if (contractStatus) { whereSql += ` AND contracts.status = $${++n}`; params.push(String(contractStatus)); }
  if (contractType) { whereSql += ` AND contracts.contract_type = $${++n}`; params.push(String(contractType)); }
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
  let parsedModuleFilters = [];
  if (moduleFilters) {
    try {
      parsedModuleFilters = JSON.parse(String(moduleFilters));
    } catch {
      ctx.throw(400, '模块筛选参数格式错误');
    }
    if (!Array.isArray(parsedModuleFilters)) ctx.throw(400, '模块筛选参数格式错误');
  }
  const requestedModuleKeys = parsedModuleFilters
    .map((filter) => String(filter?.module_key || '').trim())
    .filter(Boolean);
  if (requestedModuleKeys.length) {
    const eligibleModules = await queryRead(
      `SELECT module_key FROM contract_modules
        WHERE enabled = TRUE AND scope IN ('contract', 'all')
          AND module_key = ANY($1::text[])`,
      [requestedModuleKeys],
    );
    const eligibleKeys = new Set(eligibleModules.map((module) => module.module_key));
    if (requestedModuleKeys.some((moduleKey) => !eligibleKeys.has(moduleKey))) {
      ctx.throw(400, '筛选模块不存在、已停用或不适用于合同');
    }
  }
  for (const filter of parsedModuleFilters) {
    const moduleKey = String(filter?.module_key || '').trim();
    const terms = Array.isArray(filter?.keywords)
      ? filter.keywords.map((term) => String(term).trim()).filter(Boolean)
      : [];
    if (!moduleKey) ctx.throw(400, '模块筛选缺少模块标识');
    const conditions = ['cm.contract_id = contracts.id', `cm.module_key = $${++n}`, 'cm.hit = 1'];
    params.push(moduleKey);
    if (terms.length) {
      conditions.push(`cm.keywords ILIKE ANY($${++n}::text[])`);
      params.push(terms.map((term) => `%${term}%`));
    }
    whereSql += ` AND EXISTS (SELECT 1 FROM contract_module_hits cm WHERE ${conditions.join(' AND ')})`;
  }

  const fromSql = 'FROM contracts LEFT JOIN contract_manual_reviews cr ON cr.contract_id=contracts.id';
  const countResult = await queryRead(`SELECT COUNT(*) AS total ${fromSql} ${whereSql}`, params);
  let total = parseInt(countResult[0].total, 10);
  // 解析任务没有正式合同字段；无筛选时按最新优先混入台账，并修正后续分页偏移。
  const showPending = includeParseJobs === '1' && !keyword && !hasAiKeyword && !moduleKey && !moduleKeyword && !verifyStatus
    && !contractStatus && !contractType && !requestedModuleKeys.length;
  const pending = showPending ? await listUnconfirmedParseJobs() : [];
  const globalOffset = (page - 1) * pageSize;
  const pendingOnPage = pending.slice(globalOffset, globalOffset + pageSize);
  const officialOffset = Math.max(0, globalOffset - pending.length);
  const officialLimit = pageSize - pendingOnPage.length;
  const listSql = `SELECT ${CONTRACT_COLUMNS}, COALESCE(cr.status, 0) AS review_status ${fromSql} ${whereSql}
                   ORDER BY contracts.id DESC LIMIT ${officialLimit} OFFSET ${officialOffset}`;
  const rows = [...pendingOnPage, ...await queryRead(listSql, params)];
  total += pending.length;
  const list = await attachModuleHits(rows);

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
