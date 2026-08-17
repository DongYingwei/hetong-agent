import Router from '@koa/router';
import { config } from '../config/index.js';
import { queryRead } from '../config/db.js';

// 合同模块决定真实 Markdown 的段落归属，和关键词一样由解析服务持久化管理。
const router = new Router({ prefix: '/api/section' });

async function modules() {
  const resp = await fetch(`${config.parse.url}/modules`);
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.detail || '读取模块失败');
  return data.list || [];
}

function view(m) {
  return {
    id: m.module_key, section_title: m.name, sub_names: (m.anchor_names || []).join(','),
    rules_desc: m.recognition_rule || '', status: m.enabled ? 1 : 0,
    scope: m.scope || 'all',
  };
}

router.get('/list', async (ctx) => {
  try {
    const page = Number(ctx.query.page || 1), pageSize = Number(ctx.query.pageSize || 10);
    const needle = String(ctx.query.keyword || '').trim().toLowerCase();
    // 列表是只读查询，不应依赖解析服务是否在线；否则点击模块页会因 8100 不可用而失败。
    const rows = await queryRead(`SELECT module_key,name,anchor_names,recognition_rule,enabled,sort_order,scope
                                  FROM contract_modules ORDER BY sort_order,module_key`);
    let list = rows.map((m) => view({
      module_key: m.module_key, name: m.name, anchor_names: m.anchor_names,
      recognition_rule: m.recognition_rule, enabled: m.enabled,
      scope: m.scope,
    }));
    if (needle) list = list.filter((x) => `${x.section_title}${x.sub_names}${x.rules_desc}`.toLowerCase().includes(needle));
    ctx.success({ list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize });
  } catch (e) { ctx.fail(e.message, 502); }
});

router.post('/create', async (ctx) => {
  const resp = await fetch(`${config.parse.url}/modules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ctx.request.body || {}) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return ctx.fail(data.detail || '新增模块失败', 502);
  ctx.success(data, '模块新增成功');
});

router.put('/update', async (ctx) => {
  const body = ctx.request.body || {};
  if (!body.id) return ctx.fail('模块ID不能为空', 400);
  const resp = await fetch(`${config.parse.url}/modules/${encodeURIComponent(body.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return ctx.fail(data.detail || '更新模块失败', 502);
  ctx.success(data, '模块更新成功；历史合同需手动重新扫描关键词才会更新命中结果');
});

export default router;
