import Router from '@koa/router';
import { randomUUID } from 'node:crypto';
import { chat } from '../services/agentService.js';
import { query, queryRead } from '../config/db.js';
import { classifySearch, harnessInstruction, MAX_SEARCH_MESSAGE_CHARS } from '../services/searchHarness.js';
import { constraintsInstruction, extractSearchConstraints, filterRecordsByConstraints } from '../services/searchConstraints.js';
import { mapContractLedgerRow } from '../services/contractLedgerMapping.js';

const router = new Router({ prefix: '/api/agent' });
const SESSION_RETENTION_DAYS = 30;

const CONTRACT_COLUMNS = `
  c.id, c.contract_no, c.assessment_line, c.bid_no, c.related_main_no, c.framework_alias,
  c.customer_name, c.contract_name, c.customer_contract_no, c.signing_entity, c.contract_type,
  c.sign_date, c.start_date, c.end_date, c.amount, c.amount_type, c.tax_rate,
  c.settlement_terms, c.post_eval, c.deposit_amount, c.deposit_refund, c.arbitration,
  c.authorizer, c.status, c.expiry_warning, c.tag_ai`;

function stripInternalSql(content) {
  return String(content || '')
    .replace(/<details>\s*<summary>查看 SQL<\/summary>[\s\S]*?<\/details>/gi, '')
    .replace(/```sql[\s\S]*?```/gi, '')
    .trim();
}

function collectRefs(result, entity) {
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
      addId(row.id ?? (entity === 'contract' ? row.contract_id : row.order_id));
      addNo(entity === 'contract' ? row.contract_no : row.order_no);
    }
  }
  for (const citation of result.citations || []) {
    if (entity === 'contract') {
      addId(citation.contract_id);
      addNo(citation.contract_no);
    }
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
            ) ORDER BY cm.module_key) FILTER (WHERE cm.id IS NOT NULL), '[]'::jsonb) AS module_hits,
            COALESCE(MAX(cr.status), 0) AS review_status
       FROM contracts c
       LEFT JOIN contract_module_hits cm ON cm.contract_id=c.id
       LEFT JOIN contract_manual_reviews cr ON cr.contract_id=c.id
      WHERE c.id = ANY($1::bigint[]) OR c.contract_no = ANY($2::text[])
      GROUP BY c.id`,
    [refs.ids, refs.nos],
  );
  const mapped = rows.map(mapContractLedgerRow);
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
  const byAmountType = new Map();
  for (const item of withAmount) {
    const type = String(item.amount_type || '未标注');
    const current = byAmountType.get(type) || { amount_type: type, contract_count: 0, total_amount: 0 };
    current.contract_count += 1;
    current.total_amount += Number(item.amount || 0);
    byAmountType.set(type, current);
  }
  return {
    scope: kind === 'rag' ? '当前检索结果汇总' : '合同台账汇总',
    contract_count: contracts.length,
    total_amount: Number(totalAmount.toFixed(2)),
    missing_amount_count: contracts.length - withAmount.length,
    amount_type_breakdown: [...byAmountType.values()].map((item) => ({ ...item, total_amount: Number(item.total_amount.toFixed(2)) })),
  };
}

async function loadOrders(refs) {
  if (refs.ids.length === 0 && refs.nos.length === 0) return [];
  const rows = await query(
    `SELECT o.*, omo.values AS manual_values
       FROM sys_order o LEFT JOIN order_manual_overrides omo ON omo.order_id=o.id
      WHERE o.delete_status=0 AND (o.id = ANY($1::bigint[]) OR o.order_no = ANY($2::text[]))`,
    [refs.ids, refs.nos],
  );
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const hits = await query(`SELECT order_id,module_key,hit,keywords,raw_text FROM order_module_hits
                              WHERE order_id = ANY($1::bigint[]) ORDER BY order_id,module_key`, [ids]);
  const byOrder = new Map();
  for (const hit of hits) byOrder.set(hit.order_id, [...(byOrder.get(hit.order_id) || []), hit]);
  const mapped = rows.map((row) => ({ ...row, ...(row.manual_values || {}), has_ai_keyword: row.tag_ai ?? 0, module_hits: byOrder.get(row.id) || [] }));
  const byId = new Map(mapped.map((row) => [Number(row.id), row]));
  const byNo = new Map(mapped.map((row) => [row.order_no, row]));
  return [...refs.ids.map((id) => byId.get(id)), ...refs.nos.map((no) => byNo.get(no))]
    .filter(Boolean).filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index);
}

function summarizeOrders(orders) {
  const withAmount = orders.filter((item) => item.amount !== null && item.amount !== undefined && item.amount !== '');
  const totalAmount = withAmount.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    scope: '订单台账汇总', order_count: orders.length,
    total_amount: Number(totalAmount.toFixed(2)), missing_amount_count: orders.length - withAmount.length,
  };
}

function buildProcess(raw, records, entity) {
  const hasSql = Array.isArray(raw.tableData) && raw.tableData.length > 0;
  const hasRag = Array.isArray(raw.citations) && raw.citations.length > 0;
  const steps = [];
  if (hasRag) {
    steps.push({ label: '识别为合同正文检索', status: 'done' });
    steps.push({ label: `已检索并精排相关正文片段（${raw.citations.length} 条）`, status: 'done' });
  }
  const label = entity === 'order' ? '订单' : '合同';
  if (hasSql) steps.push({ label: hasRag ? '已按台账条件筛选候选合同' : `已查询${label}台账条件`, status: 'done' });
  if (records.length > 0) steps.push({ label: `已匹配 ${records.length} 条${label}台账并汇总金额`, status: 'done' });
  if (steps.length === 0) steps.push({ label: `未检索到可验证的${label}依据`, status: 'done' });
  return steps;
}

function decisionProcess(kind) {
  if (kind === 'business-performance') return '已识别合同与订单混合业绩统计口径';
  if (kind === 'contract-rag') return '已识别合同原文检索需求';
  if (kind === 'order-sql') return '已识别订单台账查询条件';
  return '已识别合同台账查询条件';
}

async function ownSession(sessionId, userId) {
  const rows = await query(
    'SELECT id, title, context_summary, created_at, updated_at FROM agent_sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [sessionId, userId],
  );
  return rows[0] || null;
}

async function createSession(userId, title = '新检索会话') {
  const id = randomUUID();
  await query('INSERT INTO agent_sessions(id, user_id, title) VALUES (?, ?, ?)', [id, userId, title]);
  return { id, title };
}

function updateFactSummary(previous, message, decision, records) {
  const text = String(message || '');
  const years = [...new Set([...(previous?.years || []), ...[...text.matchAll(/20\d{2}/g)].map((m) => m[0])])].slice(-5);
  const line = text.match(/(?:考核线|客户线)[为是：:\s]*([^，。；;、\s]{1,30})/i)?.[1];
  const refs = records.slice(0, 20).map((item) => ({ id: item.id, no: item.contract_no || item.order_no })).filter((item) => item.id && item.no);
  return {
    object: decision.kind === 'order-sql' ? '订单' : decision.kind.startsWith('contract') ? '合同' : previous?.object,
    years,
    assessment_line: line || previous?.assessment_line || null,
    last_query: text.slice(0, 300),
    references: refs.length ? refs : (previous?.references || []).slice(-20),
  };
}

async function historyForAgent(session) {
  const rows = await query('SELECT role, content, result_data FROM agent_messages WHERE session_id = ? ORDER BY id ASC', [session.id]);
  const recent = rows.slice(-20); // 最近 10 轮完整上下文
  const older = rows.slice(0, -20);
  const summaryRefs = older.flatMap((row) => row.result_data?.contracts || []).slice(-20)
    .map((item) => `${item.id}:${item.contract_no}`);
  const facts = session.context_summary || {};
  const factText = Object.keys(facts).length ? `[会话事实摘要：${JSON.stringify(facts)}]` : '';
  const compactText = [factText, summaryRefs.length ? `已检索合同 ${[...new Set(summaryRefs)].join('、')}` : ''].filter(Boolean).join('；');
  const compact = compactText ? [{ role: 'assistant', content: `[较早会话摘要：${compactText}]` }] : [];
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
  await query(`UPDATE agent_sessions SET deleted_at=now()
    WHERE user_id=? AND deleted_at IS NULL AND updated_at < now() - (?::int * interval '1 day')`, [ctx.state.user.id, SESSION_RETENTION_DAYS]);
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

/** 检索命中明细按页读取：不让大结果集进入模型上下文或单次聊天响应。 */
router.get('/results/:messageId', async (ctx) => {
  const messageId = Number(ctx.params.messageId);
  const page = Math.max(Number(ctx.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(ctx.query.pageSize || 20), 1), 200);
  const rows = await query(`SELECT m.result_data FROM agent_messages m
    JOIN agent_sessions s ON s.id=m.session_id
    WHERE m.id=? AND s.user_id=? AND s.deleted_at IS NULL`, [messageId, ctx.state.user.id]);
  const resultData = rows[0]?.result_data;
  if (!resultData?.entity || !Array.isArray(resultData.record_ids)) return ctx.fail('检索结果不存在或不含台账明细', 404);
  const ids = resultData.record_ids.map(Number).filter(Number.isInteger);
  const entity = resultData.entity === 'order' ? 'order' : 'contract';
  const all = entity === 'order'
    ? await loadOrders({ ids, nos: [] })
    : await loadContracts({ ids, nos: [] });
  const start = (page - 1) * pageSize;
  ctx.success({ entity, list: all.slice(start, start + pageSize), total: all.length, page, pageSize });
});

router.post('/chat', async (ctx) => {
  const { message, sessionId } = ctx.request.body || {};
  if (!message || !String(message).trim()) return ctx.fail('消息内容不能为空', 400);
  if (String(message).trim().length > MAX_SEARCH_MESSAGE_CHARS) {
    return ctx.success({ content: `单次问题最多支持 ${MAX_SEARCH_MESSAGE_CHARS} 个字符。请拆分为“查询条件”和“输出要求”两段后再提交。`, process: [{ label: '已识别输入过长', status: 'done' }] });
  }
  const userId = ctx.state.user.id;
  let session = sessionId ? await ownSession(sessionId, userId) : null;
  if (!session) session = await createSession(userId, String(message).trim().slice(0, 80));

  const history = await historyForAgent(session);
  await query('INSERT INTO agent_messages(session_id, role, content) VALUES (?, ?, ?)', [session.id, 'user', String(message).trim()]);
  const decision = classifySearch(message);
  if (['reject', 'clarify', 'welcome', 'too-long'].includes(decision.kind)) {
    const label = decision.kind === 'welcome' ? '已识别为问候与能力咨询'
      : decision.kind === 'clarify' ? '已识别查询条件不足'
        : decision.kind === 'too-long' ? '已识别输入过长' : '已识别为超出查询范围的问题';
    const response = { content: decision.reason, entity: 'contract', records: [], contracts: [], summary: summarizeContracts([], 'sql'), citations: [], process: [{ label, status: 'done' }] };
    await query('INSERT INTO agent_messages(session_id, role, content, result_data) VALUES (?, ?, ?, ?)', [session.id, 'assistant', response.content, JSON.stringify(response)]);
    await query('UPDATE agent_sessions SET context_summary=? WHERE id=?', [JSON.stringify(updateFactSummary(session.context_summary, message, decision, [])), session.id]);
    return ctx.success({ sessionId: session.id, ...response });
  }
  const constraints = extractSearchConstraints(message);
  const modelInstruction = [harnessInstruction(decision.kind), constraintsInstruction(constraints)].filter(Boolean).join('\n');
  const result = await chat(String(message).trim(), history, modelInstruction);
  if (!result.success) return ctx.fail(result.error || '智能体处理失败', result.code || 500);

  // 混合业务统计由 CoreMind 的受控工具完成；不走自由 SQL，也不把合同与订单误混为同一台账。
  if (result.businessPerformance) {
    const business = result.businessPerformance;
    const summaryRows = Array.isArray(business.summary) ? business.summary : [];
    const response = {
      content: stripInternalSql(result.content), entity: 'business', records: summaryRows,
      tableData: summaryRows, business, contracts: [], orders: [],
      summary: { scope: '混合业务统计', contract_count: Array.isArray(business.single_contracts) ? business.single_contracts.length : 0,
        order_count: Array.isArray(business.framework_orders) ? business.framework_orders.length : 0,
        total_amount: summaryRows.reduce((sum, row) => sum + Number(row.business_amount || 0), 0), missing_amount_count: 0 },
      process: [
        { label: '识别为合同与订单混合业务统计', status: 'done' },
        { label: '已筛选单项合同和已确认关联的框架订单', status: 'done' },
        { label: '已按考核线去重汇总并生成计算过程', status: 'done' },
      ], citations: [],
    };
    const inserted = await query('INSERT INTO agent_messages(session_id, role, content, result_data) VALUES (?, ?, ?, ?) RETURNING id',
      [session.id, 'assistant', response.content || '未检索到可靠业务依据。', JSON.stringify(response)]);
    response.resultId = inserted[0]?.id;
    await query('UPDATE agent_messages SET result_data=? WHERE id=?', [JSON.stringify(response), response.resultId]);
    await query('UPDATE agent_sessions SET context_summary=? WHERE id=?', [JSON.stringify(updateFactSummary(session.context_summary, message, decision, [...(business.single_contracts || []), ...(business.framework_orders || [])])), session.id]);
    return ctx.success({ sessionId: session.id, ...response });
  }

  const entity = decision.kind === 'order-sql' ? 'order' : 'contract';
  const refs = collectRefs(result, entity);
  const candidateRecords = entity === 'order' ? await loadOrders(refs) : await loadContracts(refs);
  // SQL 是模型生成的候选集。对用户明确说出的合同台账条件做最终校验，
  // 防止模型漏写 WHERE 后把“软件”等不符合考核线的合同展示给用户。
  const records = filterRecordsByConstraints(candidateRecords, constraints);
  const content = records.length === candidateRecords.length
    ? stripInternalSql(result.content)
    : `已按您明确的台账条件复核，返回 ${records.length} 条${entity === 'order' ? '订单' : '合同'}；完整明细和金额汇总如下。`;
  const summary = entity === 'order'
    ? summarizeOrders(records)
    : summarizeContracts(records, result.citations?.length ? 'rag' : 'sql');
  const response = {
    content,
    entity,
    // 仅首屏 5 条完整台账；完整 ID 集持久化于 result_data，供展开与导出分页读取。
    records: records.slice(0, 5),
    record_ids: records.map((item) => item.id),
    contracts: entity === 'contract' ? records.slice(0, 5) : [],
    orders: entity === 'order' ? records.slice(0, 5) : [],
    summary,
    citations: result.citations || [],
    process: [{ label: decisionProcess(decision.kind), status: 'done' }, ...buildProcess(result, records, entity)],
  };
  const inserted = await query('INSERT INTO agent_messages(session_id, role, content, result_data) VALUES (?, ?, ?, ?) RETURNING id',
    [session.id, 'assistant', response.content || '未检索到可靠合同依据。', JSON.stringify(response)]);
  response.resultId = inserted[0]?.id;
  await query('UPDATE agent_messages SET result_data=? WHERE id=?', [JSON.stringify(response), response.resultId]);
  await query('UPDATE agent_sessions SET title=CASE WHEN title=? THEN ? ELSE title END, context_summary=? WHERE id=?',
    ['新检索会话', String(message).trim().slice(0, 80), JSON.stringify(updateFactSummary(session.context_summary, message, decision, records)), session.id]);
  ctx.success({ sessionId: session.id, ...response });
});

export default router;
