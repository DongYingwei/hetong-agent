import Router from '@koa/router';
import { randomUUID } from 'node:crypto';
import { chat } from '../services/agentService.js';
import { query, queryRead } from '../config/db.js';
import { classifySearch, harnessInstruction } from '../services/searchHarness.js';

const router = new Router({ prefix: '/api/agent' });

const CONTRACT_COLUMNS = `
  c.id, c.contract_no, c.assessment_line, c.bid_no, c.related_main_no, c.framework_alias,
  c.customer_name, c.contract_name, c.customer_contract_no, c.signing_entity, c.contract_type,
  c.sign_date, c.start_date, c.end_date, c.amount, c.amount_type, c.tax_rate,
  c.settlement_terms, c.post_eval, c.deposit_amount, c.deposit_refund, c.arbitration,
  c.authorizer, c.status, c.expiry_warning, c.tag_ai`;

function mapContract(row) {
  return {
    ...row,
    has_ai_keyword: row.tag_ai ?? 0,
    contract_status: 2,
    verify_status: 1,
    warning_status: row.expiry_warning ? 1 : 0,
  };
}

function stripInternalSql(content) {
  return String(content || '')
    .replace(/<details>\s*<summary>查看 SQL<\/summary>[\s\S]*?<\/details>/gi, '')
    .replace(/```sql[\s\S]*?```/gi, '')
    .trim();
}

function collectContractRefs(result) {
  const ids = [];
  const nos = [];
  const addId = (value) => {
    const id = Number(value);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  };
  const addNo = (value) => {
    const no = String(value || '').trim();
    if (no && !nos.includes(no)) nos.push(no);
  };
  for (const row of result.tableData || []) {
    if (row && typeof row === 'object') {
      addId(row.id ?? row.contract_id);
      addNo(row.contract_no);
    }
  }
  for (const citation of result.citations || []) {
    addId(citation.contract_id);
    addNo(citation.contract_no);
  }
  return { ids, nos };
}

async function loadContracts(refs) {
  if (refs.ids.length === 0 && refs.nos.length === 0) return [];
  const rows = await queryRead(
    `SELECT ${CONTRACT_COLUMNS},
            COALESCE(jsonb_agg(jsonb_build_object(
              'module_key', cm.module_key, 'hit', cm.hit, 'keywords', cm.keywords,
              'category', cm.category, 'raw_text', cm.raw_text
            ) ORDER BY cm.module_key) FILTER (WHERE cm.id IS NOT NULL), '[]'::jsonb) AS module_hits
       FROM contracts c
       LEFT JOIN contract_module_hits cm ON cm.contract_id=c.id
      WHERE c.id = ANY($1::bigint[]) OR c.contract_no = ANY($2::text[])
      GROUP BY c.id`,
    [refs.ids, refs.nos],
  );
  const mapped = rows.map(mapContract);
  const byId = new Map(mapped.map((row) => [Number(row.id), row]));
  const byNo = new Map(mapped.map((row) => [row.contract_no, row]));
  const ordered = [];
  for (const id of refs.ids) {
    const row = byId.get(id);
    if (row && !ordered.some((item) => item.id === row.id)) ordered.push(row);
  }
  for (const no of refs.nos) {
    const row = byNo.get(no);
    if (row && !ordered.some((item) => item.id === row.id)) ordered.push(row);
  }
  return ordered;
}

function summarizeContracts(contracts, kind) {
  const withAmount = contracts.filter((item) => item.amount !== null && item.amount !== undefined && item.amount !== '');
  const totalAmount = withAmount.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    scope: kind === 'rag' ? '当前检索结果汇总' : '合同台账汇总',
    contract_count: contracts.length,
    total_amount: Number(totalAmount.toFixed(2)),
    missing_amount_count: contracts.length - withAmount.length,
  };
}

function buildProcess(raw, contracts) {
  const hasSql = Array.isArray(raw.tableData) && raw.tableData.length > 0;
  const hasRag = Array.isArray(raw.citations) && raw.citations.length > 0;
  const steps = [];
  if (hasRag) {
    steps.push({ label: '识别为合同正文检索', status: 'done' });
    steps.push({ label: `已检索并精排相关正文片段（${raw.citations.length} 条）`, status: 'done' });
  }
  if (hasSql) steps.push({ label: hasRag ? '已按台账条件筛选候选合同' : '已查询合同台账条件', status: 'done' });
  if (contracts.length > 0) steps.push({ label: `已匹配 ${contracts.length} 份合同并汇总合同金额`, status: 'done' });
  if (steps.length === 0) steps.push({ label: '未检索到可验证的合同依据', status: 'done' });
  return steps;
}

async function ownSession(sessionId, userId) {
  const rows = await query(
    'SELECT id, title, created_at, updated_at FROM agent_sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [sessionId, userId],
  );
  return rows[0] || null;
}

async function createSession(userId, title = '新检索会话') {
  const id = randomUUID();
  await query('INSERT INTO agent_sessions(id, user_id, title) VALUES (?, ?, ?)', [id, userId, title]);
  return { id, title };
}

async function historyForAgent(sessionId) {
  const rows = await query('SELECT role, content, result_data FROM agent_messages WHERE session_id = ? ORDER BY id ASC', [sessionId]);
  const recent = rows.slice(-20); // 最近 10 轮完整上下文
  const older = rows.slice(0, -20);
  const summaryRefs = older.flatMap((row) => row.result_data?.contracts || []).slice(-20)
    .map((item) => `${item.id}:${item.contract_no}`);
  const compact = summaryRefs.length ? [{ role: 'assistant', content: `[较早会话摘要：已检索合同 ${[...new Set(summaryRefs)].join('、')}]` }] : [];
  return [...compact, ...recent].map((row) => {
    let content = row.content;
    if (row.role === 'assistant' && row.result_data?.contracts?.length) {
      const refs = row.result_data.contracts.map((item) => `${item.id}:${item.contract_no}`).join('、');
      content += `\n[会话上下文：上一轮结果合同为 ${refs}]`;
    }
    return { role: row.role, content };
  });
}

router.get('/health', async (ctx) => {
  ctx.success({ status: 'ok' }, 'Contract Assistant Agent is ready');
});

router.get('/sessions', async (ctx) => {
  const rows = await query(
    `SELECT s.id, s.title, s.created_at, s.updated_at,
            (SELECT count(*) FROM agent_messages m WHERE m.session_id=s.id) AS message_count
       FROM agent_sessions s WHERE s.user_id=? AND s.deleted_at IS NULL
      ORDER BY s.updated_at DESC LIMIT 100`,
    [ctx.state.user.id],
  );
  ctx.success({ list: rows });
});

router.post('/sessions', async (ctx) => {
  const session = await createSession(ctx.state.user.id, String(ctx.request.body?.title || '新检索会话').slice(0, 200));
  ctx.success(session, '已创建新会话');
});

router.get('/sessions/:id', async (ctx) => {
  const session = await ownSession(ctx.params.id, ctx.state.user.id);
  if (!session) return ctx.fail('检索会话不存在', 404);
  const messages = await query('SELECT id, role, content, result_data, created_at FROM agent_messages WHERE session_id=? ORDER BY id ASC', [session.id]);
  ctx.success({ session, messages });
});

router.delete('/sessions/:id', async (ctx) => {
  const result = await query('UPDATE agent_sessions SET deleted_at=now() WHERE id=? AND user_id=? AND deleted_at IS NULL RETURNING id', [ctx.params.id, ctx.state.user.id]);
  if (result.length === 0) return ctx.fail('检索会话不存在', 404);
  ctx.success(null, '会话已删除');
});

router.delete('/sessions', async (ctx) => {
  await query('UPDATE agent_sessions SET deleted_at=now() WHERE user_id=? AND deleted_at IS NULL', [ctx.state.user.id]);
  ctx.success(null, '检索历史已清空');
});

router.post('/chat', async (ctx) => {
  const { message, sessionId } = ctx.request.body || {};
  if (!message || !String(message).trim()) return ctx.fail('消息内容不能为空', 400);
  const userId = ctx.state.user.id;
  let session = sessionId ? await ownSession(sessionId, userId) : null;
  if (!session) session = await createSession(userId, String(message).trim().slice(0, 80));

  const history = await historyForAgent(session.id);
  await query('INSERT INTO agent_messages(session_id, role, content) VALUES (?, ?, ?)', [session.id, 'user', String(message).trim()]);
  const decision = classifySearch(message);
  if (decision.kind === 'reject' || decision.kind === 'ambiguous' || decision.kind === 'order-unavailable') {
    const response = { content: decision.reason, contracts: [], summary: summarizeContracts([], 'sql'), citations: [], process: [{ label: decision.kind === 'reject' ? '已识别为非检索问题' : '已识别检索对象', status: 'done' }] };
    await query('INSERT INTO agent_messages(session_id, role, content, result_data) VALUES (?, ?, ?, ?)', [session.id, 'assistant', response.content, JSON.stringify(response)]);
    return ctx.success({ sessionId: session.id, ...response });
  }
  const result = await chat(String(message).trim(), history, harnessInstruction(decision.kind));
  if (!result.success) return ctx.fail(result.error || '智能体处理失败', result.code || 500);

  const contracts = await loadContracts(collectContractRefs(result));
  const response = {
    content: stripInternalSql(result.content),
    contracts,
    summary: summarizeContracts(contracts, result.citations?.length ? 'rag' : 'sql'),
    citations: result.citations || [],
    process: buildProcess(result, contracts),
  };
  await query('INSERT INTO agent_messages(session_id, role, content, result_data) VALUES (?, ?, ?, ?)',
    [session.id, 'assistant', response.content || '未检索到可靠合同依据。', JSON.stringify(response)]);
  await query('UPDATE agent_sessions SET title=CASE WHEN title=? THEN ? ELSE title END, updated_at=now() WHERE id=?',
    ['新检索会话', String(message).trim().slice(0, 80), session.id]);
  ctx.success({ sessionId: session.id, ...response });
});

export default router;
