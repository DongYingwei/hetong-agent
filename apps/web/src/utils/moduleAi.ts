type ModuleHit = { module_key: string; hit: number };

/** 将页面上配置驱动的模块选择序列化为网关筛选协议。 */
export function buildModuleFilters(
  filters: Record<string, string>,
  keywordTerms: Map<string, string[]>,
): string {
  const selected = Object.entries(filters)
    .filter(([, keyword]) => Boolean(keyword))
    .map(([module_key, keyword]) => ({
      module_key,
      keywords: keywordTerms.get(keyword) || [keyword],
    }));
  return JSON.stringify(selected);
}

/** 台账列表不泄露原文或关键词；命中仅以 AI 标记呈现。 */
export function hasModuleAiHit(row: { module_hits?: ModuleHit[] }, moduleKey: string): boolean {
  return row.module_hits?.some((item) => item.module_key === moduleKey && Number(item.hit) === 1) || false;
}
