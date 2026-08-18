import request from '../utils/request';
import type { ApiResponse, PageResult } from '../types';

export type ContractOrderLink = { id: number; source_contract_no: string; source_order_no: string; status: 'draft' | 'confirmed' | 'invalid'; link_method: string; confirmed_by?: string; confirmed_at?: string; note?: string; contract?: { contract_name: string; contract_type: string } | null };
export const contractOrderLinkApi = {
  list(params: { page?: number; pageSize?: number; keyword?: string } = {}): Promise<ApiResponse<PageResult<ContractOrderLink>>> { return request.get('/contract-order-links/list', { params }); },
  save(data: { contract_no: string; order_no: string; status?: string; note?: string }): Promise<ApiResponse<ContractOrderLink>> { return request.post('/contract-order-links', data); },
  import(rows: Array<{ contract_no: string; order_no: string; status?: string; note?: string }>): Promise<ApiResponse<{ succeeded: ContractOrderLink[]; failed: unknown[] }>> { return request.post('/contract-order-links/import', { rows }); },
  updateStatus(id: number, data: { status: string; note?: string }): Promise<ApiResponse<ContractOrderLink>> { return request.put(`/contract-order-links/${id}/status`, data); },
};
