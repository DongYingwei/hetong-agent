import request from '../utils/request';
import type { ApiResponse, PageResult, User } from '../types';

export const userApi = {
  /**
   * 分页获取用户列表
   */
  getList(params: { page?: number; pageSize?: number; keyword?: string; phone?: string; status?: number }): Promise<ApiResponse<PageResult<User>>> {
    return request.get('/user/list', { params });
  },

  /**
   * 创建新用户
   */
  create(data: Partial<User> & { password?: string }): Promise<ApiResponse<null>> {
    return request.post('/user/create', data);
  },

  /**
   * 修改用户信息
   */
  update(data: Partial<User> & { password?: string }): Promise<ApiResponse<null>> {
    return request.put('/user/update', data);
  },

  /**
   * 重置密码为 howso123
   */
  resetPassword(id: number): Promise<ApiResponse<null>> {
    return request.put('/user/reset-password', { id });
  },

  /**
   * 软删除用户
   */
  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/user/delete/${id}`);
  },
};
