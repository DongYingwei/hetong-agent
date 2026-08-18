import request from '../utils/request';
import type { ApiResponse, PageResult, OrderLedger } from '../types';

export const orderApi = {
  // 获取订单台账列表
  getList(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    roleAi?: string;
    serviceAi?: string;
    techAi?: string;
    staffAi?: string;
    roleKeywords?: string; serviceKeywords?: string; techKeywords?: string; staffKeywords?: string;
  }): Promise<ApiResponse<PageResult<OrderLedger>>> {
    return request.get('/order/list', { params });
  },

  // 获取单个订单详情
  getDetail(id: number): Promise<ApiResponse<OrderLedger>> {
    return request.get(`/order/detail/${id}`);
  },

  // 更新订单AI关键词
  updateKeywords(id: number, keywords: string[]): Promise<ApiResponse<any>> {
    return request.post(`/order/update-keywords`, { id, keywords });
  },

  update(id: number, data: Partial<OrderLedger>): Promise<ApiResponse<{ id: number }>> {
    return request.put(`/order/detail/${id}`, data);
  },
};
