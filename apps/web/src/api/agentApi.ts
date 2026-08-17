import request from '../utils/request';
import type { ApiResponse } from '../types';

/** 检索结果行（DB 原列，列名随 SQL 动态变化；isSummary 标记分口径合计行）。 */
export type TableRowItem = Record<string, unknown> & { isSummary?: boolean };

/** RAG 出处（vector_search fragments 的四字段 + 相关性分）。 */
export interface Citation {
  contract_id?: number;
  contract_no?: string;
  field?: string;
  content?: string;
  score?: number;
}

/** 查询智能体富格式返回（坑13 wrapper 契约）。 */
export interface AgentChatResult {
  content: string;
  sessionId: string;
  resultId?: number;
  entity?: 'contract' | 'order';
  records?: Record<string, unknown>[];
  record_ids?: number[];
  contracts?: Record<string, unknown>[];
  orders?: Record<string, unknown>[];
  summary?: { scope: string; contract_count?: number; order_count?: number; total_amount: number; missing_amount_count: number; amount_type_breakdown?: Array<{ amount_type: string; contract_count: number; total_amount: number }> };
  process?: Array<{ label: string; status: string }>;
  citations?: Citation[];
}

export interface AgentSession { id: string; title: string; created_at: string; updated_at: string; message_count: number; }

export const agentApi = {
  /**
   * 调用查询智能体（网关 /agent/chat → CoreMind HTTP wrapper）。
   */
  chat(data: { message: string; sessionId?: string }): Promise<ApiResponse<AgentChatResult>> {
    return request.post('/agent/chat', data);
  },
  getResult(id: number, params: { page?: number; pageSize?: number } = {}): Promise<ApiResponse<{ entity: 'contract' | 'order'; list: Record<string, unknown>[]; total: number; page: number; pageSize: number }>> { return request.get(`/agent/results/${id}`, { params }); },
  getSessions(): Promise<ApiResponse<{ list: AgentSession[] }>> { return request.get('/agent/sessions'); },
  getSession(id: string): Promise<ApiResponse<{ session: AgentSession; messages: Array<{ role: 'user' | 'assistant'; content: string; result_data?: AgentChatResult }> }>> { return request.get(`/agent/sessions/${id}`); },
  createSession(): Promise<ApiResponse<AgentSession>> { return request.post('/agent/sessions'); },
  deleteSession(id: string): Promise<ApiResponse<null>> { return request.delete(`/agent/sessions/${id}`); },
  clearSessions(): Promise<ApiResponse<null>> { return request.delete('/agent/sessions'); },
};
