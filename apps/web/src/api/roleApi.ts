import request from '../utils/request';
import type { ApiResponse } from '../types';

export const roleApi = {
  getList(): Promise<ApiResponse<any[]>> {
    return request.get('/role/list');
  },
  create(data: any): Promise<ApiResponse<null>> {
    return request.post('/role/create', data);
  },
  update(data: any): Promise<ApiResponse<null>> {
    return request.put('/role/update', data);
  },
  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/role/delete/${id}`);
  },
  getMenus(id: number): Promise<ApiResponse<{ menuIds: number[] }>> {
    return request.get(`/role/${id}/menus`);
  },
  saveMenus(id: number, menuIds: number[]): Promise<ApiResponse<{ roleId: number; menuIds: number[] }>> {
    return request.put(`/role/${id}/menus`, { menuIds });
  },
};
