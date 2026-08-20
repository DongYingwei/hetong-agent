/**
 * 以当前筛选条件逐页读取台账结果。
 * 导出不能复用列表当前页的数据，否则用户看到的筛选结果会被静默截断。
 */
export async function fetchAllFilteredPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<{ list: T[]; total: number }>,
  pageSize = 200,
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  let total = 0;

  do {
    const result = await fetchPage(page, pageSize);
    total = result.total;
    if (total > rows.length && result.list.length === 0) {
      throw new Error('导出分页数据不完整，请稍后重试');
    }
    rows.push(...result.list);
    page += 1;
  } while (rows.length < total);

  return rows;
}
