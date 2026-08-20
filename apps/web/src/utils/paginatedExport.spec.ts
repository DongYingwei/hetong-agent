import { describe, expect, it, vi } from 'vitest';
import { fetchAllFilteredPages } from './paginatedExport';

describe('fetchAllFilteredPages', () => {
  it('按当前筛选条件翻页读取全部结果，而非只读取当前页', async () => {
    const fetchPage = vi.fn(async (page: number, pageSize: number) => {
      const total = 205;
      const start = (page - 1) * pageSize;
      return {
        list: Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, index) => start + index + 1),
        total,
      };
    });

    const rows = await fetchAllFilteredPages(fetchPage, 100);

    expect(rows).toHaveLength(205);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3, 100);
  });

  it('后端空页但总数未达到时终止，避免无限请求', async () => {
    const fetchPage = vi.fn(async () => ({ list: [] as number[], total: 10 }));

    await expect(fetchAllFilteredPages(fetchPage, 100)).rejects.toThrow('导出分页数据不完整');
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
