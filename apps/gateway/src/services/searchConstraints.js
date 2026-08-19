/**
 * 综合检索中由用户明确表达、不能依赖模型遗漏的台账条件。
 *
 * 这里只收录低歧义业务别名。比如“通信”既可能是正文词也可能是行业，
 * 不在此处自动映射；需要用户说“通信行业/运营商”或明确给出考核线。
 */
const ASSESSMENT_LINE_ALIASES = [
  { value: '运营商', patterns: [/考核线\s*(?:为|是|[:：])?\s*运营商/i, /运营商(?:类|行业|客户)?(?:的|相关)?/i, /通信行业(?:的|相关)?/i] },
  { value: '汽车', patterns: [/考核线\s*(?:为|是|[:：])?\s*汽车/i, /汽车(?:类|行业|客户)?(?:的|相关)?/i, /车企(?:的|相关)?/i] },
  { value: '软件', patterns: [/考核线\s*(?:为|是|[:：])?\s*软件/i, /软件行业(?:的|相关)?/i] },
];

const MODULE_PATTERNS = [
  { moduleKey: 'service', patterns: [/服务(?:内容|标的|交付物)?[^。；，,]{0,20}(?:含有|包含|含|命中)[^。；，,]{0,12}(?:AI|人工智能)/i, /(?:AI|人工智能)[^。；，,]{0,20}服务(?:内容|标的|交付物)?/i] },
  { moduleKey: 'tech', patterns: [/技术(?:要求|条款)?[^。；，,]{0,20}(?:含有|包含|含|命中)[^。；，,]{0,12}(?:AI|人工智能)/i, /(?:AI|人工智能)[^。；，,]{0,20}技术(?:要求|条款)?/i] },
  // 项目名称的正式模块键为 role（历史名称保留，不能写成不存在的 project）。
  { moduleKey: 'role', patterns: [/项目名称[^。；，,]{0,20}(?:含有|包含|含|命中)[^。；，,]{0,12}(?:AI|人工智能)/i, /(?:AI|人工智能)[^。；，,]{0,20}项目名称/i] },
  { moduleKey: 'staff', patterns: [/人员(?:需求|要求)?[^。；，,]{0,20}(?:含有|包含|含|命中)[^。；，,]{0,12}(?:AI|人工智能)/i, /(?:AI|人工智能)[^。；，,]{0,20}人员(?:需求|要求)?/i] },
];

export function extractSearchConstraints(message) {
  const text = String(message || '').trim();
  const assessmentLine = ASSESSMENT_LINE_ALIASES
    .find((alias) => alias.patterns.some((pattern) => pattern.test(text)))?.value;
  const requiredModuleHits = MODULE_PATTERNS
    .filter((item) => item.patterns.some((pattern) => pattern.test(text)))
    .map((item) => item.moduleKey);
  return { assessmentLine, requiredModuleHits };
}

/** 合同和订单都使用 assessment_line 与 module_hits 的同一展示语义。 */
export function filterRecordsByConstraints(records, constraints) {
  return records.filter((record) => {
    if (constraints.assessmentLine && record.assessment_line !== constraints.assessmentLine) return false;
    return constraints.requiredModuleHits.every((moduleKey) =>
      Array.isArray(record.module_hits) && record.module_hits.some((hit) => hit.module_key === moduleKey && Number(hit.hit) === 1),
    );
  });
}

export function constraintsInstruction(constraints) {
  const conditions = [];
  if (constraints.assessmentLine) conditions.push(`考核线必须等于“${constraints.assessmentLine}”`);
  for (const moduleKey of constraints.requiredModuleHits) {
    const label = { service: '服务内容', tech: '技术要求', role: '项目名称', staff: '人员需求' }[moduleKey] || moduleKey;
    conditions.push(`${label}模块必须命中 AI`);
  }
  return conditions.length
    ? `Harness 已提取不可放宽的台账条件：${conditions.join('；')}。SQL 必须包含这些条件；Gateway 会在结果补全后再次校验。`
    : '';
}
