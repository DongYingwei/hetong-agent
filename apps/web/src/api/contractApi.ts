import request from '../utils/request';
import type { ApiResponse, ContractLedger, PageResult } from '../types';

export const contractApi = {
  /**
   * 分页获取合同台账列表
   */
  getList(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    contractStatus?: number | string;
    contractType?: number | string;
    hasAiKeyword?: number | string;
    verifyStatus?: number | string;
    moduleKey?: string;
    moduleKeyword?: string;
    roleAi?: string; serviceAi?: string; techAi?: string; staffAi?: string;
  }): Promise<ApiResponse<PageResult<ContractLedger>>> {
    return request.get('/contract/list', { params });
  },

  /**
   * 获取单个合同详情与历史履约记录
   */
  getDetail(id: number): Promise<ApiResponse<{ contract: ContractLedger; history: any[] }>> {
    return request.get(`/contract/detail/${id}`);
  },

  /** 获取查询库实际启用的合同模块（用于动态筛选与命中列）。 */
  getModules(): Promise<ApiResponse<{ list: ContractModule[] }>> {
    return request.get('/contract/modules');
  },

  /**
   * 执行 AI 智能核对
   */
  verify(id: number): Promise<ApiResponse<null>> {
    return request.post(`/contract/verify/${id}`);
  },

  /**
   * 删除合同台账
   */
  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/contract/delete/${id}`);
  },

  getKeywordHits(id: number): Promise<ApiResponse<{ list: ContractKeywordHit[] }>> {
    return request.get(`/contract/${id}/keyword-hits`);
  },

  /** 原始 PDF 需带登录令牌请求，再由页面生成本地预览 URL。 */
  getOriginalPdfUrl(id: number, sourceId?: number): string {
    const port = import.meta.env.VITE_API_PORT || '3002';
    const suffix = sourceId ? `?sourceId=${encodeURIComponent(sourceId)}` : '';
    return `http://${window.location.hostname}:${port}/api/contract/${id}/original-pdf${suffix}`;
  },

  getSourceFiles(id: number): Promise<ApiResponse<{ list: Array<{ id: number; name: string; role: string }> }>> {
    return request.get(`/contract/${id}/source-files`);
  },

  saveKeywordOverride(id: number, data: { module_key: string; keyword_id: number; action: 'include' | 'exclude' }): Promise<ApiResponse<unknown>> {
    return request.put(`/contract/${id}/keyword-overrides`, data);
  },
};

export interface ContractModule {
  module_key: string;
  name: string;
  anchor_names?: string[];
  recognition_rule?: string | null;
  sort_order?: number;
}

export interface ContractKeywordHit {
  module_key: string | null;
  keyword_id: number;
  keyword_name: string;
  matched_term: string | null;
  paragraph_no: number | null;
  paragraph_text: string | null;
  source: 'automatic' | 'manual';
  override?: 'include' | 'exclude' | null;
}
