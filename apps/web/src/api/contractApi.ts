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
  }): Promise<ApiResponse<PageResult<ContractLedger>>> {
    return request.get('/contract/list', { params });
  },

  /**
   * 获取单个合同详情与历史履约记录
   */
  getDetail(id: number): Promise<ApiResponse<{ contract: ContractLedger; history: any[] }>> {
    return request.get(`/contract/detail/${id}`);
  },

  /**
   * 新增/导入合同
   */
  create(data: Partial<ContractLedger>): Promise<ApiResponse<null>> {
    return request.post('/contract/create', data);
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
};
