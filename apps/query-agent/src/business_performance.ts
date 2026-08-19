import pg from 'pg';

type Params = { year: number; keyword?: string; assessment_line?: string };
let contractPool: pg.Pool | null = null;
let orderPool: pg.Pool | null = null;

function contracts() {
  if (!contractPool) contractPool = new pg.Pool({ connectionString: process.env.PG_READONLY_URL, max: 2 });
  return contractPool;
}
function orders() {
  if (!orderPool) orderPool = new pg.Pool({ connectionString: process.env.PG_ORDER_READONLY_URL, max: 2 });
  return orderPool;
}
function matchesKeywordSql(alias: string, keyword: string | undefined, paramNo: number) {
  if (!keyword || keyword === 'AI') return { sql: `${alias}.tag_ai=1`, params: [] as string[] };
  return { sql: `${alias}.tag_ai=1 AND ${alias}.ai_keywords::text ILIKE $${paramNo}`, params: [`%${keyword}%`] };
}

/** 只读、可复核的“单项合同 + 已关联框架订单”统计；金额计算永不交给模型。 */
export default {
  name: 'business_performance_query',
  description: '查询混合业务金额。仅用于“业务/业绩/框架合同与订单”等混合统计；按已确认合同订单关联去重，返回单项合同、框架订单、按考核线汇总和数据质量提示。',
  parameters: {
    type: 'object', properties: {
      year: { type: 'number', description: '统计年份；单项合同按签订年份，订单按开始日期（缺失回退创建日期）' },
      keyword: { type: 'string', description: 'AI 或关键词管理中的具体关键词；缺省为 AI' },
      assessment_line: { type: 'string', description: '可选考核线' },
    }, required: ['year'], additionalProperties: false,
  },
  execute: async (_id: string, p: Params) => {
    const keyword = p.keyword || 'AI';
    const cFilter = matchesKeywordSql('c', keyword, 2);
    const singleParams: unknown[] = [p.year, ...cFilter.params];
    let singleWhere = `c.sign_year=$1 AND c.contract_type='单项合同' AND ${cFilter.sql}`;
    if (p.assessment_line) { singleParams.push(p.assessment_line); singleWhere += ` AND c.assessment_line=$${singleParams.length}`; }
    const single = (await contracts().query(`SELECT c.id,c.contract_no,c.contract_name,c.assessment_line,c.amount FROM contracts c WHERE ${singleWhere} ORDER BY c.id`, singleParams)).rows;

    const oFilter = matchesKeywordSql('o', keyword, 2);
    const orderParams: unknown[] = [p.year, ...oFilter.params];
    let orderWhere = `l.status='confirmed' AND o.delete_status=0 AND EXTRACT(YEAR FROM COALESCE(o.start_date,o.created_date))=$1 AND ${oFilter.sql}`;
    if (p.assessment_line) { orderParams.push(p.assessment_line); orderWhere += ` AND o.assessment_line=$${orderParams.length}`; }
    const linked = (await orders().query(`SELECT DISTINCT ON (o.id) l.contract_id,o.id AS order_id,o.order_no,o.project_name,o.assessment_line,o.amount,o.start_date,o.created_date FROM contract_order_links l JOIN sys_order o ON o.id=l.order_id WHERE ${orderWhere} ORDER BY o.id,l.id`, orderParams)).rows;
    const ids = [...new Set(linked.map((x: any) => Number(x.contract_id)))];
    const frameworks = ids.length ? (await contracts().query(`SELECT id,contract_no,contract_name,assessment_line FROM contracts WHERE id=ANY($1) AND contract_type='框架协议'`, [ids])).rows : [];
    const allowed = new Set(frameworks.map((x: any) => Number(x.id)));
    const frameworkOrders = linked.filter((x: any) => allowed.has(Number(x.contract_id)));
    const group = new Map<string, any>();
    for (const row of single) { const k=row.assessment_line || '未填写'; const g=group.get(k)||{assessment_line:k,single_amount:0,framework_order_amount:0,single_count:0,framework_order_count:0}; g.single_amount+=Number(row.amount||0);g.single_count++;group.set(k,g); }
    for (const row of frameworkOrders) { const k=row.assessment_line || '未填写'; const g=group.get(k)||{assessment_line:k,single_amount:0,framework_order_amount:0,single_count:0,framework_order_count:0}; g.framework_order_amount+=Number(row.amount||0);g.framework_order_count++;group.set(k,g); }
    const summary = [...group.values()].map(g => ({...g,business_amount:Number((g.single_amount+g.framework_order_amount).toFixed(2))}));
    const quality = { confirmed_links: frameworkOrders.length, pending_framework_links: 0, date_fallback_orders: frameworkOrders.filter((x:any)=>!x.start_date && x.created_date).length };
    const details = { summary, single_contracts: single, framework_orders: frameworkOrders, frameworks, quality, formula: '单项合同含关键词金额 + 已关联框架订单含关键词金额 = 含关键词业务金额' };
    return { content: [{ type: 'text', text: JSON.stringify({ group_count: summary.length, single_contracts: single.length, framework_orders: frameworkOrders.length, quality }) }], details };
  },
};
