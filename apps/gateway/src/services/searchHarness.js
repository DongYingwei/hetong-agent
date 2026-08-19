// 综合检索的确定性意图门禁。它只决定是否允许进入 CoreMind，绝不生成业务答案。
// 目的：让闲聊、越权操作和超范围请求在调用模型/SQL/RAG 前被拦截。
export const MAX_SEARCH_MESSAGE_CHARS = 8000;

const CONTRACT = /合同|协议|合同号|HSKJ\/?C|甲方|乙方|签约|结算|条款|仲裁|履约/i;
const ORDER = /订单|order|订单号|项目号|ARP|ASP/i;
const RAG = /原文|条款怎么写|具体内容|相关内容|类似|相似|语义|知识库|合同正文/i;
const OFF_TOPIC = /天气|新闻|股票|写代码|写报告|翻译|旅游|菜谱|电影|笑话|诗歌|电脑推荐/i;
const GREETING = /^(你好|您好|嗨|hi|hello|你是谁|你能做什么|你可以做什么)[！!。？?\s]*$/i;
const WRITE_ACTION = /修改|编辑|删除|上传|导入|重新分析|重新解析|重扫|下载全库|导出全库/i;
const CALCULATION = /金额|合计|汇总|统计|多少|总额|占比|排名|前\s*\d+|明细/i;
const RELATION = /单项合同|框架协议|框架合同|合同.*订单|订单.*合同|框架.*订单|订单.*框架|关联订单|关联合同/i;
const POSSIBLY_RELEVANT = /查|看|查询|检索|统计|金额|项目|客户|AI|人工智能|大模型|运维|服务|技术/i;

export function welcomeMessage() {
  return '您好，我是经小管综合检索智能体。我可以查询合同台账、订单台账、AI 关键词、合同原文和业绩统计。\n\n例如：\n- 2026年签订的合同有哪些\n- 含AI关键词的合同总金额是多少\n- 技术要求中对大模型如何约定';
}

export function classifySearch(message) {
  const text = String(message || '').trim();
  if (!text) return { kind: 'clarify', reason: '请描述您要查询的合同或订单条件，例如“含 AI 关键词的合同总金额”。' };
  if (text.length > MAX_SEARCH_MESSAGE_CHARS) return { kind: 'too-long', reason: `单次问题最多支持 ${MAX_SEARCH_MESSAGE_CHARS} 个字符。请拆分为“查询条件”和“输出要求”两段后再提交。` };
  if (GREETING.test(text)) return { kind: 'welcome', reason: welcomeMessage() };

  const contract = CONTRACT.test(text);
  const order = ORDER.test(text);
  if (WRITE_ACTION.test(text)) {
    return { kind: 'reject', reason: '综合检索仅提供只读查询，不能直接修改、删除、上传、重扫或全库导出。请在对应的合同台账、订单台账或关键词管理页面完成操作。' };
  }
  // 混合业绩计算必须同时出现“合同—订单关系”与“计算意图”；“你们做什么业务”不会误入此分支。
  if (RELATION.test(text) && CALCULATION.test(text)) return { kind: 'business-performance', reason: '' };
  // 有有效合同/订单对象时，无关附带语不阻断范围内部分。
  if (OFF_TOPIC.test(text) && !contract && !order) {
    return { kind: 'reject', reason: '综合检索仅支持合同台账、订单台账、AI 关键词、合同原文和业绩统计。请描述需要查询的合同或订单条件。' };
  }
  if (contract && order) return { kind: 'clarify', reason: '请明确要查询“合同”还是“订单”。只有明确单项合同、框架协议与关联订单的业绩计算口径时，才会合并统计。' };
  if (order) return { kind: 'order-sql', reason: '' };
  if (contract) return { kind: RAG.test(text) ? 'contract-rag' : 'contract-sql', reason: '' };
  if (POSSIBLY_RELEVANT.test(text)) return { kind: 'clarify', reason: '请说明查询合同还是订单，以及要按名称、金额、年份、考核线或 AI 关键词筛选。' };
  return { kind: 'reject', reason: '我仅处理经小管中的合同、订单、AI 关键词、合同原文和业绩统计。您可以询问“2026年签订的合同有哪些”。' };
}

export function harnessInstruction(kind) {
  if (kind === 'business-performance') return 'Harness 已判定：这是混合业务统计。只允许调用 business_performance_query；不得调用 sql_query 或 vector_search，必须按已确认合同订单关联去重。';
  if (kind === 'contract-rag') return 'Harness 已判定：仅允许合同正文 RAG（vector_search），不得查询订单或编造台账统计。';
  if (kind === 'order-sql') return 'Harness 已判定：仅允许订单台账 SQL（sql_query 的 source=orders）；必须返回每份候选订单的 id、order_no 明细，不得查询合同或按金额类型分组。';
  return 'Harness 已判定：仅允许合同台账 SQL（sql_query）；必须返回合同 id、contract_no 的明细，不得查询订单或按金额类型分组。';
}
