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
  tableData?: TableRowItem[];
  sql?: string;
  citations?: Citation[];
}

export const agentApi = {
  /**
   * 调用查询智能体（网关 /agent/chat → CoreMind HTTP wrapper）。
   */
  chat(data: { message: string; history?: { role: string; content: string }[] }): Promise<ApiResponse<AgentChatResult>> {
    return request.post('/agent/chat', data);
  },
};
