import Router from '@koa/router';
import { config } from '../config/index.js';

// 关键词是合同解析规则的一部分，必须由 contracts 库的解析服务管理；
// 这里仅做网关鉴权后的 HTTP 转发，避免运营库 mock 与真实台账脱节。
const router = new Router({ prefix: '/api/keyword' });

async function forward(ctx, path, options = {}) {
  const response = await fetch(`${config.parse.url}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return ctx.fail(data.detail || `关键词服务失败(${response.status})`, 502);
  ctx.success(data, options.method === 'GET' || !options.method ? '成功' : '操作成功');
}

router.get('/list', async (ctx) => {
  const response = await fetch(`${config.parse.url}/keyword-config`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return ctx.fail(data.detail || '读取关键词失败', 502);
  const page = Number(ctx.query.page || 1);
  const pageSize = Number(ctx.query.pageSize || 10);
  const needle = String(ctx.query.keyword || '').trim().toLowerCase();
  const status = ctx.query.status === '' || ctx.query.status === undefined ? undefined : Number(ctx.query.status);
  let list = data.list || [];
  if (needle) list = list.filter((x) => x.keyword_name.toLowerCase().includes(needle));
  if (status !== undefined) list = list.filter((x) => x.status === status);
  ctx.success({ list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize });
});

router.post('/create', async (ctx) => forward(ctx, '/keyword-config', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ctx.request.body || {}),
}));
router.put('/update', async (ctx) => {
  const body = ctx.request.body || {};
  if (!body.id) return ctx.fail('ID不能为空', 400);
  return forward(ctx, `/keyword-config/${body.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
});
router.delete('/delete/:id', async (ctx) => forward(ctx, `/keyword-config/${ctx.params.id}`, { method: 'DELETE' }));
router.post('/sub/add', async (ctx) => {
  const body = ctx.request.body || {};
  if (!body.keyword_id) return ctx.fail('关键词ID不能为空', 400);
  return forward(ctx, `/keyword-config/${body.keyword_id}/terms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
});
router.post('/sub/remove', async (ctx) => {
  const body = ctx.request.body || {};
  if (!body.keyword_id || !body.sub_word) return ctx.fail('参数不完整', 400);
  return forward(ctx, `/keyword-config/${body.keyword_id}/terms/${encodeURIComponent(body.sub_word)}`, { method: 'DELETE' });
});
router.post('/rescan', async (ctx) => forward(ctx, '/contracts/rescan-keywords', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ctx.request.body || {}),
}));

export default router;
