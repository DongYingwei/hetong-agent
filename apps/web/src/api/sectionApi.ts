import request from '../utils/request';
import type { ApiResponse, ContractSection, PageResult } from '../types';

export const sectionApi = {
  getList(params: { page?: number; pageSize?: number; keyword?: string }): Promise<ApiResponse<PageResult<ContractSection>>> {
    return request.get('/section/list', { params });
  },

  create(data: Partial<ContractSection> & { sectionTitle?: string; subNames?: string; rulesDesc?: string }): Promise<ApiResponse<null>> {
    return request.post('/section/create', data);
  },

  update(data: Partial<ContractSection> & { sectionTitle?: string; subNames?: string; rulesDesc?: string }): Promise<ApiResponse<null>> {
    return request.put('/section/update', data);
  },

  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/section/delete/${id}`);
  },
};
