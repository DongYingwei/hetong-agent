import request from '../utils/request';
import type { ApiResponse } from '../types';

export const homepageApi = {
  getList(): Promise<ApiResponse<any[]>> {
    return request.get('/homepage/list');
  },
  create(data: any): Promise<ApiResponse<null>> {
    return request.post('/homepage/create', data);
  },
  update(data: any): Promise<ApiResponse<null>> {
    return request.put('/homepage/update', data);
  },
  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/homepage/delete/${id}`);
  },
};
