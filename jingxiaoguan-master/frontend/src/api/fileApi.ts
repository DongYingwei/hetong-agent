import request from '../utils/request';
import type { ApiResponse, PageResult, SysFile } from '../types';

export const fileApi = {
  getList(params: { page?: number; pageSize?: number; keyword?: string }): Promise<ApiResponse<PageResult<SysFile>>> {
    return request.get('/file/list', { params });
  },

  upload(formData: FormData): Promise<ApiResponse<SysFile>> {
    return request.post('/file/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/file/delete/${id}`);
  },

  cleanup(): Promise<ApiResponse<{ cleanedCount: number }>> {
    return request.post('/file/cleanup');
  },
};
