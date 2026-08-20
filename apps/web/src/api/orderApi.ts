import request from "../utils/request";
import type { ApiResponse, PageResult, OrderLedger } from "../types";

export const orderApi = {
  // 获取订单台账列表
  getList(params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    moduleFilters?: string;
  }): Promise<ApiResponse<PageResult<OrderLedger>>> {
    return request.get("/order/list", { params });
  },

  // 获取单个订单详情
  getDetail(id: number): Promise<ApiResponse<OrderLedger>> {
    return request.get(`/order/detail/${id}`);
  },

  /** 保存四模块关键词解析结果；关键词必须来自关键词管理的启用项。 */
  updateModuleHits(id: number, module_hits: Array<{ module_key: string; keywords: string[] }>): Promise<ApiResponse<{ id: number; tag_ai: number }>> {
    return request.put(`/order/detail/${id}/module-hits`, { module_hits });
  },

  update(
    id: number,
    data: Partial<OrderLedger>,
  ): Promise<ApiResponse<{ id: number }>> {
    return request.put(`/order/detail/${id}`, data);
  },
};
