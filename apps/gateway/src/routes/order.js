import Router from '@koa/router';
import { query } from '../config/db.js';

const router = new Router({ prefix: '/api/order' });

async function attachModuleHits(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((x) => x.id);
  const hits = await query(`SELECT order_id,module_key,hit,keywords,raw_text FROM order_module_hits
                            WHERE order_id = ANY($1::bigint[]) ORDER BY order_id,module_key`, [ids]);
  const byOrder = new Map();
  for (const hit of hits) byOrder.set(hit.order_id, [...(byOrder.get(hit.order_id) || []), hit]);
  return rows.map((row) => ({ ...row, ...(row.manual_values || {}), has_ai_keyword: row.tag_ai ?? 0, module_hits: byOrder.get(row.id) || [] }));
}

/** 真实 EPMS 订单台账；不再以演示订单兜底，空库即返回空列表。 */
router.get('/list', async (ctx) => {
  const page = Math.max(parseInt(ctx.query.page || '1', 10), 1);
  const pageSize = Math.min(Math.max(parseInt(ctx.query.pageSize || '10', 10), 1), 200);
  const { keyword = '', roleAi = '', serviceAi = '', techAi = '', staffAi = '' } = ctx.query;
  const params = [];
  let where = 'WHERE delete_status=0';
  if (keyword.trim()) {
    params.push(`%${keyword.trim()}%`); const n = params.length;
    where += ` AND (order_no ILIKE $${n} OR order_name ILIKE $${n} OR project_no ILIKE $${n} OR customer_name ILIKE $${n})`;
  }
  for (const [moduleKey, enabled] of [['role', roleAi], ['service', serviceAi], ['tech', techAi], ['staff', staffAi]]) {
    if (String(enabled) === '1') {
      params.push(moduleKey);
      where += ` AND EXISTS (SELECT 1 FROM order_module_hits omh WHERE omh.order_id=sys_order.id AND omh.module_key=$${params.length} AND omh.hit=1)`;
    }
  }
  const [{ total }] = await query(`SELECT COUNT(*)::int AS total FROM sys_order ${where}`, params);
  const list = await query(`SELECT sys_order.*, omo.values AS manual_values FROM sys_order
    LEFT JOIN order_manual_overrides omo ON omo.order_id=sys_order.id ${where}
    ORDER BY sys_order.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
  ctx.success({ list: await attachModuleHits(list), total, page, pageSize });
});

router.get('/detail/:id', async (ctx) => {
  const rows = await query(`SELECT sys_order.*, omo.values AS manual_values FROM sys_order
    LEFT JOIN order_manual_overrides omo ON omo.order_id=sys_order.id
    WHERE sys_order.id=? AND sys_order.delete_status=0`, [parseInt(ctx.params.id, 10)]);
  if (!rows.length) return ctx.fail('订单不存在', 404);
  ctx.success((await attachModuleHits(rows))[0]);
});

/** 订单 AI 关键词来自附件扫描，前端不得写成演示值。 */
router.post('/update-keywords', async (ctx) => ctx.fail('订单 AI 关键词由附件解析任务生成，不能在页面直接修改', 409));

/** 人工编辑仅形成覆盖层，EPMS 下次同步不会覆盖人工确认的展示值。 */
router.put('/detail/:id', async (ctx) => {
  const id = Number(ctx.params.id);
  // 人工编辑写入覆盖层，允许修改所有台账业务字段；主键、EPMS 来源标识及 AI 解析结果仍只读。
  const allowed = new Set([
    'order_no', 'project_no', 'project_name', 'detail_project_no', 'customer_order_no', 'order_name', 'contract_no',
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
  await query(`INSERT INTO order_manual_overrides(order_id,values,updated_by,updated_at)
    VALUES ($1,$2::jsonb,$3,now())
    ON CONFLICT(order_id) DO UPDATE SET values=order_manual_overrides.values || EXCLUDED.values,
      updated_by=EXCLUDED.updated_by, updated_at=now()`, [id, JSON.stringify(values), ctx.state.user?.username || 'web-order-edit']);
  ctx.success({ id, values }, '订单人工修改已保存');
});

export default router;
