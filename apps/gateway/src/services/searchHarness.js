// 综合检索 Harness：在模型调用前确定对象和允许能力，防止跨台账/无关提问。
// “AI关键词”适用于合同和订单，不能作为合同对象判断条件，否则“含 AI 关键词的订单”会被误判为跨台账。
const CONTRACT = /合同|协议|合同号|HSKJ\/?C|甲方|乙方|签约|结算|条款|仲裁|履约/i;
const ORDER = /订单|order|订单号|项目号|ARP|ASP/i;
const BODY = /原文|条款怎么写|具体内容|相关内容|类似|相似|语义|RAG|知识库|大模型|智能运维/i;
const OFF_TOPIC = /天气|新闻|股票|写代码|写报告|翻译|旅游|菜谱|电影|笑话/i;

export function classifySearch(message) {
  const text = String(message || '').trim();
  const contract = CONTRACT.test(text);
  const order = ORDER.test(text);
  if (!text || OFF_TOPIC.test(text) && !contract && !order) return { kind: 'reject', reason: '综合检索仅支持合同台账、订单台账及合同正文检索。' };
  if (contract && order) return { kind: 'ambiguous', reason: '请明确要查询“合同”还是“订单”；两类台账不会混合检索或合计。' };
  if (order) return { kind: 'order-sql', reason: '' };
  if (!contract) return { kind: 'ambiguous', reason: '请明确要查询“合同”还是“订单”，例如“含 AI 关键词的合同总金额”。' };
  return { kind: BODY.test(text) ? 'contract-rag' : 'contract-sql', reason: '' };
}

export function harnessInstruction(kind) {
  if (kind === 'contract-rag') return 'Harness 已判定：仅允许合同正文 RAG（vector_search），不得查询订单或编造台账统计。';
  if (kind === 'order-sql') return 'Harness 已判定：仅允许订单台账 SQL（sql_query 的 source=orders）；必须返回每份候选订单的 id、order_no 明细，不得查询合同或按金额类型分组。';
  return 'Harness 已判定：仅允许合同台账 SQL（sql_query）；必须返回合同 id、contract_no 的明细，不得查询订单或按金额类型分组。';
}
