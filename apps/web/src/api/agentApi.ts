import request from '../utils/request';
import type { ApiResponse } from '../types';

export const agentApi = {
  /**
   * 调用后端 DeepSeek AI 智能体服务对话
   */
  chat(data: { message: string; history?: { role: string; content: string }[] }): Promise<ApiResponse<{ content: string }>> {
    return request.post('/agent/chat', data);
  },
};
