import request from '../utils/request';
import type { ApiResponse, User } from '../types';

export const authApi = {
  /**
   * 用户登录
   */
  login(data: { username: string; password: string }): Promise<ApiResponse<{ token: string; user: User }>> {
    return request.post('/auth/login', data);
  },

  /**
   * 获取当前登录用户信息
   */
  getUserInfo(): Promise<ApiResponse<User>> {
    return request.get('/auth/info');
  },
};
