import Router from '@koa/router';
import { getKeywordRescanFailures, getKeywordRescanJob, listKeywordRescanJobs, retryKeywordRescanFailures, startKeywordRescan } from '../services/keywordRescanService.js';

const router = new Router({ prefix: '/api/keyword-rescan' });
function canRescan(ctx) { return [0, 2].includes(Number(ctx.state.user?.role)); }
function requireRescanPermission(ctx) { if (!canRescan(ctx)) { ctx.fail('仅系统管理员或合同管理员可启动或重试关键词重扫任务', 403); return false; } return true; }

router.get('/jobs', async (ctx) => ctx.success({ list: await listKeywordRescanJobs() }));
router.get('/jobs/:id', async (ctx) => {
  const job = await getKeywordRescanJob(Number(ctx.params.id));
  if (!job) return ctx.fail('任务不存在', 404);
  ctx.success(job);
});
router.get('/jobs/:id/failures', async (ctx) => ctx.success({ list: await getKeywordRescanFailures(Number(ctx.params.id)) }));
router.post('/jobs', async (ctx) => {
  if (!requireRescanPermission(ctx)) return;
  const body = ctx.request.body || {};
  const scope = ['contract', 'order', 'all'].includes(body.scope) ? body.scope : 'all';
  const result = await startKeywordRescan({ scope, overwriteManual: Boolean(body.overwrite_manual), requestedBy: ctx.state.user.username });
  ctx.success(result, result.existing ? '已有关键词重扫任务正在执行' : '关键词重扫任务已启动');
});
router.post('/jobs/:id/retry', async (ctx) => {
  if (!requireRescanPermission(ctx)) return;
  const result = await retryKeywordRescanFailures(Number(ctx.params.id));
  if (!result) return ctx.fail('任务不存在', 404);
  ctx.success(result, result.existing ? '已有关键词重扫任务正在执行' : '失败项重试已启动');
});

export default router;
