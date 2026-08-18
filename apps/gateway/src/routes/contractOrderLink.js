import Router from '@koa/router';
import { query, queryRead } from '../config/db.js';

const router = new Router({ prefix: '/api/contract-order-links' });

function requireAdmin(ctx) {
  if (Number(ctx.state.user?.role) !== 0) {
    ctx.fail('仅系统管理员可维护合同—订单关联', 403);
    return false;
  }
  return true;
}

async function resolveLink(contractNo, orderNo) {
  const contracts = await queryRead(
    'SELECT id, contract_no, contract_name FROM contracts WHERE contract_no = $1', [contractNo],
  );
  if (contracts.length !== 1) throw new Error(`合同号不存在或不唯一：${contractNo}`);
  const orders = await query(
    'SELECT id, order_no, order_name FROM sys_order WHERE order_no = ? AND delete_status = 0', [orderNo],
  );
  if (orders.length !== 1) throw new Error(`订单编号不存在或不唯一：${orderNo}`);
  return { contract: contracts[0], order: orders[0] };
}

async function saveLink({ contract_no, order_no, status = 'confirmed', note = '', link_method = 'manual' }, username) {
  const contractNo = String(contract_no || '').trim();
  const orderNo = String(order_no || '').trim();
  if (!contractNo || !orderNo) throw new Error('合同号和订单编号不能为空');
  if (!['draft', 'confirmed', 'invalid'].includes(status)) throw new Error('关联状态不合法');
  const { contract, order } = await resolveLink(contractNo, orderNo);
  if (status === 'confirmed') {
    const conflict = await query(
      "SELECT source_contract_no FROM contract_order_links WHERE order_id = ? AND status = 'confirmed' AND contract_id <> ?",
      [order.id, contract.id],
    );
    if (conflict.length) throw new Error(`订单已确认关联至合同：${conflict[0].source_contract_no}`);
  }
  const confirmed = status === 'confirmed';
  const rows = await query(`INSERT INTO contract_order_links
    (contract_id, order_id, source_contract_no, source_order_no, link_method, status, confirmed_by, confirmed_at, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN now() ELSE NULL END, ?)
    ON CONFLICT (contract_id, order_id) DO UPDATE SET
      source_contract_no = EXCLUDED.source_contract_no, source_order_no = EXCLUDED.source_order_no,
      link_method = EXCLUDED.link_method, status = EXCLUDED.status,
      confirmed_by = CASE WHEN EXCLUDED.status = 'confirmed' THEN EXCLUDED.confirmed_by ELSE NULL END,
      confirmed_at = CASE WHEN EXCLUDED.status = 'confirmed' THEN now() ELSE NULL END,
      note = EXCLUDED.note, updated_at = now()
    RETURNING id, status`, [contract.id, order.id, contract.contract_no, order.order_no, link_method, status, username, confirmed, String(note || '')]);
  return { ...rows[0], contract, order };
}

router.get('/list', async (ctx) => {
  const page = Math.max(Number(ctx.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(ctx.query.pageSize || 20), 1), 200);
  const keyword = String(ctx.query.keyword || '').trim();
  const params = []; let where = '';
  if (keyword) { params.push(`%${keyword}%`); where = `WHERE (source_contract_no ILIKE $1 OR source_order_no ILIKE $1)`; }
  const [{ total }] = await query(`SELECT COUNT(*)::int AS total FROM contract_order_links ${where}`, params);
  const links = await query(`SELECT * FROM contract_order_links ${where} ORDER BY updated_at DESC, id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  const ids = [...new Set(links.map((link) => Number(link.contract_id)))];
  const contracts = ids.length ? await queryRead('SELECT id, contract_no, contract_name, contract_type FROM contracts WHERE id = ANY($1::bigint[])', [ids]) : [];
  const byId = new Map(contracts.map((contract) => [String(contract.id), contract]));
  ctx.success({ list: links.map((link) => ({ ...link, contract: byId.get(String(link.contract_id)) || null })), total, page, pageSize });
});

router.post('/', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  try {
    const link = await saveLink(ctx.request.body || {}, ctx.state.user.username);
    ctx.success(link, '关联已保存');
  } catch (error) { ctx.fail(error.message, 400); }
});

router.post('/import', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  const rows = Array.isArray(ctx.request.body?.rows) ? ctx.request.body.rows : [];
  if (!rows.length) return ctx.fail('请提供至少一条关联记录', 400);
  const result = { succeeded: [], failed: [] };
  for (let index = 0; index < rows.length; index += 1) {
    try { result.succeeded.push(await saveLink({ ...rows[index], link_method: 'import' }, ctx.state.user.username)); }
    catch (error) { result.failed.push({ row: index + 1, contract_no: rows[index]?.contract_no, order_no: rows[index]?.order_no, reason: error.message }); }
  }
  ctx.success(result, `导入完成：成功 ${result.succeeded.length} 条，失败 ${result.failed.length} 条`);
});

router.put('/:id/status', async (ctx) => {
  if (!requireAdmin(ctx)) return;
  const current = await query('SELECT * FROM contract_order_links WHERE id = ?', [Number(ctx.params.id)]);
  if (!current.length) return ctx.fail('关联不存在', 404);
  const { status, note } = ctx.request.body || {};
  try {
    const link = await saveLink({ contract_no: current[0].source_contract_no, order_no: current[0].source_order_no, status, note: note ?? current[0].note, link_method: current[0].link_method }, ctx.state.user.username);
    ctx.success(link, '关联状态已更新');
  } catch (error) { ctx.fail(error.message, 400); }
});

export default router;
