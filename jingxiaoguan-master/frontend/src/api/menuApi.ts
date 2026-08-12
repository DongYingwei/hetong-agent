import request from '../utils/request';
import type { ApiResponse } from '../types';

export const menuApi = {
  getList(): Promise<ApiResponse<any[]>> {
    return request.get('/menu/list');
  },
  create(data: any): Promise<ApiResponse<null>> {
    return request.post('/menu/create', data);
  },
  update(data: any): Promise<ApiResponse<null>> {
    return request.put('/menu/update', data);
  },
  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/menu/delete/${id}`);
  },
};
