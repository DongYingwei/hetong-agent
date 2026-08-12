import request from '../utils/request';
import type { ApiResponse } from '../types';

export const departmentApi = {
  getList(): Promise<ApiResponse<any[]>> {
    return request.get('/department/list');
  },
  create(data: any): Promise<ApiResponse<null>> {
    return request.post('/department/create', data);
  },
  update(data: any): Promise<ApiResponse<null>> {
    return request.put('/department/update', data);
  },
  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/department/delete/${id}`);
  },
};
