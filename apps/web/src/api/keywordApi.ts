import request from '../utils/request';
import type { ApiResponse, PageResult } from '../types';

export interface KeywordItem {
  id: number;
  keyword_name: string;
  sub_count: number;
  match_rules: string;
  sub_words: string[];
  status: number;
}

export const keywordApi = {
  getList(params: { page?: number; pageSize?: number; keyword?: string; status?: number | string }): Promise<ApiResponse<PageResult<KeywordItem>>> {
    return request.get('/keyword/list', { params });
  },

  create(data: { keyword_name: string; match_rules?: string; status?: number }): Promise<ApiResponse<any>> {
    return request.post('/keyword/create', data);
  },

  update(data: { id: number; keyword_name?: string; match_rules?: string; status?: number }): Promise<ApiResponse<null>> {
    return request.put('/keyword/update', data);
  },

  delete(id: number): Promise<ApiResponse<null>> {
    return request.delete(`/keyword/delete/${id}`);
  },

  addSubWord(keyword_id: number, sub_words: string | string[]): Promise<ApiResponse<null>> {
    const list = Array.isArray(sub_words) ? sub_words : [sub_words];
    return request.post('/keyword/sub/add', {
      keyword_id,
      sub_word: list[0] || '',
      sub_words: list,
    });
  },

  removeSubWord(keyword_id: number, sub_word: string): Promise<ApiResponse<null>> {
    return request.post('/keyword/sub/remove', { keyword_id, sub_word });
  },

  rescan(overwriteManual = false): Promise<ApiResponse<{ contracts: number }>> {
    return request.post('/keyword/rescan', { overwrite_manual: overwriteManual });
  },
};
