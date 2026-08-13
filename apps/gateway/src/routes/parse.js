import Router from '@koa/router';
import fs from 'node:fs';
import { config } from '../config/index.js';

/**
 * 解析侧代理路由 —— 前端上传 PDF / 读草稿 / 核对入库，全经网关转发到解析 FastAPI。
 *
 * 链路：① 上传 PDF → POST /parse（同步解析→草稿，回带 draft 字段供核对页展示）
 *       ② 核对页拉草稿 → GET /draft/:id
 *       ③ 人工核对提交 → POST /confirm/:id（入正式库 + 建向量）
 *
 * 解析同步等待，超时给足（config.parse.timeoutMs，大 PDF 的 MinerU 可能数分钟）。
 * PARSE_URL 未配置时用默认 127.0.0.1:8100。
 */
const router = new Router({ prefix: '/api/parse' });

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// ① 上传 PDF → 解析入草稿
router.post('/upload', async (ctx) => {
  const files = ctx.request.files;
  const file = files ? (files.file || files.upload) : null;
  if (!file) return ctx.fail('未接收到上传的 PDF 文件', 400);

  const originalName = file.originalFilename || file.newFilename || 'contract.pdf';
  if (!originalName.toLowerCase().endsWith('.pdf')) {
    return ctx.fail('仅接受 PDF 文件', 400);
  }

  // 读临时文件 → 组 multipart 转发到解析侧 /parse
  const buf = fs.readFileSync(file.filepath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'application/pdf' }), originalName);

  const force = ctx.query.force === 'true' || ctx.query.force === '1';
  const { signal, clear } = withTimeout(config.parse.timeoutMs);
  try {
    const resp = await fetch(`${config.parse.url}/parse?force=${force}`, { method: 'POST', body: form, signal });
    clear();
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return ctx.fail(data.detail?.error || `解析失败(${resp.status})`, 502);
    }
    // 透传 draft_id + draft 字段（前端拿去跳核对页）
    ctx.success(data, '解析完成，已入草稿待核对');
  } catch (e) {
    clear();
    const aborted = e.name === 'AbortError';
    return ctx.fail(aborted ? '解析超时' : `解析服务调用失败: ${e.message}`, aborted ? 504 : 502);
  } finally {
    try { fs.unlinkSync(file.filepath); } catch { /* noop */ }
  }
});

// ② 读草稿全字段（核对页展示）
router.get('/draft/:id', async (ctx) => {
  const { signal, clear } = withTimeout(30000);
  try {
    const resp = await fetch(`${config.parse.url}/draft/${ctx.params.id}`, { signal });
    clear();
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return ctx.fail(data.detail || '草稿不存在', resp.status === 404 ? 404 : 502);
    ctx.success(data);
  } catch (e) {
    clear();
    return ctx.fail(`读草稿失败: ${e.message}`, 502);
  }
});

// ③ 人工核对入库 + 建向量
router.post('/confirm/:id', async (ctx) => {
  const body = ctx.request.body || {};
  const { signal, clear } = withTimeout(config.parse.timeoutMs);
  try {
    const resp = await fetch(`${config.parse.url}/confirm/${ctx.params.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overrides: body.overrides || {},
        confirmed_by: ctx.state.user?.username || 'web-verify',
      }),
      signal,
    });
    clear();
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return ctx.fail(data.detail || `核对入库失败(${resp.status})`, resp.status === 404 ? 404 : 502);
    ctx.success(data, `核对入库成功，建向量 ${data.chunks} 个片段`);
  } catch (e) {
    clear();
    const aborted = e.name === 'AbortError';
    return ctx.fail(aborted ? '核对入库超时' : `核对服务调用失败: ${e.message}`, aborted ? 504 : 502);
  }
});

export default router;
