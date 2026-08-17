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
export interface KeywordRescanJob {
  id: number; scope: 'contract' | 'order' | 'all'; status: string; requested_by: string;
  total_count: number; success_count: number; skipped_count: number; failed_count: number;
  queued_count?: number; running_count?: number; started_at?: string; finished_at?: string;
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

  getRescanJobs(): Promise<ApiResponse<{ list: KeywordRescanJob[] }>> { return request.get('/keyword-rescan/jobs'); },
  startRescan(data: { scope: 'contract' | 'order' | 'all'; overwrite_manual: boolean }): Promise<ApiResponse<{ existing: boolean; job: KeywordRescanJob }>> { return request.post('/keyword-rescan/jobs', data); },
  retryRescan(id: number): Promise<ApiResponse<{ existing: boolean; job: KeywordRescanJob }>> { return request.post(`/keyword-rescan/jobs/${id}/retry`); },
  getRescanFailures(id: number): Promise<ApiResponse<{ list: Array<{ entity_type: string; entity_no: string; error_message: string }> }>> { return request.get(`/keyword-rescan/jobs/${id}/failures`); },
};
