import Router from '@koa/router';
import { query } from '../config/db.js';
import { config } from '../config/index.js';

const router = new Router({ prefix: '/api/order' });

async function attachModuleHits(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((x) => x.id);
  const hits = await query(`SELECT order_id,module_key,hit,keywords,raw_text FROM order_module_hits
                            WHERE order_id = ANY($1::bigint[]) ORDER BY order_id,module_key`, [ids]);
  const byOrder = new Map();
  for (const hit of hits) byOrder.set(hit.order_id, [...(byOrder.get(hit.order_id) || []), hit]);
  return rows.map((row) => ({ ...row, has_ai_keyword: row.tag_ai ?? 0, module_hits: byOrder.get(row.id) || [] }));
}

/** 真实 EPMS 订单台账；不再以演示订单兜底，空库即返回空列表。 */
router.get('/list', async (ctx) => {
  const page = Math.max(parseInt(ctx.query.page || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(ctx.query.pageSize || '10', 10), 1), 200);
  const { keyword = '', moduleFilters = '' } = ctx.query;
  const params = [];
  let where = 'WHERE delete_status=0';
  if (keyword.trim()) {
    params.push(`%${keyword.trim()}%`); const n = params.length;
    where += ` AND (order_no ILIKE $${n} OR order_name ILIKE $${n} OR project_no ILIKE $${n} OR customer_name ILIKE $${n})`;
  }
  let filters = [];
  if (moduleFilters) { try { filters = JSON.parse(String(moduleFilters)); } catch { ctx.throw(400, '模块筛选参数格式错误'); } }
  if (!Array.isArray(filters)) ctx.throw(400, '模块筛选参数格式错误');
  for (const filter of filters) {
    const moduleKey = String(filter?.module_key || '').trim(); const terms = Array.isArray(filter?.keywords) ? filter.keywords.map((x) => String(x).trim()).filter(Boolean) : [];
    if (!moduleKey) ctx.throw(400, '模块筛选缺少模块标识');
    params.push(moduleKey); const conditions = ['omh.order_id = sys_order.id', `omh.module_key = $${params.length}`, 'omh.hit = 1'];
    if (terms.length) { params.push(terms.map((term) => `%${term}%`)); conditions.push(`omh.keywords ILIKE ANY($${params.length}::text[])`); }
    where += ` AND EXISTS (SELECT 1 FROM order_module_hits omh WHERE ${conditions.join(' AND ')})`;
  }
  const [{ total }] = await query(`SELECT COUNT(*)::int AS total FROM sys_order ${where}`, params);
  const list = await query(`SELECT sys_order.* FROM sys_order
    ${where}
    ORDER BY sys_order.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  ctx.success({ list: await attachModuleHits(list), total, page, pageSize });
});

router.get('/detail/:id', async (ctx) => {
  const rows = await query(`SELECT sys_order.* FROM sys_order
    WHERE sys_order.id=? AND sys_order.delete_status=0`, [parseInt(ctx.params.id, 10)]);
  if (!rows.length) return ctx.fail('订单不存在', 404);
  ctx.success((await attachModuleHits(rows))[0]);
});

async function enabledKeywordNames() {
  const response = await fetch(`${config.parse.url}/keyword-config`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || '读取关键词管理失败');
  return new Set((data.list || []).filter((item) => Number(item.status) === 1).map((item) => String(item.keyword_name)));
}

function comparableSourceValue(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).trim();
}

/**
 * 人工编辑写入 sys_order，同时记录字段级覆盖意图。
 * 每日 EPMS 同步只更新没有覆盖记录的字段；用户填回来源值时会自动取消覆盖。
 */
router.put('/detail/:id', async (ctx) => {
  const id = Number(ctx.params.id);
  // 订单编号是增量同步的业务键，不能在页面改写；主键和 EPMS 内部来源标识同样不可编辑。
  const allowed = new Set([
    'project_no', 'project_name', 'detail_project_no', 'customer_order_no', 'order_name', 'contract_no',
    'customer_name', 'assessment_line', 'customer_line', 'customer_type', 'settlement_type', 'order_type', 'order_attr',
    'salesperson', 'customer_contract_no', 'customer_service_target', 'customer_pm', 'customer_order_name',
    'created_date', 'accepted_date', 'start_date', 'end_date', 'est_invoice_date', 'order_status', 'tax_rate', 'amount',
    'amount_ex_tax', 'detail_order_no', 'customer_detail_order_no', 'redemption_days', 'is_last_order', 'detail_tax_rate',
    'detail_amount', 'detail_amount_ex_tax', 'deduct_amount', 'deduct_amount_ex_tax', 'stop_invoice_amount',
    'stop_invoice_amount_ex_tax', 'confirmed_income_amount', 'confirmed_income_amount_ex_tax', 'unconfirmed_income_amount',
    'unconfirmed_income_amount_ex_tax', 'invoiced_amount', 'invoiced_amount_ex_tax', 'returned_amount',
    'returned_amount_ex_tax', 'invoiced_unreturned_amount', 'invoiced_unreturned_amount_ex_tax', 'region', 'province',
    'city', 'delivery_list', 'income_confirmed', 'maker', 'make_time', 'detail_maker', 'detail_make_time', 'updater',
    'update_time', 'auditor', 'audit_time', 'has_attachment', 'latest_attachment_time', 'attachment_count', 'has_eml',
  ]);
  const values = Object.fromEntries(Object.entries(ctx.request.body || {}).filter(([key, value]) => allowed.has(key) && value !== undefined));
  if (!Object.keys(values).length) return ctx.fail('没有可保存的编辑字段', 400);
  const exists = await query('SELECT id FROM sys_order WHERE id=? AND delete_status=0', [id]);
  if (!exists.length) return ctx.fail('订单不存在', 404);
  const fields = Object.keys(values);
  const assignments = fields.map((field, index) => `${field}=$${index + 1}`);
  await query(`UPDATE sys_order SET ${assignments.join(', ')}, updated_at=now() WHERE id=$${fields.length + 1}`,
    [...fields.map((field) => values[field]), id]);
  const sourceRows = await query('SELECT source_values FROM order_sync_sources WHERE order_id=?', [id]);
  const sourceValues = sourceRows[0]?.source_values || {};
  const username = ctx.state.user?.username || 'web-order-edit';
  for (const field of fields) {
    const sourceValue = sourceValues[field];
    if (Object.prototype.hasOwnProperty.call(sourceValues, field)
      && comparableSourceValue(values[field]) === comparableSourceValue(sourceValue)) {
      await query('DELETE FROM order_field_overrides WHERE order_id=? AND field_name=?', [id, field]);
    } else {
      await query(`INSERT INTO order_field_overrides(order_id,field_name,manual_value,updated_by)
        VALUES ($1,$2,$3::jsonb,$4)
        ON CONFLICT(order_id,field_name) DO UPDATE SET manual_value=EXCLUDED.manual_value,
          updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [id, field, JSON.stringify(values[field]), username]);
    }
  }
  // 旧覆盖层已退役；仅清理历史残留，不参与任何新同步逻辑。
  await query('DELETE FROM order_manual_overrides WHERE order_id=?', [id]);
  ctx.success({ id, values }, '订单修改已保存');
});

/** 订单关键词解析与合同一致：只能选关键词管理中的启用父关键词，保存后即时重算 tag_ai。 */
router.put('/detail/:id/module-hits', async (ctx) => {
  const id = Number(ctx.params.id);
  const rows = Array.isArray(ctx.request.body?.module_hits) ? ctx.request.body.module_hits : null;
  if (!rows) return ctx.fail('module_hits 必须为数组', 400);
  const validKeys = new Set(['role', 'service', 'tech', 'staff']);
  const normalized = new Map();
  for (const row of rows) {
    const moduleKey = String(row?.module_key || '').trim();
    if (!validKeys.has(moduleKey)) return ctx.fail(`不支持的模块：${moduleKey}`, 400);
    const keywords = [...new Set((Array.isArray(row?.keywords) ? row.keywords : [])
      .map((item) => String(item || '').trim()).filter(Boolean))];
    normalized.set(moduleKey, keywords);
  }
  const exists = await query('SELECT id FROM sys_order WHERE id=? AND delete_status=0', [id]);
  if (!exists.length) return ctx.fail('订单不存在', 404);
  let allowedKeywords;
  try { allowedKeywords = await enabledKeywordNames(); } catch (error) { return ctx.fail(error.message, 502); }
  for (const keywords of normalized.values()) {
    const invalid = keywords.find((keyword) => !allowedKeywords.has(keyword));
    if (invalid) return ctx.fail(`关键词“${invalid}”未在关键词管理中启用`, 400);
  }
  for (const moduleKey of validKeys) {
    const keywords = normalized.get(moduleKey) || [];
    await query(`INSERT INTO order_module_hits(order_id,module_key,hit,keywords,raw_text,model_raw)
      VALUES (?,?,?,?,NULL,'manual')
      ON CONFLICT(order_id,module_key) DO UPDATE SET hit=EXCLUDED.hit,keywords=EXCLUDED.keywords,
        model_raw='manual',updated_at=now()`, [id, moduleKey, keywords.length ? 1 : 0, keywords.join(',') || null]);
  }
  const allKeywords = [...normalized.values()].flat();
  await query('UPDATE sys_order SET tag_ai=?, hit_keyword=?, ai_keywords=?::jsonb, updated_at=now() WHERE id=?',
    [allKeywords.length ? 1 : 0, allKeywords.length ? 'AI' : null, JSON.stringify(allKeywords), id]);
  ctx.success({ id, tag_ai: allKeywords.length ? 1 : 0 }, '订单关键词解析结果已保存');
});

export default router;
